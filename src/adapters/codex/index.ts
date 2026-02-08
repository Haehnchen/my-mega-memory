import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, SessionMetadata, ParsedMessage, MessageContent } from '../../types';

interface CodexSessionInfo {
  sessionId: string;
  filePath: string;
  cwd?: string;
  originator?: string;
  cliVersion?: string;
  model?: string;
  gitBranch?: string;
  created: number;
  updated: number;
}

/**
 * Codex session finder
 * Ported from: de.espend.ml.llm.session.adapter.codex.CodexSessionFinder.kt
 * 
 * Searches in:
 * - JetBrains IDE: ~/.cache/JetBrains/{IDE}/aia/codex/sessions/{year}/{month}/{day}/
 * - Standalone CLI: ~/.codex/sessions/{year}/{month}/{day}/
 */
export class CodexSessionFinder {
  private maxDaysToSearch = 30;

  getCodexSessionsDirs(): string[] {
    const dirs = new Set<string>();
    const homeDir = os.homedir();

    // Try to find JetBrains IDE directories
    const cacheDir = path.join(homeDir, '.cache');
    if (fs.existsSync(cacheDir)) {
      const jetbrainsDir = path.join(cacheDir, 'JetBrains');
      if (fs.existsSync(jetbrainsDir)) {
        const ides = fs.readdirSync(jetbrainsDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        for (const ide of ides) {
          const sessionsDir = path.join(jetbrainsDir, ide, 'aia', 'codex', 'sessions');
          if (fs.existsSync(sessionsDir)) {
            dirs.add(sessionsDir);
          }
        }
      }
    }

    // Standalone Codex CLI sessions directory
    const cliSessionsDir = path.join(homeDir, '.codex', 'sessions');
    if (fs.existsSync(cliSessionsDir)) {
      dirs.add(cliSessionsDir);
    }

    return Array.from(dirs);
  }

  extractSessionId(filePath: string): string | null {
    const name = path.basename(filePath, '.jsonl');
    if (!name.startsWith('rollout-')) return null;

    // Find UUID pattern at end: 8-4-4-4-12 hex digits
    const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
    const match = name.match(uuidRegex);
    return match ? match[1] : null;
  }

  findSessionFile(sessionId: string): string | null {
    const sessionDirs = this.getCodexSessionsDirs();
    if (sessionDirs.length === 0) return null;

    const today = new Date();

    for (const sessionsDir of sessionDirs) {
      for (let dayOffset = 0; dayOffset < this.maxDaysToSearch; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() - dayOffset);
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const datePath = path.join(sessionsDir, String(year), month, day);

        if (fs.existsSync(datePath)) {
          const files = fs.readdirSync(datePath)
            .filter(f => f.endsWith('.jsonl') && f.includes(sessionId));
          
          if (files.length > 0) {
            return path.join(datePath, files[0]);
          }
        }
      }
    }

    return null;
  }

  listSessionFiles(): Array<{ filePath: string; sessionId: string; stats: fs.Stats }> {
    const sessionDirs = this.getCodexSessionsDirs();
    if (sessionDirs.length === 0) return [];

    const today = new Date();
    const filesBySessionId = new Map<string, { filePath: string; stats: fs.Stats }>();

    for (const sessionsDir of sessionDirs) {
      for (let dayOffset = 0; dayOffset < this.maxDaysToSearch; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() - dayOffset);
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const datePath = path.join(sessionsDir, String(year), month, day);

        if (fs.existsSync(datePath)) {
          const files = fs.readdirSync(datePath)
            .filter(f => f.endsWith('.jsonl') && f.startsWith('rollout-'));

          for (const file of files) {
            const filePath = path.join(datePath, file);
            const sessionId = this.extractSessionId(filePath);
            
            if (sessionId) {
              const stats = fs.statSync(filePath);
              const existing = filesBySessionId.get(sessionId);
              
              if (!existing || stats.mtimeMs > existing.stats.mtimeMs) {
                filesBySessionId.set(sessionId, { filePath, stats });
              }
            }
          }
        }
      }
    }

    return Array.from(filesBySessionId.entries())
      .map(([sessionId, { filePath, stats }]) => ({ filePath, sessionId, stats }))
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  }

  listSessions(): CodexSessionInfo[] {
    const sessions: CodexSessionInfo[] = [];
    const files = this.listSessionFiles();

    for (const { filePath, sessionId, stats } of files) {
      const metadata = this.parseSessionMetadata(filePath);
      
      sessions.push({
        sessionId,
        filePath,
        cwd: metadata.cwd,
        originator: metadata.originator,
        cliVersion: metadata.cliVersion,
        model: metadata.model,
        gitBranch: metadata.gitBranch,
        created: stats.birthtimeMs,
        updated: stats.mtimeMs
      });
    }

    return sessions;
  }

  private parseSessionMetadata(filePath: string): Partial<CodexSessionInfo> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;

        try {
          const json = JSON.parse(trimmed);
          if (json.type === 'session_meta') {
            const payload = json.payload || {};
            const git = payload.git || {};
            
            return {
              cwd: payload.cwd,
              originator: payload.originator,
              cliVersion: payload.cli_version,
              gitBranch: git.branch
            };
          }
        } catch (e) {
          // Continue
        }
      }
    } catch (e) {
      // Error reading file
    }

    return {};
  }
}

/**
 * Codex session parser
 * Ported from: de.espend.ml.llm.session.adapter.codex.CodexSessionParser.kt
 */
export class CodexSessionParser {
  private finder: CodexSessionFinder;

  constructor() {
    this.finder = new CodexSessionFinder();
  }

  parseFile(filePath: string): SessionDetail | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sessionId = this.finder.extractSessionId(filePath) || path.basename(filePath, '.jsonl');
      const { messages, metadata } = this.parseContent(content);

      const title = this.extractTitle(messages) || `Codex Session ${sessionId.slice(0, 8)}`;

      return {
        sessionId,
        title,
        messages,
        metadata
      };
    } catch (e) {
      console.error(`Error parsing Codex session file ${filePath}:`, e);
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

  parseContent(content: string): { messages: ParsedMessage[]; metadata: SessionMetadata } {
    const rawMessages: ParsedMessage[] = [];
    let metadata: SessionMetadata = {
      models: [],
      messageCount: 0
    };
    
    let created: string | null = null;
    let modified: string | null = null;
    let messageCount = 0;
    const modelCounts = new Map<string, number>();

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;

      try {
        const json = JSON.parse(trimmed);
        const type = json.type;
        const timestamp = json.timestamp;

        if (timestamp) {
          if (!created) created = timestamp;
          modified = timestamp;
        }

        switch (type) {
          case 'session_meta':
            const payload = json.payload || {};
            const git = payload.git || {};
            metadata = {
              ...metadata,
              version: payload.cli_version,
              gitBranch: git.branch,
              cwd: payload.cwd
            };
            break;

          case 'response_item':
            const itemPayload = json.payload || {};
            const parsed = this.parseResponseItem(itemPayload, timestamp || '');
            if (parsed) {
              rawMessages.push(parsed);
              messageCount++;
            }
            break;

          case 'turn_context':
            const model = json.payload?.model;
            if (model) {
              modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
            }
            break;
        }
      } catch (e) {
        // Skip lines that fail to parse
      }
    }

    const finalMessages = this.connectToolOutputsToToolCalls(rawMessages);

    const sortedModels = Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    metadata = {
      ...metadata,
      created: created || undefined,
      modified: modified || undefined,
      messageCount,
      models: sortedModels
    };

    return { messages: finalMessages, metadata };
  }

  private parseResponseItem(payload: any, timestamp: string): ParsedMessage | null {
    if (!payload) return null;

    const type = payload.type;

    switch (type) {
      case 'message':
        return this.parseMessagePayload(payload, timestamp);

      case 'function_call':
        return this.parseFunctionCall(payload, timestamp);

      case 'function_call_output':
        return this.parseFunctionCallOutput(payload, timestamp);

      case 'custom_tool_call':
        return this.parseCustomToolCall(payload, timestamp);

      case 'custom_tool_call_output':
        return this.parseCustomToolCallOutput(payload, timestamp);

      case 'reasoning':
        return this.parseReasoning(payload, timestamp);

      default:
        return null;
    }
  }

  private parseMessagePayload(payload: any, timestamp: string): ParsedMessage | null {
    const role = payload.role;
    const contentArray = payload.content || [];
    const contentBlocks: MessageContent[] = [];

    for (const item of contentArray) {
      if (item.type === 'input_text' || item.type === 'text') {
        const text = item.text || '';
        // Skip system instructions
        if (text.includes('<permissions instructions>') ||
            text.includes('<environment_context>') ||
            text.includes('# AGENTS.md instructions')) {
          continue;
        }
        contentBlocks.push({ type: 'text', text });
      }
    }

    if (contentBlocks.length === 0) return null;

    if (role === 'user') {
      return { type: 'user', timestamp, content: contentBlocks };
    }

    return { type: 'assistant_text', timestamp, content: contentBlocks };
  }

  private parseFunctionCall(payload: any, timestamp: string): ParsedMessage {
    const name = payload.name || 'function';
    const callId = payload.call_id;
    const argumentsStr = payload.arguments;

    let input: Record<string, string> = {};
    if (argumentsStr) {
      try {
        const args = JSON.parse(argumentsStr);
        input = this.jsonToMap(args);
      } catch (e) {
        input = { arguments: argumentsStr };
      }
    }

    return {
      type: 'tool_use',
      timestamp,
      toolName: name,
      toolCallId: callId,
      input,
      results: []
    };
  }

  private parseFunctionCallOutput(payload: any, timestamp: string): ParsedMessage {
    const callId = payload.call_id;
    const output = payload.output || '';

    return {
      type: 'tool_result',
      timestamp,
      toolCallId: callId,
      output: output ? [{ type: 'code', code: output }] : [],
      isError: false
    };
  }

  private parseCustomToolCall(payload: any, timestamp: string): ParsedMessage {
    const name = payload.name || 'tool';
    const callId = payload.call_id;
    const inputStr = payload.input;

    const input: Record<string, string> = inputStr 
      ? { input: inputStr.slice(0, 2000) }
      : {};

    return {
      type: 'tool_use',
      timestamp,
      toolName: name,
      toolCallId: callId,
      input,
      results: []
    };
  }

  private parseCustomToolCallOutput(payload: any, timestamp: string): ParsedMessage {
    const callId = payload.call_id;
    const outputStr = payload.output || '';

    let outputContent: MessageContent[] = [];
    if (outputStr) {
      try {
        const outputJson = JSON.parse(outputStr);
        const resultOutput = outputJson.output || outputStr;
        outputContent = [{ type: 'code', code: resultOutput }];
      } catch (e) {
        outputContent = [{ type: 'code', code: outputStr }];
      }
    }

    return {
      type: 'tool_result',
      timestamp,
      toolCallId: callId,
      output: outputContent,
      isError: false
    };
  }

  private parseReasoning(payload: any, timestamp: string): ParsedMessage | null {
    const summary = payload.summary || [];
    const summaryText = summary
      .map((item: any) => item.text)
      .filter(Boolean)
      .join('\n');

    if (!summaryText) return null;

    return {
      type: 'assistant_thinking',
      timestamp,
      thinking: summaryText
    };
  }

  private connectToolOutputsToToolCalls(rawMessages: ParsedMessage[]): ParsedMessage[] {
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
                output: toolResult.output?.[0]?.type === 'code' ? toolResult.output[0].code : JSON.stringify(toolResult.output),
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

  private extractTitle(messages: ParsedMessage[]): string | null {
    const userMsg = messages.find(m => m.type === 'user');
    if (!userMsg || userMsg.type !== 'user') return null;
    
    const text = userMsg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join(' ');
    
    if (text.length > 100) {
      return text.slice(0, 100) + '...';
    }
    return text || null;
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
}

export { CodexSessionInfo };