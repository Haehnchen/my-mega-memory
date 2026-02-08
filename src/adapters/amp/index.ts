import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, SessionMetadata, ParsedMessage, MessageContent } from '../../types';

interface AmpSessionInfo {
  sessionId: string;
  filePath: string;
  title: string;
  projectPath?: string;
  created: number;
  updated: number;
  messageCount: number;
}

/**
 * Amp session finder
 * Reads from ~/.local/share/amp/threads/T-*.json
 */
export class AmpSessionFinder {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.local', 'share', 'amp', 'threads');
  }

  listSessions(): AmpSessionInfo[] {
    const sessions: AmpSessionInfo[] = [];

    if (!fs.existsSync(this.baseDir)) {
      return sessions;
    }

    const files = fs.readdirSync(this.baseDir)
      .filter(f => f.startsWith('T-') && f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(this.baseDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        const sessionId = path.basename(file, '.json');
        const created = data.created || 0;
        const messages = data.messages || [];
        const messageCount = messages.length;
        
        // Extract first user prompt for title
        const firstPrompt = this.extractFirstPrompt(data);
        
        // Extract working directory from env.initial.trees
        const cwd = this.extractWorkingDirectory(data);
        
        sessions.push({
          sessionId,
          filePath,
          title: firstPrompt || `Amp Session ${sessionId.slice(0, 8)}`,
          projectPath: cwd,
          created,
          updated: created, // Amp doesn't have separate updated timestamp
          messageCount
        });
      } catch (e) {
        // Skip invalid sessions
      }
    }

    return sessions.sort((a, b) => b.created - a.created);
  }

  private extractFirstPrompt(data: any): string | null {
    const messages = data.messages || [];
    
    for (const message of messages) {
      if (message.role === 'user') {
        const content = message.content || [];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const text = item.text.trim();
            if (text) {
              return text.length > 100 ? text.slice(0, 100) + '...' : text;
            }
          }
        }
      }
    }
    
    return null;
  }

  private extractWorkingDirectory(data: any): string | undefined {
    try {
      const env = data.env;
      if (!env) return undefined;
      
      const initial = env.initial;
      if (!initial) return undefined;
      
      const trees = initial.trees;
      if (!trees || !Array.isArray(trees) || trees.length === 0) return undefined;
      
      const firstTree = trees[0];
      const uri = firstTree.uri;
      if (!uri) return undefined;
      
      // Remove file:// prefix
      return uri.replace(/^file:\/\//, '');
    } catch (e) {
      return undefined;
    }
  }
}

/**
 * Amp session parser
 */
export class AmpSessionParser {

  constructor() {
  }

  parseFile(filePath: string): SessionDetail | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      const sessionId = data.id || path.basename(filePath, '.json');
      
      return this.parseContent(data, sessionId);
    } catch (e) {
      console.error(`Error parsing Amp session file ${filePath}:`, e);
      return null;
    }
  }

  parseContent(data: any, sessionId: string): SessionDetail {
    const messages: ParsedMessage[] = [];
    const rawMessages = data.messages || [];
    
    for (const msg of rawMessages) {
      const timestamp = msg.meta?.sentAt 
        ? new Date(msg.meta.sentAt).toISOString() 
        : new Date().toISOString();
      
      const role = msg.role;
      
      if (role === 'user') {
        const content = this.parseMessageContent(msg.content);
        if (content.length > 0) {
          messages.push({
            type: 'user',
            timestamp,
            content
          });
        }
      } else if (role === 'assistant') {
        const contentBlocks = msg.content || [];
        let hasThinking = false;
        let thinkingContent = '';
        const textContent: MessageContent[] = [];
        
        for (const block of contentBlocks) {
          if (block.type === 'thinking' && block.thinking) {
            hasThinking = true;
            thinkingContent = block.thinking;
          } else if (block.type === 'text' && block.text) {
            textContent.push({ type: 'markdown', markdown: block.text });
          } else if (block.type === 'tool_use') {
            messages.push({
              type: 'tool_use',
              timestamp,
              toolName: block.name || 'tool',
              toolCallId: block.id,
              input: block.input || {},
              results: []
            });
          }
        }
        
        if (hasThinking && textContent.length === 0) {
          messages.push({
            type: 'assistant_thinking',
            timestamp,
            thinking: thinkingContent
          });
        } else if (textContent.length > 0) {
          messages.push({
            type: 'assistant_text',
            timestamp,
            content: textContent
          });
        }
      } else if (role === 'user' && msg.content) {
        // Check for tool results
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            const result = block.run?.result;
            messages.push({
              type: 'tool_result',
              timestamp,
              toolCallId: block.toolUseID,
              output: result ? [{ type: 'code', code: JSON.stringify(result, null, 2) }] : [],
              isError: block.run?.status === 'error'
            });
          }
        }
      }
    }

    // Extract cwd from env
    let cwd: string | undefined;
    try {
      const uri = data.env?.initial?.trees?.[0]?.uri;
      if (uri) {
        cwd = uri.replace(/^file:\/\//, '');
      }
    } catch (e) {
      // Ignore
    }

    // Extract first prompt for title
    let title = `Amp Session ${sessionId.slice(0, 8)}`;
    for (const msg of rawMessages) {
      if (msg.role === 'user' && msg.content) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            const text = block.text.trim();
            if (text) {
              title = text.length > 100 ? text.slice(0, 100) + '...' : text;
              break;
            }
          }
        }
        if (title !== `Amp Session ${sessionId.slice(0, 8)}`) break;
      }
    }

    const metadata: SessionMetadata = {
      created: data.created ? new Date(data.created).toISOString() : undefined,
      cwd,
      messageCount: messages.length,
      models: []
    };

    return {
      sessionId,
      title,
      messages,
      metadata
    };
  }

  private parseMessageContent(content: any): MessageContent[] {
    if (!content) return [];
    
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }
    
    if (Array.isArray(content)) {
      const results: MessageContent[] = [];
      for (const item of content) {
        if (item.type === 'text' && item.text) {
          results.push({type: 'text', text: item.text});
        } else {
          results.push({type: 'text', text: JSON.stringify(item)});
        }
      }
      return results.filter(c => 'text' in c && c.text && c.text.trim());
    }
    
    return [{ type: 'text', text: JSON.stringify(content) }];
  }
}

export { AmpSessionInfo };