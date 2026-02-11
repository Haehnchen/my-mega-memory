import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, ParsedMessage, MessageContent } from '../../types';

// Droid data structures
interface DroidSessionStart {
  type: 'session_start';
  id: string;
  title: string;
  sessionTitle: string;
  owner: string;
  version: number;
  cwd: string;
}

interface DroidMessageLine {
  type: 'message';
  id: string;
  timestamp: string;
  message: DroidMessage;
  parentId?: string;
}

interface DroidMessage {
  role: 'user' | 'assistant';
  content: DroidContentBlock[];
}

type DroidContentBlock =
  | DroidTextBlock
  | DroidToolUseBlock
  | DroidToolResultBlock;

interface DroidTextBlock {
  type: 'text';
  text: string;
}

interface DroidToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface DroidToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export interface DroidSessionInfo {
  sessionId: string;
  filePath: string;
  projectPath: string;
  projectName: string;
  title: string;
  created: string;
  updated: string;
  messageCount: number;
}

/**
 * Droid (Factory.ai CLI) session finder
 * Locates session files in ~/.factory/sessions/{sanitized-project-path}/
 */
export class DroidSessionFinder {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.factory', 'sessions');
  }

  /**
   * List all session files across all projects
   */
  listSessions(): DroidSessionInfo[] {
    const sessions: DroidSessionInfo[] = [];

    if (!fs.existsSync(this.baseDir)) {
      return sessions;
    }

    // Iterate over all project directories
    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectDir = entry.name;
      const projectDirPath = path.join(this.baseDir, projectDir);

      // Find all .jsonl session files
      const files = fs.readdirSync(projectDirPath)
        .filter(f => f.endsWith('.jsonl') && !f.endsWith('.settings.jsonl'));

      for (const file of files) {
        const filePath = path.join(projectDirPath, file);
        const sessionInfo = this.parseSessionInfo(filePath, projectDir);
        if (sessionInfo) {
          sessions.push(sessionInfo);
        }
      }
    }

    return sessions.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  }

  /**
   * Parse session metadata from first line of JSONL file
   */
  private parseSessionInfo(filePath: string, projectDir: string): DroidSessionInfo | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      if (lines.length === 0) return null;

      const firstLine = JSON.parse(lines[0]) as DroidSessionStart;
      if (firstLine.type !== 'session_start') return null;

      // Extract project path from cwd field
      const projectPath = firstLine.cwd || this.unsanitizeProjectName(projectDir);
      const projectName = path.basename(projectPath);

      // Get file modification time for updated timestamp
      const stats = fs.statSync(filePath);
      const created = stats.mtime.toISOString();
      const updated = stats.mtime.toISOString();

      return {
        sessionId: firstLine.id,
        filePath,
        projectPath,
        projectName,
        title: firstLine.title || firstLine.sessionTitle || 'Droid Session',
        created,
        updated,
        messageCount: lines.length - 1 // Exclude session_start line
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Convert sanitized directory name back to project path
   * e.g., "-home-daniel-plugins" -> "/home/daniel/plugins"
   */
  private unsanitizeProjectName(name: string): string {
    // Directory names start with "-", path separators become "-"
    if (name.startsWith('-')) {
      name = '/' + name.slice(1);
    }
    return name.replace(/-/g, '/');
  }
}

/**
 * Droid session parser
 * Parses JSONL session files into unified SessionDetail format
 */
export class DroidSessionParser {

  /**
   * Parse a JSONL session file by path
   */
  parseFile(filePath: string): SessionDetail | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.parseContent(content);
    } catch (e) {
      console.error(`Error parsing Droid session file ${filePath}:`, e);
      return null;
    }
  }

  /**
   * Parse session content from JSONL string
   */
  parseContent(content: string): SessionDetail | null {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;

    const firstLine = JSON.parse(lines[0]) as DroidSessionStart;
    if (firstLine.type !== 'session_start') return null;

    const sessionId = firstLine.id;
    const messages: ParsedMessage[] = [];
    const modelCounts = new Map<string, number>();

    // Track tool call IDs for matching results
    const toolCallMap = new Map<string, { name: string; input: Record<string, string> }>();

    for (let i = 1; i < lines.length; i++) {
      try {
        const line = JSON.parse(lines[i]) as DroidMessageLine;
        if (line.type !== 'message') continue;

        const parsed = this.parseMessage(line, toolCallMap);
        messages.push(...parsed);
      } catch (e) {
        // Skip invalid lines
      }
    }

    const title = this.extractTitle(firstLine, messages);

    return {
      sessionId,
      title,
      messages,
      metadata: {
        models: Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1]),
        messageCount: messages.length,
        created: undefined,
        modified: undefined
      }
    };
  }

  /**
   * Parse a single message line
   */
  private parseMessage(
    line: DroidMessageLine,
    toolCallMap: Map<string, { name: string; input: Record<string, string> }>
  ): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    const timestamp = line.timestamp;

    if (line.message.role === 'user') {
      for (const block of line.message.content) {
        if (block.type === 'tool_result') {
          // Tool result message
          const toolCall = toolCallMap.get(block.tool_use_id);
          if (toolCall) {
            messages.push({
              type: 'tool_result',
              timestamp,
              toolName: toolCall.name,
              toolCallId: block.tool_use_id,
              output: this.parseToolResultContent(block.content),
              isError: false
            });
          }
        } else if (block.type === 'text') {
          // User text content
          messages.push({
            type: 'user',
            timestamp,
            content: [{ type: 'text', text: block.text }]
          });
        }
      }
    } else if (line.message.role === 'assistant') {
      for (const block of line.message.content) {
        if (block.type === 'tool_use') {
          // Tool use - store for result matching
          const inputMap: Record<string, string> = {};
          if (block.input) {
            for (const [key, value] of Object.entries(block.input)) {
              inputMap[key] = typeof value === 'string' ? value : JSON.stringify(value);
            }
          }

          toolCallMap.set(block.id, {
            name: block.name,
            input: inputMap
          });

          messages.push({
            type: 'tool_use',
            timestamp,
            toolName: block.name,
            toolCallId: block.id,
            input: inputMap,
            results: []
          });
        } else if (block.type === 'text') {
          // Assistant text
          messages.push({
            type: 'assistant_text',
            timestamp,
            content: [{ type: 'markdown', markdown: block.text }]
          });
        }
      }
    }

    return messages;
  }

  /**
   * Parse tool result content into appropriate format
   */
  private parseToolResultContent(content: string): MessageContent[] {
    // Check if it's a diff
    if (content.includes('---') && content.includes('+++')) {
      return [{ type: 'diff', oldText: '', newText: content, filePath: undefined }];
    }
    // Check if it's JSON
    if (content.trim().startsWith('{')) {
      try {
        JSON.parse(content);
        return [{ type: 'json', json: content }];
      } catch {
        // Not valid JSON, treat as code
      }
    }
    // Default to code block
    return [{ type: 'code', code: content }];
  }

  /**
   * Extract title from session_start or first user message
   */
  private extractTitle(sessionStart: DroidSessionStart, messages: ParsedMessage[]): string {
    // Use title from session_start if available and not generic
    if (sessionStart.title && sessionStart.title !== 'New Session') {
      return sessionStart.title;
    }

    // Find first user message
    const userMsg = messages.find(m => m.type === 'user');
    if (!userMsg) return 'Droid Session';

    const content = userMsg.content[0]?.type === 'text' ? userMsg.content[0].text : '';
    if (!content) return 'Droid Session';

    // Truncate if too long
    if (content.length > 100) {
      return content.slice(0, 100) + '...';
    }

    return content;
  }
}
