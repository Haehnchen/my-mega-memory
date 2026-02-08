import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, SessionMetadata, ParsedMessage, MessageContent } from '../../types';

interface JunieSessionInfo {
  sessionId: string;
  filePath: string;
  title: string;
  projectPath?: string;
  created: number;
  updated: number;
}

// Junie index.jsonl entry structure
interface JunieIndexEntry {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  taskName?: string;
  status?: string | null;
}

/**
 * Convert Unix timestamp (milliseconds) to ISO 8601 datetime string
 */
function toDateTimeString(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Junie session finder
 * Reads from ~/.junie/sessions/index.jsonl
 */
export class JunieSessionFinder {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.junie', 'sessions');
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  findSessionFile(sessionId: string): string | null {
    // Junie sessions are stored in directories, not files
    // The events are in ~/.junie/sessions/{sessionId}/events.jsonl
    const sessionDir = path.join(this.baseDir, sessionId);
    const eventsFile = path.join(sessionDir, 'events.jsonl');
    
    if (fs.existsSync(eventsFile)) {
      return eventsFile;
    }

    return null;
  }

  listSessions(): JunieSessionInfo[] {
    const sessions: JunieSessionInfo[] = [];

    if (!fs.existsSync(this.baseDir)) {
      return sessions;
    }

    // Read index.jsonl which contains session metadata
    const indexPath = path.join(this.baseDir, 'index.jsonl');
    if (!fs.existsSync(indexPath)) {
      return sessions;
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as JunieIndexEntry;
          const sessionDir = path.join(this.baseDir, entry.sessionId);
          
          // Check if session directory exists
          if (!fs.existsSync(sessionDir)) {
            continue;
          }

          // Extract project path from events.jsonl
          let projectPath: string | undefined;
          try {
            const eventsContent = fs.readFileSync(path.join(sessionDir, 'events.jsonl'), 'utf-8');
            const eventLines = eventsContent.split('\n').filter(l => l.trim());
            for (const line of eventLines) {
              try {
                const event = JSON.parse(line);
                if (event.kind === 'SessionA2uxEvent' && event.event?.agentEvent?.blob) {
                  try {
                    const blob = JSON.parse(event.event.agentEvent.blob);
                    // projectStr is directly under lastAgentState
                    const projectStrContent = blob?.lastAgentState?.projectStr?.content;
                    if (projectStrContent) {
                      const match = projectStrContent.match(/Project root directory:\s*(.+?)\n/);
                      if (match) {
                        projectPath = match[1].trim();
                        break;
                      }
                    }
                  } catch (e) {
                    // Ignore parsing errors
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
          } catch (e) {
            // Ignore file reading errors
          }

          sessions.push({
            sessionId: entry.sessionId,
            filePath: path.join(sessionDir, 'events.jsonl'),
            title: entry.taskName || `Junie Session ${entry.sessionId.slice(0, 8)}`,
            projectPath: projectPath,
            created: entry.createdAt,
            updated: entry.updatedAt
          });
        } catch (e) {
          // Skip invalid entries
        }
      }
    } catch (e) {
      console.error('Error reading Junie index:', e);
    }

    return sessions.sort((a, b) => b.updated - a.updated);
  }
}

/**
 * Junie session parser
 */
export class JunieSessionParser {
  private finder: JunieSessionFinder;

  constructor() {
    this.finder = new JunieSessionFinder();
  }

  parseFile(filePath: string): SessionDetail | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sessionId = path.basename(path.dirname(filePath));
      return this.parseContent(content, sessionId);
    } catch (e) {
      console.error(`Error parsing Junie session file ${filePath}:`, e);
      return null;
    }
  }

  parseSession(sessionId: string): SessionDetail | null {
    const filePath = this.finder.findSessionFile(sessionId);
    if (!filePath) {
      return null;
    }
    return this.parseFile(filePath);
  }

  parseContent(content: string, sessionId: string): SessionDetail {
    const messages: ParsedMessage[] = [];
    let projectPath: string | undefined;
    let firstUserPrompt: string | undefined;
    
    // Parse events.jsonl format
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const timestamp = event.timestamp || new Date().toISOString();
        
        // Extract project path from SessionA2uxEvent
        if (event.kind === 'SessionA2uxEvent' && event.event?.agentEvent?.blob) {
          try {
            const blob = JSON.parse(event.event.agentEvent.blob);
            // projectStr is directly under lastAgentState
            const projectStrContent = blob?.lastAgentState?.projectStr?.content;
            if (projectStrContent) {
              const match = projectStrContent.match(/Project root directory:\s*(.+?)\n/);
              if (match) {
                projectPath = match[1].trim();
              }
            }
          } catch (e) {
            // Ignore blob parsing errors
          }
        }
        
        // Parse different event types
        if (event.kind === 'UserPromptEvent' && event.prompt) {
          if (!firstUserPrompt) {
            firstUserPrompt = event.prompt;
          }
          messages.push({
            type: 'user',
            timestamp,
            content: this.parseMessageContent(event.prompt)
          });
        } else if (event.kind === 'AgentResponseEvent' && event.response) {
          messages.push({
            type: 'assistant_text',
            timestamp,
            content: this.parseMessageContent(event.response)
          });
        }
      } catch (e) {
        // Skip invalid lines
      }
    }

    const metadata: SessionMetadata = {
      messageCount: messages.length,
      models: [],
      cwd: projectPath
    };

    // Use first user prompt as title
    const title = firstUserPrompt 
      ? (firstUserPrompt.length > 100 ? firstUserPrompt.slice(0, 100) + '...' : firstUserPrompt)
      : `Junie Session ${sessionId.slice(0, 8)}`;

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
      return content.map(item => {
        if (typeof item === 'string') {
          return { type: 'text', text: item };
        }
        if (item.type === 'code' || item.language) {
          return { type: 'code', code: item.code || item.text || '', language: item.language };
        }
        if (item.type === 'markdown') {
          return { type: 'markdown', markdown: item.markdown || item.text || '' };
        }
        return { type: 'text', text: item.text || JSON.stringify(item) };
      });
    }
    
    if (typeof content === 'object') {
      if (content.type === 'code') {
        return [{ type: 'code', code: content.code || '', language: content.language }];
      }
      return [{ type: 'json', json: JSON.stringify(content) }];
    }
    
    return [{ type: 'text', text: String(content) }];
  }
}

export { JunieSessionInfo };