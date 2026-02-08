import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, SessionMetadata, ParsedMessage, MessageContent } from '../../types';

// OpenCode data structures
interface OpenCodeSessionData {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  time: {
    created: number;
    updated: number;
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
}

interface OpenCodeMessageData {
  id: string;
  role: string;
  time?: {
    created?: number;
    completed?: number;
  };
  model?: {
    providerID?: string;
    modelID?: string;
  };
  error?: {
    name?: string;
    data?: {
      message?: string;
      statusCode?: number;
      isRetryable?: boolean;
      responseBody?: string;
      metadata?: {
        url?: string;
      };
    };
  };
}

interface OpenCodePartData {
  id: string;
  type: string;
  text?: string;
  tool?: string;
  callID?: string;
  time?: {
    start?: number;
    end?: number;
  };
  state?: {
    status?: string;
    input?: any;
    output?: any;
    error?: any;
    title?: string;
  };
}

interface RawOpenCodeMessage {
  messageData: OpenCodeMessageData | null;
  parts: OpenCodePartData[];
  rawContent: string;
  filePath: string;
}

interface OpenCodeSessionInfo {
  sessionId: string;
  slug: string;
  title: string;
  created: number;
  updated: number;
  messageCount: number;
  projectPath: string;
  projectID: string;
}

/**
 * OpenCode session finder
 * Ported from: de.espend.ml.llm.session.adapter.opencode.OpenCodeSessionFinder.kt
 */
export class OpenCodeSessionFinder {
  private readonly storageDir: string | null;

  constructor() {
    this.storageDir = this.getStorageDir();
  }

  getStorageDir(): string | null {
    const homeDir = os.homedir();
    const storageDir = path.join(homeDir, '.local', 'share', 'opencode', 'storage');
    return fs.existsSync(storageDir) ? storageDir : null;
  }

  findSessionFile(sessionId: string): string | null {
    if (!this.storageDir) return null;

    const sessionDir = path.join(this.storageDir, 'session');
    if (!fs.existsSync(sessionDir)) return null;

    const projects = fs.readdirSync(sessionDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const project of projects) {
      const projectDir = path.join(sessionDir, project);
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(projectDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const session = JSON.parse(content) as OpenCodeSessionData;
          if (session.id === sessionId) {
            return filePath;
          }
        } catch (e) {
          // Continue searching
        }
      }
    }

    return null;
  }

  listSessions(): OpenCodeSessionInfo[] {
    const sessions: OpenCodeSessionInfo[] = [];
    
    if (!this.storageDir) return sessions;

    const sessionDir = path.join(this.storageDir, 'session');
    const messageDir = path.join(this.storageDir, 'message');

    if (!fs.existsSync(sessionDir)) return sessions;

    const projects = fs.readdirSync(sessionDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const project of projects) {
      const projectDir = path.join(sessionDir, project);
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(projectDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const session = JSON.parse(content) as OpenCodeSessionData;
          const msgCount = this.countMessages(messageDir, session.id);
          
          sessions.push({
            sessionId: session.id,
            slug: session.slug,
            title: session.title,
            created: session.time.created,
            updated: session.time.updated,
            messageCount: msgCount,
            projectPath: session.directory,
            projectID: session.projectID
          });
        } catch (e) {
          // Skip invalid sessions
        }
      }
    }

    return sessions.sort((a, b) => b.updated - a.updated);
  }

  private countMessages(messageDir: string, sessionId: string): number {
    const sessionMessageDir = path.join(messageDir, sessionId);
    if (!fs.existsSync(sessionMessageDir)) return 0;
    
    try {
      return fs.readdirSync(sessionMessageDir)
        .filter(f => f.endsWith('.json'))
        .length;
    } catch (e) {
      return 0;
    }
  }
}

/**
 * OpenCode session parser
 * Ported from: de.espend.ml.llm.session.adapter.opencode.OpenCodeSessionParser.kt
 */
export class OpenCodeSessionParser {
  private finder: OpenCodeSessionFinder;

  constructor() {
    this.finder = new OpenCodeSessionFinder();
  }

  parseSession(sessionId: string): SessionDetail | null {
    const sessionData = this.findSessionData(sessionId);
    if (!sessionData) return null;

    const result = this.loadMessagesWithParts(sessionId);

    const metadata: SessionMetadata = {
      cwd: sessionData.directory,
      created: this.formatTimestamp(sessionData.time.created),
      modified: this.formatTimestamp(sessionData.time.updated),
      messageCount: result.messageFileCount,
      models: result.sortedModels,
      version: undefined,
      gitBranch: undefined
    };

    return {
      sessionId: sessionData.id,
      title: sessionData.title,
      messages: result.messages,
      metadata
    };
  }

  private findSessionData(sessionId: string): OpenCodeSessionData | null {
    const filePath = this.finder.findSessionFile(sessionId);
    if (!filePath) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as OpenCodeSessionData;
    } catch (e) {
      return null;
    }
  }

  private loadMessagesWithParts(sessionId: string): { 
    messages: ParsedMessage[]; 
    sortedModels: [string, number][]; 
    messageFileCount: number;
  } {
    const storageDir = this.finder.getStorageDir();
    if (!storageDir) {
      return { messages: [], sortedModels: [], messageFileCount: 0 };
    }

    const messagesDir = path.join(storageDir, 'message', sessionId);
    const partsDir = path.join(storageDir, 'part');

    if (!fs.existsSync(messagesDir)) {
      return { messages: [], sortedModels: [], messageFileCount: 0 };
    }

    const loadedMessages: RawOpenCodeMessage[] = [];
    const modelCounts = new Map<string, number>();

    const messageFiles = fs.readdirSync(messagesDir)
      .filter(f => f.endsWith('.json'));

    for (const file of messageFiles) {
      const filePath = path.join(messagesDir, file);
      const rawContent = fs.readFileSync(filePath, 'utf-8');

      try {
        const messageData = JSON.parse(rawContent) as OpenCodeMessageData;
        const parts = this.loadParts(partsDir, messageData.id);
        
        loadedMessages.push({
          messageData,
          parts,
          rawContent,
          filePath
        });

        if (messageData.model?.modelID) {
          const modelId = messageData.model.modelID;
          modelCounts.set(modelId, (modelCounts.get(modelId) || 0) + 1);
        }
      } catch (e) {
        loadedMessages.push({
          messageData: null,
          parts: [],
          rawContent,
          filePath
        });
      }
    }

    loadedMessages.sort((a, b) => {
      const timeA = a.messageData?.time?.created || Number.MAX_SAFE_INTEGER;
      const timeB = b.messageData?.time?.created || Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });

    const messages: ParsedMessage[] = [];
    for (const loaded of loadedMessages) {
      messages.push(...this.parseRawMessage(loaded));
    }

    const sortedModels = Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1]) as [string, number][];

    return {
      messages,
      sortedModels,
      messageFileCount: loadedMessages.length
    };
  }

  private loadParts(partsDir: string, messageId: string): OpenCodePartData[] {
    const messagePartsDir = path.join(partsDir, messageId);
    if (!fs.existsSync(messagePartsDir)) return [];

    const parts: OpenCodePartData[] = [];
    const files = fs.readdirSync(messagePartsDir)
      .filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(messagePartsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        parts.push(JSON.parse(content) as OpenCodePartData);
      } catch (e) {
        // Skip failed parts
      }
    }

    parts.sort((a, b) => {
      const timeA = a.time?.start || a.time?.end || Number.MAX_SAFE_INTEGER;
      const timeB = b.time?.start || b.time?.end || Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });

    return parts;
  }

  private parseRawMessage(loaded: RawOpenCodeMessage): ParsedMessage[] {
    const messageData = loaded.messageData;
    const parts = loaded.parts;
    const timestamp = this.formatTimestamp(messageData?.time?.created);

    if (!messageData) {
      return [{
        type: 'info',
        timestamp,
        title: 'error',
        subtitle: 'parse',
        content: { type: 'text', text: `Failed to parse message: ${loaded.filePath}` },
        style: 'error'
      }];
    }

    switch (messageData.role) {
      case 'user':
        return this.parseUserMessage(loaded, parts, timestamp);
      case 'assistant':
        return this.parseAssistantMessage(loaded, messageData, parts, timestamp);
      default:
        return [{
          type: 'info',
          timestamp,
          title: messageData.role,
          content: { type: 'json', json: loaded.rawContent },
          style: 'default'
        }];
    }
  }

  private parseUserMessage(
    loaded: RawOpenCodeMessage,
    parts: OpenCodePartData[],
    timestamp: string
  ): ParsedMessage[] {
    const text = this.combineTextParts(parts);
    const content: MessageContent[] = [];

    if (text.length > 0) {
      content.push({ type: 'text', text });
    } else if (parts.length === 0) {
      content.push({ type: 'code', code: loaded.rawContent });
    } else {
      content.push(
        { type: 'text', text: `User message with ${parts.length} part(s)` },
        { type: 'code', code: loaded.rawContent }
      );
    }

    return [{
      type: 'user',
      timestamp,
      content
    }];
  }

  private parseAssistantMessage(
    loaded: RawOpenCodeMessage,
    messageData: OpenCodeMessageData,
    parts: OpenCodePartData[],
    timestamp: string
  ): ParsedMessage[] {
    const messages: ParsedMessage[] = [];

    for (const part of parts) {
      const partTimestamp = this.formatTimestamp(part.time?.start || part.time?.end) || timestamp;

      switch (part.type) {
        case 'text':
          if (part.text?.trim()) {
            messages.push({
              type: 'assistant_text',
              timestamp: partTimestamp,
              content: [{ type: 'markdown', markdown: part.text.trim() }]
            });
          }
          break;

        case 'reasoning':
          if (part.text?.trim()) {
            messages.push({
              type: 'assistant_thinking',
              timestamp: partTimestamp,
              thinking: part.text.trim()
            });
          }
          break;

        case 'tool':
          messages.push(...this.parseToolPart(part, partTimestamp));
          break;

        case 'step-start':
        case 'step-finish':
          // Metadata parts - skip
          break;
      }
    }

    if (messages.length === 0) {
      if (messageData.error) {
        const errorContent = this.formatErrorContent(messageData.error, loaded.rawContent);
        messages.push({
          type: 'info',
          timestamp,
          title: 'error',
          subtitle: messageData.error.name,
          content: { type: 'text', text: errorContent },
          style: 'error'
        });
      } else {
        messages.push({
          type: 'assistant_text',
          timestamp,
          content: [{ type: 'code', code: `Assistant message with 0 parts\n${loaded.rawContent}` }]
        });
      }
    }

    return messages;
  }

  private parseToolPart(part: OpenCodePartData, timestamp: string): ParsedMessage[] {
    const toolName = part.tool || 'tool';
    const state = part.state;
    const inputMap = this.jsonToMap(state?.input);

    const results: ParsedMessage[] = [];
    const status = state?.status;

    if (state && (status === 'completed' || status === 'error')) {
      const outputElement = status === 'error' ? state.error : state.output;
      const outputContent = this.formatToolOutput(outputElement);

      results.push({
        type: 'tool_result',
        timestamp,
        toolCallId: part.callID,
        output: outputContent,
        isError: status === 'error'
      } as ParsedMessage);
    }

    return [{
      type: 'tool_use',
      timestamp,
      toolName,
      toolCallId: part.callID,
      input: inputMap,
      results: results.map(r => r.type === 'tool_result' ? {
        output: r.output?.[0]?.type === 'code' ? r.output[0].code : JSON.stringify(r.output),
        isError: r.isError,
        toolCallId: r.toolCallId
      } : { output: '', isError: false })
    }];
  }

  private combineTextParts(parts: OpenCodePartData[]): string {
    return parts
      .filter(p => p.type === 'text' && p.text && p.text.trim())
      .map(p => p.text!.trim())
      .join('\n\n');
  }

  private formatErrorContent(error: any, rawContent: string): string {
    if (!error) return rawContent;
    return error.data?.message || rawContent;
  }

  private formatToolOutput(output: any): MessageContent[] {
    if (!output) return [];
    
    if (typeof output === 'string') {
      return [{ type: 'code', code: output }];
    }

    if (typeof output === 'object') {
      const outputStr = output.output;
      if (typeof outputStr === 'string') {
        return [{ type: 'code', code: outputStr }];
      }
      return [{ type: 'code', code: JSON.stringify(output, null, 2) }];
    }

    return [{ type: 'code', code: String(output) }];
  }

  private jsonToMap(json: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (typeof json === 'object' && json !== null) {
      for (const [key, value] of Object.entries(json)) {
        if (typeof value === 'string') {
          result[key] = value;
        } else {
          result[key] = JSON.stringify(value);
        }
      }
    }
    return result;
  }

  private formatTimestamp(epochMillis: number | undefined): string {
    if (!epochMillis) return '';
    try {
      return new Date(epochMillis).toISOString();
    } catch (e) {
      return '';
    }
  }
}

export { OpenCodeSessionInfo };