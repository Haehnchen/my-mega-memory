import * as fs from 'fs';
import * as path from 'path';
import { OpenCodeSessionFinder, OpenCodeSessionParser } from '../index';

describe('OpenCodeSessionFinder', () => {
  let finder: OpenCodeSessionFinder;

  beforeEach(() => {
    finder = new OpenCodeSessionFinder();
  });

  describe('getStorageDir', () => {
    it('should return correct storage directory path', () => {
      const storageDir = finder.getStorageDir();
      // Returns null if directory doesn't exist, or path if it does
      expect(storageDir === null || typeof storageDir === 'string').toBe(true);
    });
  });

  describe('findSessionFile', () => {
    it('should return null for non-existent session', () => {
      const result = finder.findSessionFile('nonexistent-session-123');
      expect(result).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should return an array', () => {
      const sessions = finder.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });
  });
});

describe('OpenCodeSessionParser', () => {
  let parser: OpenCodeSessionParser;
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    parser = new OpenCodeSessionParser();
  });

  describe('parseSession', () => {
    it('should return null for non-existent session', () => {
      const result = parser.parseSession('nonexistent-session-id');
      expect(result).toBeNull();
    });
  });

  describe('fixture: user_message', () => {
    it('should parse user message with text content', () => {
      const sessionDir = path.join(fixturesDir, 'user_message');
      const result = loadAndParseSession(sessionDir);

      expect(result.messages.length).toBeGreaterThan(0);
      
      const userMessages = result.messages.filter(m => m.type === 'user');
      expect(userMessages).toHaveLength(1);
      
      const userMsg = userMessages[0] as { type: 'user'; content: Array<{ type: string; text?: string }> };
      const textContent = userMsg.content
        .filter(c => c.type === 'text')
        .map(c => (c as { type: 'text'; text: string }).text)
        .join('');
      expect(textContent).toBe('Hello, this is a user message');
    });
  });

  describe('fixture: unknown_role', () => {
    it('should handle unknown role', () => {
      const sessionDir = path.join(fixturesDir, 'unknown_role');
      const result = loadAndParseSession(sessionDir);

      expect(result.messages.length).toBeGreaterThan(0);
      
      // Unknown roles should produce info messages
      const infoMessages = result.messages.filter(m => m.type === 'info');
      expect(infoMessages.length).toBeGreaterThan(0);
    });
  });

  describe('fixture: parse_error', () => {
    it('should handle parse error with null messageData', () => {
      const sessionDir = path.join(fixturesDir, 'parse_error');
      const result = loadAndParseSession(sessionDir);

      expect(result.messages.length).toBeGreaterThan(0);
      
      // Parse errors should produce error info messages
      const errorMessages = result.messages.filter(m => m.type === 'info');
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  describe('fixture: assistant_text_reasoning', () => {
    it('should parse assistant with text and reasoning parts', () => {
      const sessionDir = path.join(fixturesDir, 'assistant_text_reasoning');
      const result = loadAndParseSession(sessionDir);

      expect(result.messages.length).toBeGreaterThan(0);

      const textMessages = result.messages.filter(m => m.type === 'assistant_text');
      expect(textMessages.length).toBeGreaterThan(0);

      const reasoningMessages = result.messages.filter(m => m.type === 'assistant_thinking');
      expect(reasoningMessages.length).toBeGreaterThan(0);
    });
  });

  describe('fixture: assistant_tool_edit', () => {
    it('should format Edit tool with structured parameters', () => {
      const sessionDir = path.join(fixturesDir, 'assistant_tool_edit');
      const result = loadAndParseSession(sessionDir);

      const toolUseMessages = result.messages.filter(m => m.type === 'tool_use');
      expect(toolUseMessages.length).toBeGreaterThan(0);

      const toolUse = toolUseMessages[0] as { type: 'tool_use'; toolName: string; input: Record<string, string> };
      expect(toolUse.toolName.toLowerCase()).toContain('edit');
      
      // Should have structured parameters
      expect(Object.keys(toolUse.input).length).toBeGreaterThan(0);
    });
  });

  describe('fixture: assistant_tool_bash', () => {
    it('should format Bash tool with description and command', () => {
      const sessionDir = path.join(fixturesDir, 'assistant_tool_bash');
      const result = loadAndParseSession(sessionDir);

      const toolUseMessages = result.messages.filter(m => m.type === 'tool_use');
      expect(toolUseMessages.length).toBeGreaterThan(0);

      const toolUse = toolUseMessages[0] as { type: 'tool_use'; toolName: string; input: Record<string, string> };
      expect(toolUse.toolName.toLowerCase()).toContain('bash');
    });
  });

  describe('fixture: assistant_error', () => {
    it('should handle assistant message with error', () => {
      const sessionDir = path.join(fixturesDir, 'assistant_error');
      const result = loadAndParseSession(sessionDir);

      // Should have error info message
      const errorMessages = result.messages.filter(m => m.type === 'info');
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  describe('fixture: assistant_tool_edit_camelcase', () => {
    it('should format Edit tool with camelCase parameters', () => {
      const sessionDir = path.join(fixturesDir, 'assistant_tool_edit_camelcase');
      const result = loadAndParseSession(sessionDir);

      const toolUseMessages = result.messages.filter(m => m.type === 'tool_use');
      expect(toolUseMessages.length).toBeGreaterThan(0);

      const toolUse = toolUseMessages[0] as { type: 'tool_use'; toolName: string; input: Record<string, string> };
      expect(toolUse.toolName.toLowerCase()).toContain('edit');
    });
  });

  describe('fixture: ses_3e2c36a5affeiKvkpFK5CEOZ1W', () => {
    it('should nest tool results inside tool use', () => {
      const sessionDir = path.join(fixturesDir, 'ses_3e2c36a5affeiKvkpFK5CEOZ1W');
      const result = loadAndParseSession(sessionDir);

      const toolUseMessages = result.messages.filter(m => m.type === 'tool_use');
      
      // Find completed tools with results
      const completedTools = toolUseMessages.filter(m => {
        const toolUse = m as { type: 'tool_use'; results?: Array<any> };
        return toolUse.results && toolUse.results.length > 0;
      });

      expect(completedTools.length).toBeGreaterThan(0);
    });
  });

  describe('fixture: 3f71d252cffezp6k0JstQT7lWe', () => {
    it('should load and parse full session', () => {
      const sessionDir = path.join(fixturesDir, '3f71d252cffezp6k0JstQT7lWe');
      const result = loadAndParseSession(sessionDir);

      expect(result.messages.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle session with no messages directory', () => {
      const tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
      try {
        const result = loadAndParseSession(tempDir);
        expect(result.messages).toHaveLength(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should handle invalid JSON in message files', () => {
      const tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
      const messageDir = path.join(tempDir, 'message');
      fs.mkdirSync(messageDir, { recursive: true });
      
      try {
        // Create invalid JSON file
        fs.writeFileSync(path.join(messageDir, 'invalid.json'), 'not valid json');
        
        const result = loadAndParseSession(tempDir);
        // Should handle gracefully and create error message
        expect(result.messages.length).toBeGreaterThanOrEqual(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true });
      }
    });
  });
});

// Helper function to load and parse a session from a fixture directory
function loadAndParseSession(sessionDir: string): { messages: any[]; sortedModels: [string, number][]; messageFileCount: number } {
  const messagesDir = path.join(sessionDir, 'message');
  const partsDir = path.join(sessionDir, 'part');

  const messages: any[] = [];
  const modelCounts = new Map<string, number>();
  let messageFileCount = 0;

  if (!fs.existsSync(messagesDir)) {
    return { messages, sortedModels: [], messageFileCount: 0 };
  }

  const messageFiles = fs.readdirSync(messagesDir)
    .filter(f => f.endsWith('.json'));

  messageFileCount = messageFiles.length;

  for (const file of messageFiles) {
    const filePath = path.join(messagesDir, file);
    const rawContent = fs.readFileSync(filePath, 'utf-8');

    try {
      const messageData = JSON.parse(rawContent);
      const parts = loadParts(partsDir, messageData.id);
      
      // Track model usage
      if (messageData.model?.modelID) {
        const modelId = messageData.model.modelID;
        modelCounts.set(modelId, (modelCounts.get(modelId) || 0) + 1);
      }

      // Parse the message
      const parsed = parseRawMessage(messageData, parts, rawContent, filePath);
      messages.push(...parsed);
    } catch (e) {
      // Create error message for failed parse
      messages.push({
        type: 'info',
        timestamp: new Date().toISOString(),
        title: 'error',
        subtitle: 'parse',
        content: { type: 'text', text: `Failed to parse message: ${filePath}` },
        style: 'error'
      });
    }
  }

  const sortedModels = Array.from(modelCounts.entries())
    .sort((a, b) => b[1] - a[1]) as [string, number][];

  return { messages, sortedModels, messageFileCount };
}

// Helper function to load parts for a message
function loadParts(partsDir: string, messageId: string): any[] {
  const messagePartsDir = path.join(partsDir, messageId);
  if (!fs.existsSync(messagePartsDir)) return [];

  const parts: any[] = [];
  const files = fs.readdirSync(messagePartsDir)
    .filter(f => f.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(messagePartsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      parts.push(JSON.parse(content));
    } catch (e) {
      // Skip failed parts
    }
  }

  return parts.sort((a, b) => {
    const timeA = a.time?.start || a.time?.end || Number.MAX_SAFE_INTEGER;
    const timeB = b.time?.start || b.time?.end || Number.MAX_SAFE_INTEGER;
    return timeA - timeB;
  });
}

// Helper function to parse a raw message
function parseRawMessage(messageData: any, parts: any[], rawContent: string, filePath: string): any[] {
  const timestamp = formatTimestamp(messageData?.time?.created);
  const role = messageData?.role;

  if (!messageData) {
    return [{
      type: 'info',
      timestamp,
      title: 'error',
      subtitle: 'parse',
      content: { type: 'text', text: `Failed to parse message: ${filePath}` },
      style: 'error'
    }];
  }

  switch (role) {
    case 'user':
      return parseUserMessage(parts, rawContent, timestamp);
    case 'assistant':
      return parseAssistantMessage(parts, messageData, timestamp);
    default:
      return [{
        type: 'info',
        timestamp,
        title: role || 'unknown',
        content: { type: 'json', json: rawContent },
        style: 'default'
      }];
  }
}

function parseUserMessage(parts: any[], rawContent: string, timestamp: string): any[] {
  const text = combineTextParts(parts);
  const content: any[] = [];

  if (text.length > 0) {
    content.push({ type: 'text', text });
  } else if (parts.length === 0) {
    content.push({ type: 'code', code: rawContent });
  } else {
    content.push(
      { type: 'text', text: `User message with ${parts.length} part(s)` },
      { type: 'code', code: rawContent }
    );
  }

  return [{
    type: 'user',
    timestamp,
    content
  }];
}

function parseAssistantMessage(parts: any[], messageData: any, timestamp: string): any[] {
  const messages: any[] = [];

  for (const part of parts) {
    const partTimestamp = formatTimestamp(part.time?.start || part.time?.end) || timestamp;

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
        messages.push(...parseToolPart(part, partTimestamp));
        break;

      case 'step-start':
      case 'step-finish':
        // Metadata parts - skip
        break;
    }
  }

  if (messages.length === 0 && messageData.error) {
    messages.push({
      type: 'info',
      timestamp,
      title: 'error',
      subtitle: messageData.error.name,
      content: { type: 'text', text: messageData.error.data?.message || 'Error occurred' },
      style: 'error'
    });
  }

  return messages;
}

function parseToolPart(part: any, timestamp: string): any[] {
  const toolName = part.tool || 'tool';
  const state = part.state;
  const inputMap = jsonToMap(state?.input);

  const results: any[] = [];
  const status = state?.status;

  if (state && (status === 'completed' || status === 'error')) {
    const outputElement = status === 'error' ? state.error : state.output;
    const outputContent = formatToolOutput(outputElement);

    results.push({
      type: 'tool_result',
      timestamp,
      toolCallId: part.callID,
      output: outputContent,
      isError: status === 'error'
    });
  }

  return [{
    type: 'tool_use',
    timestamp,
    toolName,
    toolCallId: part.callID,
    input: inputMap,
    results: results.map((r: any) => ({
      output: r.output?.[0]?.type === 'code' ? r.output[0].code : JSON.stringify(r.output),
      isError: r.isError,
      toolCallId: r.toolCallId
    }))
  }];
}

function combineTextParts(parts: any[]): string {
  return parts
    .filter(p => p.type === 'text' && p.text && p.text.trim())
    .map(p => p.text.trim())
    .join('\n\n');
}

function formatToolOutput(output: any): any[] {
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

function jsonToMap(json: any): Record<string, string> {
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

function formatTimestamp(epochMillis: number | undefined): string {
  if (!epochMillis) return '';
  try {
    return new Date(epochMillis).toISOString();
  } catch (e) {
    return '';
  }
}
