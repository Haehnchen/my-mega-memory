import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionDetail, SessionMetadata, ParsedMessage, MessageContent } from '../../types';

/**
 * Claude Code session finder
 * Ported from: de.espend.ml.llm.session.adapter.claude.ClaudeSessionFinder.kt
 */
export class ClaudeSessionFinder {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.claude', 'projects');
  }

  getClaudeProjectsDir(): string {
    return this.baseDir;
  }

  projectPathToClaudeDir(projectPath: string): string {
    return projectPath.replace(/\//g, '-').replace(/:/g, '');
  }

  listSessionFiles(): Array<{ filePath: string; projectName: string }> {
    const files: Array<{ filePath: string; projectName: string }> = [];

    if (!fs.existsSync(this.baseDir)) {
      return files;
    }

    const projects = fs.readdirSync(this.baseDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const projectDir of projects) {
      const projectPath = path.join(this.baseDir, projectDir);
      const projectFiles = fs.readdirSync(projectPath)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          filePath: path.join(projectPath, f),
          projectName: this.claudeDirToProjectName(projectDir)
        }));
      
      files.push(...projectFiles);
    }

    return files;
  }

  /**
   * Convert Claude directory name back to project name
   * e.g., "home-user-projects-myapp" -> "home/user/projects/myapp"
   */
  private claudeDirToProjectName(dirName: string): string {
    return dirName.replace(/-/g, '/');
  }
}

/**
 * Claude Code session parser
 * Ported from: de.espend.ml.llm.session.adapter.claude.ClaudeSessionParser.kt
 */
export class ClaudeSessionParser {
  private finder: ClaudeSessionFinder;

  constructor() {
    this.finder = new ClaudeSessionFinder();
  }

  parseFile(filePath: string): SessionDetail | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sessionId = path.basename(filePath, '.jsonl');
      const { messages, metadata } = this.parseContent(content);

      const title = this.extractTitle(messages) || `Claude Session ${sessionId.slice(0, 8)}`;

      return {
        sessionId,
        title,
        messages,
        metadata
      };
    } catch (e) {
      console.error(`Error parsing Claude session file ${filePath}:`, e);
      return null;
    }
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

        const timestamp = json.timestamp || json.snapshot?.timestamp;

        if (timestamp) {
          if (!created) created = timestamp;
          modified = timestamp;
        }

        if (!metadata.version && (type === 'user' || type === 'assistant')) {
          metadata = {
            ...metadata,
            version: json.version,
            gitBranch: json.gitBranch?.trim() || undefined,
            cwd: json.cwd
          };
        }

        const isMeta = json.isMeta || false;
        if (isMeta) continue;

        const messageObj = json.message;
        const model = messageObj?.model;
        if (model) {
          modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
        }

        if (!timestamp) continue;
        
        const parsed = this.parseMessageContent(type, messageObj, json, trimmed, timestamp);
        if (parsed) {
          rawMessages.push(parsed);
          messageCount++;
        }
      } catch (e) {
        // Skip lines that fail to parse
      }
    }

    const finalMessages = this.connectToolResultsToToolUse(rawMessages);

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

  private parseMessageContent(
    type: string | undefined,
    messageObj: any,
    json: any,
    rawLine: string,
    timestamp: string
  ): ParsedMessage | null {
    if (!type) {
      return {
        type: 'info',
        timestamp,
        title: 'error',
        subtitle: 'schema',
        content: { type: 'text', text: `Schema Error: Missing 'type' field\n${rawLine}` },
        style: 'error'
      };
    }

    switch (type) {
      case 'user':
        return this.parseUserMessage(messageObj, timestamp);
      case 'assistant':
        return this.parseAssistantMessage(messageObj, timestamp);
      case 'tool_use':
        return this.parseToolUseMessage(messageObj, timestamp);
      case 'tool_result':
        return this.parseToolResultMessage(messageObj, json, timestamp);
      case 'thinking':
        return this.parseThinkingMessage(messageObj, timestamp);
      case 'system':
        return this.parseSystemMessage(messageObj, json, rawLine, timestamp);
      case 'summary':
        return this.parseSummaryMessage(json, timestamp);
      default:
        return null;
    }
  }

  private parseUserMessage(messageObj: any, timestamp: string): ParsedMessage | null {
    const contentField = messageObj?.content;
    const contentBlocks: MessageContent[] = [];
    let hasText = false;
    let hasToolResult = false;
    let toolResultId: string | undefined;

    // Check for command-related message patterns (like Kotlin implementation)
    const contentString = typeof contentField === 'string' ? contentField : null;
    if (contentString) {
      // Skip local-command-stdout messages (empty output after /clear etc.)
      if (/^<local-command-stdout>.*<\/local-command-stdout>$/s.test(contentString.trim())) {
        return null;
      }

      // Check for command patterns like <command-name>/status</command-name>
      const commandMatch = contentString.match(/<command-name>([^<]+)<\/command-name>/);
      if (commandMatch) {
        const commandName = commandMatch[1].replace(/^\//, '');
        return {
          type: 'info',
          timestamp,
          title: 'command',
          content: { type: 'text', text: commandName },
          style: 'default'
        };
      }
    }

    if (typeof contentField === 'string') {
      hasText = true;
      contentBlocks.push({ type: 'text', text: contentField });
    } else if (Array.isArray(contentField)) {
      for (const item of contentField) {
        if (item.type === 'text') {
          hasText = true;
          contentBlocks.push({ type: 'text', text: item.text || '' });
        } else if (item.type === 'tool_result') {
          hasToolResult = true;
          const innerContent = this.extractToolResultContent(item.content);
          toolResultId = item.tool_use_id;
          if (innerContent) {
            contentBlocks.push({ type: 'code', code: innerContent });
          }
        }
      }
    }

    if (contentBlocks.length === 0) {
      contentBlocks.push({ type: 'code', code: '[User Message - No parsable content]' });
    }

    // If only tool_result (no text), return as ToolResult
    // This allows the tool result to be connected to its ToolUse via toolCallId
    if (hasToolResult && !hasText) {
      return {
        type: 'tool_result',
        timestamp,
        toolCallId: toolResultId,
        output: contentBlocks,
        isError: false
      };
    }

    return {
      type: 'user',
      timestamp,
      content: contentBlocks
    };
  }

  private parseAssistantMessage(messageObj: any, timestamp: string): ParsedMessage {
    const contentArray = messageObj?.content || [];
    const contentBlocks: MessageContent[] = [];
    let thinkingContent: string | null = null;
    let hasText = false;
    let hasToolUse = false;
    let firstToolName: string | null = null;
    let firstToolCallId: string | null = null;
    const toolResultsById: Map<string, ParsedMessage[]> = new Map();

    for (const item of contentArray) {
      if (item.type === 'text') {
        hasText = true;
        const text = item.text || '';
        if (text) {
          contentBlocks.push({ type: 'markdown', markdown: text });
        }
      } else if (item.type === 'thinking') {
        thinkingContent = item.thinking;
        const thinking = item.thinking || '';
        if (thinking) {
          contentBlocks.push({ type: 'markdown', markdown: thinking });
        }
      } else if (item.type === 'tool_use' || item.type === 'server_tool_use') {
        hasToolUse = true;
        const name = item.name || 'tool';
        if (firstToolName === null) firstToolName = name;
        // Store tool_use_id for later connection with tool_result
        const toolUseId = item.id;
        if (toolUseId !== undefined && toolUseId !== null && firstToolCallId === null) {
          firstToolCallId = toolUseId;
        }
      } else if (item.type === 'tool_result') {
        const resultContent = this.extractToolResultContent(item.content);
        const toolUseId = item.tool_use_id;
        const isError = item.is_error || false;

        // Create ToolResult and associate it with its tool_use_id
        const toolResult: ParsedMessage = {
          type: 'tool_result',
          timestamp,
          toolCallId: toolUseId,
          output: resultContent ? [{ type: 'code', code: resultContent }] : [],
          isError
        };

        // Store in map by tool_use_id for connection
        if (toolUseId !== undefined && toolUseId !== null) {
          const existing = toolResultsById.get(toolUseId) || [];
          existing.push(toolResult);
          toolResultsById.set(toolUseId, existing);
        }
      }
    }

    // If no content blocks, add placeholder
    if (contentBlocks.length === 0) {
      contentBlocks.push({ 
        type: 'code', 
        code: `[Assistant Message - No parsable content] ${JSON.stringify(messageObj).slice(0, 1000)}` 
      });
    }

    // Return appropriate message type based on content
    if (thinkingContent && contentBlocks.length === 1 && !hasText && !hasToolUse) {
      return {
        type: 'assistant_thinking',
        timestamp,
        thinking: thinkingContent
      };
    }

    if (hasToolUse && firstToolName !== null) {
      // Tool use message - use ToolUse class
      // Connect any tool results that belong to this tool_use
      const connectedResults = firstToolCallId ? toolResultsById.get(firstToolCallId) || [] : [];
      // Reconstruct input map from the content array
      const inputMap = this.extractInputMap(contentArray, firstToolCallId);
      return {
        type: 'tool_use',
        timestamp,
        toolName: firstToolName,
        toolCallId: firstToolCallId || undefined,
        input: inputMap,
        results: connectedResults.map((r: any) => ({
          output: r.output?.[0]?.type === 'code' ? r.output[0].code : JSON.stringify(r.output),
          isError: r.isError || false,
          toolCallId: r.toolCallId
        }))
      };
    }

    return {
      type: 'assistant_text',
      timestamp,
      content: contentBlocks
    };
  }

  /**
   * Extracts the input map from a tool_use content array.
   * Finds the tool_use item with matching toolCallId (if provided) and returns its input as a Map.
   */
  private extractInputMap(contentArray: any[], toolCallId: string | null): Record<string, string> {
    for (const item of contentArray) {
      if (item.type === 'tool_use') {
        const itemToolCallId = item.id;
        // If toolCallId is provided, match it; otherwise use first tool_use
        if (toolCallId === null || itemToolCallId === toolCallId) {
          const inputElement = item.input;
          return this.jsonToMap(inputElement);
        }
      }
    }
    return {};
  }

  private parseToolUseMessage(messageObj: any, timestamp: string): ParsedMessage {
    const contentArray = messageObj?.content || [];
    let toolName = 'tool';
    let toolCallId: string | undefined;
    const inputMap: Record<string, string> = {};

    for (const item of contentArray) {
      if (item.type === 'tool_use') {
        toolName = item.name || 'tool';
        toolCallId = item.id;
        if (item.input) {
          Object.assign(inputMap, this.jsonToMap(item.input));
        }
      }
    }

    return {
      type: 'tool_use',
      timestamp,
      toolName,
      toolCallId,
      input: inputMap,
      results: []
    };
  }

  private parseToolResultMessage(messageObj: any, json: any, timestamp: string): ParsedMessage {
    const content = this.extractToolResultContent(json.content || messageObj?.content);
    const toolUseId = json.tool_use_id || messageObj?.tool_use_id;

    return {
      type: 'tool_result',
      timestamp,
      toolCallId: toolUseId,
      output: [{ type: 'code', code: content }],
      isError: json.is_error || false
    };
  }

  private parseThinkingMessage(messageObj: any, timestamp: string): ParsedMessage {
    const contentArray = messageObj?.content || [];
    const thinkingParts: string[] = [];

    for (const item of contentArray) {
      if (item.type === 'thinking' && item.thinking) {
        thinkingParts.push(item.thinking);
      }
    }

    return {
      type: 'assistant_thinking',
      timestamp,
      thinking: thinkingParts.join('\n\n') || '[Thinking message with no parsable content]'
    };
  }

  private parseSystemMessage(messageObj: any, json: any, rawLine: string, timestamp: string): ParsedMessage {
    const subtype = json.subtype;

    if (subtype === 'turn_duration') {
      const durationMs = json.durationMs;
      const content = durationMs ? this.formatDuration(durationMs) : rawLine;
      return {
        type: 'info',
        timestamp,
        title: 'duration',
        subtitle: 'turn_duration',
        content: { type: 'text', text: content },
        style: 'default'
      };
    }

    const messageText = messageObj?.content || json.content;
    return {
      type: 'info',
      timestamp,
      title: 'system',
      subtitle: subtype,
      content: { type: 'text', text: messageText || rawLine },
      style: 'default'
    };
  }

  private parseSummaryMessage(json: any, timestamp: string): ParsedMessage {
    return {
      type: 'info',
      timestamp,
      title: 'summary',
      content: { type: 'markdown', markdown: json.summary || 'Session summary' },
      style: 'default'
    };
  }

  private extractToolResultContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('');
    }
    return JSON.stringify(content);
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
    // Find first real user message (skip Commands for title extraction)
    const userMsg = messages.find(m => m.type === 'user');
    if (!userMsg || userMsg.type !== 'user') return null;
    
    // Try text content first, then markdown as fallback
    let text = userMsg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join(' ');
    
    if (!text) {
      text = userMsg.content
        .filter(c => c.type === 'markdown')
        .map(c => c.markdown)
        .join(' ');
    }
    
    if (text.length > 100) {
      return text.slice(0, 100) + '...';
    }
    return text || null;
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }
}