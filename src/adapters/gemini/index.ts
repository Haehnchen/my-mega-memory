import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, SessionMetadata, ParsedMessage, MessageContent } from '../../types';

// Gemini data structures
interface GeminiThought {
  subject: string;
  description: string;
  timestamp: string;
}

interface GeminiToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any[];
  status: 'success' | 'error';
  timestamp: string;
  resultDisplay?: {
    fileDiff?: string;
    fileName?: string;
    filePath?: string;
    originalContent?: string;
    newContent?: string;
    isNewFile?: boolean;
  };
  displayName?: string;
  description?: string;
}

interface GeminiTokens {
  input: number;
  output: number;
  cached: number;
  thoughts: number;
  tool: number;
  total: number;
}

interface GeminiMessage {
  id: string;
  timestamp: string;
  type: 'user' | 'gemini' | 'error' | 'info';
  content: string | Array<{ text: string }>;
  thoughts?: GeminiThought[];
  tokens?: GeminiTokens;
  model?: string;
  toolCalls?: GeminiToolCall[];
}

interface GeminiSessionData {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: GeminiMessage[];
}

export interface GeminiSessionInfo {
  sessionId: string;
  projectHash: string;
  projectName: string;
  projectPath: string;
  filePath: string;
  created: string;
  updated: string;
  messageCount: number;
}

/**
 * Gemini CLI session finder
 * Locates session files in ~/.gemini/tmp/{project}/chats/
 * Each project directory contains a .project_root file with the actual path
 */
export class GeminiSessionFinder {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.gemini', 'tmp');
  }

  /**
   * Read project path from .project_root file
   * Returns null if file doesn't exist or can't be read
   */
  private readProjectRoot(projectDir: string): string | null {
    const projectRootFile = path.join(this.baseDir, projectDir, '.project_root');
    
    if (!fs.existsSync(projectRootFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(projectRootFile, 'utf-8').trim();
      return content || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract project name from a path
   */
  private extractProjectName(projectPath: string): string {
    return path.basename(projectPath);
  }

  /**
   * List all session files across all projects
   * Discovers projects by iterating directories and reading .project_root files
   */
  listSessions(): GeminiSessionInfo[] {
    const sessions: GeminiSessionInfo[] = [];

    if (!fs.existsSync(this.baseDir)) {
      return sessions;
    }

    // Iterate over all directories in the tmp folder
    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const projectDir = entry.name;
      const projectDirPath = path.join(this.baseDir, projectDir);
      
      // Read .project_root to get the actual project path
      const projectRoot = this.readProjectRoot(projectDir);
      if (!projectRoot) {
        // Skip directories without .project_root
        continue;
      }
      
      const projectName = this.extractProjectName(projectRoot);
      const projectPath = projectRoot;
      
      // Look for chats subdirectory
      const chatsDir = path.join(projectDirPath, 'chats');
      if (!fs.existsSync(chatsDir)) continue;

      // Find all session files
      const files = fs.readdirSync(chatsDir)
        .filter(f => f.endsWith('.json') && f.startsWith('session-'));

      for (const file of files) {
        const filePath = path.join(chatsDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const session = JSON.parse(content) as GeminiSessionData;
          
          sessions.push({
            sessionId: session.sessionId,
            projectHash: session.projectHash,
            projectName,
            projectPath,
            filePath,
            created: session.startTime,
            updated: session.lastUpdated,
            messageCount: session.messages.length
          });
        } catch (e) {
          // Skip invalid session files
        }
      }
    }

    return sessions.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  }
}

/**
 * Gemini CLI session parser
 * Parses session JSON files into unified SessionDetail format
 */
export class GeminiSessionParser {

  constructor() {
  }

  /**
   * Parse a session file by path
   */
  parseFile(filePath: string): SessionDetail | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.parseContent(content);
    } catch (e) {
      console.error(`Error parsing Gemini session file ${filePath}:`, e);
      return null;
    }
  }

  /**
   * Parse session content
   */
  parseContent(content: string): SessionDetail {
    const sessionData = JSON.parse(content) as GeminiSessionData;
    const messages: ParsedMessage[] = [];
    const modelCounts = new Map<string, number>();

    for (const msg of sessionData.messages) {
      // Track model usage
      if (msg.model) {
        modelCounts.set(msg.model, (modelCounts.get(msg.model) || 0) + 1);
      }

      // Parse the message
      const parsedMessages = this.parseMessage(msg);
      messages.push(...parsedMessages);
    }

    // Sort models by usage count
    const sortedModels = Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    const metadata: SessionMetadata = {
      models: sortedModels,
      messageCount: messages.length,
      created: sessionData.startTime,
      modified: sessionData.lastUpdated
    };

    const title = this.extractTitle(sessionData.messages);

    return {
      sessionId: sessionData.sessionId,
      title,
      messages,
      metadata
    };
  }

  /**
   * Parse a single Gemini message into ParsedMessage(s)
   */
  private parseMessage(msg: GeminiMessage): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    const timestamp = msg.timestamp;

    switch (msg.type) {
      case 'user':
        messages.push(this.parseUserMessage(msg, timestamp));
        break;

      case 'gemini':
        // First add thoughts as thinking messages
        if (msg.thoughts && msg.thoughts.length > 0) {
          for (const thought of msg.thoughts) {
            messages.push({
              type: 'assistant_thinking',
              timestamp: thought.timestamp || timestamp,
              thinking: `[${thought.subject}]\n${thought.description}`
            });
          }
        }

        // Then add tool calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const toolCall of msg.toolCalls) {
            messages.push(...this.parseToolCall(toolCall, timestamp));
          }
        }

        // Finally add the text content
        if (msg.content) {
          const content = this.extractContent(msg.content);
          if (content.trim()) {
            messages.push({
              type: 'assistant_text',
              timestamp,
              content: [{ type: 'markdown', markdown: content }]
            });
          }
        }
        break;

      case 'error':
        messages.push({
          type: 'info',
          timestamp,
          title: 'error',
          content: { 
            type: 'text', 
            text: this.extractContent(msg.content) 
          },
          style: 'error'
        });
        break;

      case 'info':
        messages.push({
          type: 'info',
          timestamp,
          title: 'info',
          content: { 
            type: 'text', 
            text: this.extractContent(msg.content) 
          },
          style: 'default'
        });
        break;
    }

    return messages;
  }

  /**
   * Parse a user message
   */
  private parseUserMessage(msg: GeminiMessage, timestamp: string): ParsedMessage {
    const content = this.extractContent(msg.content);
    
    return {
      type: 'user',
      timestamp,
      content: [{ type: 'text', text: content }]
    };
  }

  /**
   * Parse a tool call into tool_use and tool_result messages
   */
  private parseToolCall(toolCall: GeminiToolCall, timestamp: string): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    const toolCallId = toolCall.id;
    const toolName = toolCall.displayName || toolCall.name || 'tool';

    // Create tool_use message
    const inputMap: Record<string, string> = {};
    if (toolCall.args) {
      for (const [key, value] of Object.entries(toolCall.args)) {
        inputMap[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }

    // Parse tool results
    const results: { output: string; isError: boolean; toolCallId?: string }[] = [];
    
    if (toolCall.result && toolCall.result.length > 0) {
      for (const result of toolCall.result) {
        if (result.functionResponse?.response?.output !== undefined) {
          const output = result.functionResponse.response.output;
          results.push({
            output: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
            isError: toolCall.status === 'error',
            toolCallId
          });
        }
      }
    }

    // Check for file diff in resultDisplay
    if (toolCall.resultDisplay?.fileDiff) {
      results.push({
        output: toolCall.resultDisplay.fileDiff,
        isError: false,
        toolCallId
      });
    }

    messages.push({
      type: 'tool_use',
      timestamp,
      toolName,
      toolCallId,
      input: inputMap,
      results
    });

    // Add tool_result for each result
    for (const result of results) {
      const outputContent: MessageContent[] = [];
      
      // Check if it's a diff
      if (result.output.includes('---') && result.output.includes('+++')) {
        outputContent.push({ type: 'diff', oldText: '', newText: result.output, filePath: toolCall.resultDisplay?.filePath });
      } else {
        outputContent.push({ type: 'code', code: result.output });
      }

      messages.push({
        type: 'tool_result',
        timestamp,
        toolName,
        toolCallId,
        output: outputContent,
        isError: result.isError
      });
    }

    return messages;
  }

  /**
   * Extract text content from message content field
   */
  private extractContent(content: string | Array<{ text: string }>): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content.map(c => c.text || '').join('\n');
    }
    
    return '';
  }

  /**
   * Extract title from first user message
   */
  private extractTitle(messages: GeminiMessage[]): string {
    // Find first user message
    const userMsg = messages.find(m => m.type === 'user');
    if (!userMsg) return 'Gemini Session';

    const content = this.extractContent(userMsg.content);
    if (!content) return 'Gemini Session';

    // Truncate if too long
    if (content.length > 100) {
      return content.slice(0, 100) + '...';
    }

    return content;
  }
}
