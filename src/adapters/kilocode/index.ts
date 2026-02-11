import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, SessionMetadata, ParsedMessage, MessageContent } from '../../types';

/**
 * Kilo CLI session finder
 * Locates sessions in ~/.kilocode/cli/ directory structure
 */
export class KiloSessionFinder {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.kilocode', 'cli');
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Lists all Kilo CLI sessions by iterating through workspace projects
   * Each project in workspace-map.json has its sessions in session.json
   */
  listSessionFiles(): Array<{ taskPath: string; taskId: string; sessionId: string; projectPath: string }> {
    const sessions: Array<{ taskPath: string; taskId: string; sessionId: string; projectPath: string }> = [];
    
    const workspaceMap = this.loadWorkspaceMap();
    if (!workspaceMap) {
      return sessions;
    }

    const tasksDir = path.join(this.baseDir, 'global', 'tasks');

    // Iterate through each project in workspace map
    for (const [projectPath, workspaceDir] of Object.entries(workspaceMap)) {
      const sessionFile = path.join(this.baseDir, 'workspaces', workspaceDir, 'session.json');
      
      if (!fs.existsSync(sessionFile)) {
        continue;
      }

      try {
        const content = fs.readFileSync(sessionFile, 'utf-8');
        const data = JSON.parse(content);
        
        // taskSessionMap contains: { taskId: sessionId, ... }
        if (data.taskSessionMap) {
          for (const [taskId, sessionId] of Object.entries(data.taskSessionMap)) {
            const taskPath = path.join(tasksDir, taskId);
            
            // Only include if task directory actually exists
            if (fs.existsSync(taskPath)) {
              sessions.push({
                taskPath,
                taskId,
                sessionId: sessionId as string,
                projectPath
              });
            }
          }
        }
      } catch (e) {
        // Skip this workspace on error
        console.error(`Error reading workspace ${workspaceDir}:`, e);
      }
    }

    return sessions;
  }

  /**
   * Load workspace-map.json which maps project paths to workspace directories
   */
  private loadWorkspaceMap(): Record<string, string> | null {
    const workspaceMapPath = path.join(this.baseDir, 'workspaces', 'workspace-map.json');
    
    if (!fs.existsSync(workspaceMapPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(workspaceMapPath, 'utf-8');
      return JSON.parse(content) as Record<string, string>;
    } catch (e) {
      console.error('Error loading workspace-map.json:', e);
      return null;
    }
  }
}

/**
 * Kilo CLI session parser
 * Parses ui_messages.json and api_conversation_history.json
 */
export class KiloSessionParser {
  private finder: KiloSessionFinder;

  constructor() {
    this.finder = new KiloSessionFinder();
  }

  /**
   * Parses a Kilo CLI session from task directory
   */
  parseSession(taskPath: string, sessionId: string | null): SessionDetail | null {
    const uiMessagesPath = path.join(taskPath, 'ui_messages.json');
    const apiHistoryPath = path.join(taskPath, 'api_conversation_history.json');
    const metadataPath = path.join(taskPath, 'task_metadata.json');

    if (!fs.existsSync(uiMessagesPath)) {
      return null;
    }

    try {
      const uiMessages = JSON.parse(fs.readFileSync(uiMessagesPath, 'utf-8'));
      const apiHistory = fs.existsSync(apiHistoryPath) 
        ? JSON.parse(fs.readFileSync(apiHistoryPath, 'utf-8')) 
        : [];
      const metadata = fs.existsSync(metadataPath)
        ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
        : {};

      const taskId = path.basename(taskPath);
      const finalSessionId = sessionId || taskId;
      
      const { messages, metadata: sessionMetadata } = this.parseContent(
        uiMessages, 
        apiHistory,
        metadata,
        taskPath
      );

      const title = this.extractTitle(uiMessages, apiHistory) || `Kilo Session ${finalSessionId.slice(0, 8)}`;

      return {
        sessionId: finalSessionId,
        title,
        messages,
        metadata: sessionMetadata
      };
    } catch (e) {
      console.error(`Error parsing Kilo session from ${taskPath}:`, e);
      return null;
    }
  }

  /**
   * Parse content from UI messages and API history
   */
  parseContent(
    uiMessages: any[], 
    apiHistory: any[],
    metadata: any,
    taskPath: string
  ): { messages: ParsedMessage[]; metadata: SessionMetadata } {
    const messages: ParsedMessage[] = [];
    let messageCount = 0;
    
    let firstTimestamp: number | null = null;
    let lastTimestamp: number | null = null;

    // Track tool uses from API history to avoid duplicates
    const apiToolCallIds = new Set<string>();

    // Process API history first for tool uses and assistant messages
    for (const apiMsg of apiHistory) {
      const timestamp = apiMsg.ts ? new Date(apiMsg.ts).toISOString() : new Date().toISOString();
      
      if (apiMsg.role === 'assistant' && apiMsg.content) {
        const content = Array.isArray(apiMsg.content) ? apiMsg.content : [apiMsg.content];
        
        for (const item of content) {
          if (typeof item === 'object' && item.type === 'tool_use') {
            // Parse tool use from API history
            const toolUse: ParsedMessage = {
              type: 'tool_use',
              timestamp,
              toolName: item.name || 'unknown',
              toolCallId: item.id,
              input: typeof item.input === 'object' ? 
                Object.entries(item.input).reduce((acc, [k, v]) => {
                  acc[k] = typeof v === 'string' ? v : JSON.stringify(v);
                  return acc;
                }, {} as Record<string, string>) : 
                { input: JSON.stringify(item.input) },
              results: []
            };
            messages.push(toolUse);
            messageCount++;
            apiToolCallIds.add(item.id);
          }
        }
      }
    }

    // Process UI messages
    for (const uiMsg of uiMessages) {
      const timestamp = uiMsg.ts;
      if (timestamp) {
        if (firstTimestamp === null) firstTimestamp = timestamp;
        lastTimestamp = timestamp;
      }

      const parsed = this.parseUiMessage(uiMsg);
      if (parsed) {
        // Skip UI tool uses that we already have from API history
        if (parsed.type === 'tool_use' && parsed.toolCallId && apiToolCallIds.has(parsed.toolCallId)) {
          continue;
        }
        messages.push(parsed);
        messageCount++;
      }
    }

    // Connect tool results to tool uses
    const finalMessages = this.connectToolResultsToToolUse(messages);

    // Extract model from API conversation history
    const model = this.extractModelFromApiHistory(apiHistory);

    const sessionMetadata: SessionMetadata = {
      version: undefined,
      gitBranch: undefined,
      cwd: this.extractWorkspace(metadata, taskPath),
      models: model ? [[model, 1]] : [],
      messageCount,
      created: firstTimestamp ? new Date(firstTimestamp).toISOString() : undefined,
      modified: lastTimestamp ? new Date(lastTimestamp).toISOString() : undefined
    };

    return { messages: finalMessages, metadata: sessionMetadata };
  }

  /**
   * Extract model from API conversation history
   * Model is stored in <environment_details> section of the first user message
   */
  private extractModelFromApiHistory(apiHistory: any[]): string | null {
    for (const msg of apiHistory) {
      if (msg.role === 'user' && msg.content) {
        // Check all text content items (not just the first one)
        if (Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.type === 'text' && item.text) {
              // Only look for model in environment_details section
              if (item.text.includes('<environment_details>')) {
                const modelMatch = item.text.match(/<model>([^<]+)<\/model>/);
                if (modelMatch) {
                  return modelMatch[1];
                }
              }
            }
          }
        } else if (typeof msg.content === 'string') {
          // Only look for model in environment_details section
          if (msg.content.includes('<environment_details>')) {
            const modelMatch = msg.content.match(/<model>([^<]+)<\/model>/);
            if (modelMatch) {
              return modelMatch[1];
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Parse a single UI message
   */
  private parseUiMessage(uiMsg: any): ParsedMessage | null {
    const timestamp = uiMsg.ts ? new Date(uiMsg.ts).toISOString() : new Date().toISOString();

    switch (uiMsg.type) {
      case 'say':
        return this.parseSayMessage(uiMsg, timestamp);
      case 'ask':
        return this.parseAskMessage(uiMsg, timestamp);
      default:
        return null;
    }
  }

  /**
   * Parse 'say' type messages
   */
  private parseSayMessage(uiMsg: any, timestamp: string): ParsedMessage | null {
    switch (uiMsg.say) {
      case 'text':
        // User text message
        return {
          type: 'user',
          timestamp,
          content: [{ type: 'text', text: uiMsg.text || '' }]
        };

      case 'reasoning':
        // Assistant thinking/reasoning
        return {
          type: 'assistant_thinking',
          timestamp,
          thinking: uiMsg.text || ''
        };

      case 'checkpoint_saved':
        // Skip checkpoint info - not conversation data
        return null;

      case 'api_req_started':
        // Skip API request started - not conversation data
        return null;

      case 'api_req_finished':
        // Skip API request finished - not conversation data
        return null;

      case 'error':
        // Error message
        return {
          type: 'info',
          timestamp,
          title: 'error',
          content: { type: 'text', text: uiMsg.text || 'Unknown error' },
          style: 'error'
        };

      default:
        // Unknown say type - skip
        return null;
    }
  }

  /**
   * Parse 'ask' type messages
   */
  private parseAskMessage(uiMsg: any, timestamp: string): ParsedMessage | null {
    switch (uiMsg.ask) {
      case 'tool':
        // Tool use
        try {
          const toolData = JSON.parse(uiMsg.text || '{}');
          const toolName = toolData.tool || 'unknown';
          const input = this.parseToolInput(toolData);

          return {
            type: 'tool_use',
            timestamp,
            toolName,
            input,
            results: []
          };
        } catch (e) {
          return {
            type: 'info',
            timestamp,
            title: 'tool_error',
            content: { type: 'text', text: `Failed to parse tool: ${uiMsg.text}` },
            style: 'error'
          };
        }

      case 'followup':
        // Follow-up question
        return {
          type: 'info',
          timestamp,
          title: 'followup',
          subtitle: 'question',
          content: { type: 'text', text: uiMsg.text || '' },
          style: 'default'
        };

      case 'command':
        // Slash command
        return {
          type: 'info',
          timestamp,
          title: 'command',
          content: { type: 'text', text: uiMsg.text || '' },
          style: 'default'
        };

      default:
        return null;
    }
  }

  /**
   * Parse tool input from tool data
   * Converts all properties except 'tool' to string values
   */
  private parseToolInput(toolData: any): Record<string, string> {
    const input: Record<string, string> = {};

    for (const [key, value] of Object.entries(toolData)) {
      if (key !== 'tool') {
        input[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }

    return input;
  }

  /**
   * Extract workspace/project path from metadata
   * Note: For Kilo CLI, project path comes from workspace mappings, not metadata
   */
  private extractWorkspace(metadata: any, taskPath: string): string | undefined {
    if (metadata.cwd) {
      return metadata.cwd;
    }

    if (metadata.files_in_context && metadata.files_in_context.length > 0) {
      const firstFile = metadata.files_in_context[0];
      if (firstFile.path) {
        return path.dirname(firstFile.path);
      }
    }

    // Return undefined - the actual project path comes from workspace mappings
    return undefined;
  }

  /**
   * Extract title from first user message
   */
  private extractTitle(uiMessages: any[], apiHistory: any[]): string | null {
    // Try UI messages first
    for (const msg of uiMessages) {
      if (msg.type === 'say' && msg.say === 'text' && msg.text) {
        const text = msg.text.trim();
        if (text) {
          return text.length > 100 ? text.slice(0, 100) + '...' : text;
        }
      }
    }

    // Fallback to API history
    for (const msg of apiHistory) {
      if (msg.role === 'user' && msg.content) {
        let text = '';
        if (Array.isArray(msg.content)) {
          const textItem = msg.content.find((c: any) => c.type === 'text');
          if (textItem) {
            text = textItem.text || '';
          }
        } else if (typeof msg.content === 'string') {
          text = msg.content;
        }
        
        text = text.trim();
        if (text) {
          return text.length > 100 ? text.slice(0, 100) + '...' : text;
        }
      }
    }

    return null;
  }

  /**
   * Connect tool results to their corresponding tool uses
   */
  private connectToolResultsToToolUse(rawMessages: ParsedMessage[]): ParsedMessage[] {
    const toolResultsByCallId = new Map<string, ParsedMessage[]>();
    
    rawMessages.forEach(msg => {
      if (msg.type === 'tool_result' && msg.toolCallId) {
        const list = toolResultsByCallId.get(msg.toolCallId) || [];
        list.push(msg);
        toolResultsByCallId.set(msg.toolCallId, list);
      }
    });

    const connectedCallIds = new Set<string>();
    const result: ParsedMessage[] = [];

    for (const msg of rawMessages) {
      if (msg.type === 'tool_use') {
        const callId = msg.toolCallId;
        if (callId && toolResultsByCallId.has(callId)) {
          const results = toolResultsByCallId.get(callId) || [];
          result.push({
            ...msg,
            results: results.map(r => {
              const toolResult = r as ParsedMessage & { type: 'tool_result' };
              return {
                output: toolResult.output?.[0]?.type === 'code' 
                  ? toolResult.output[0].code 
                  : JSON.stringify(toolResult.output),
                isError: toolResult.isError || false,
                toolCallId: toolResult.toolCallId
              };
            })
          });
          connectedCallIds.add(callId);
        } else {
          result.push(msg);
        }
      } else if (msg.type === 'tool_result') {
        const callId = msg.toolCallId;
        if (!callId || !connectedCallIds.has(callId)) {
          const hasMatchingToolUse = rawMessages.some(m => 
            m.type === 'tool_use' && m.toolCallId === callId
          );
          if (!hasMatchingToolUse) {
            result.push(msg);
          }
        }
      } else {
        result.push(msg);
      }
    }

    return result;
  }
}
