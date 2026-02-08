import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JunieSessionFinder, JunieSessionParser } from '../index';

describe('JunieSessionFinder', () => {
  let finder: JunieSessionFinder;

  beforeEach(() => {
    finder = new JunieSessionFinder();
  });

  describe('getBaseDir', () => {
    it('should return correct base directory', () => {
      const baseDir = finder.getBaseDir();
      const homeDir = os.homedir();
      expect(baseDir).toBe(path.join(homeDir, '.junie', 'sessions'));
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

describe('JunieSessionParser', () => {
  let parser: JunieSessionParser;

  beforeEach(() => {
    parser = new JunieSessionParser();
  });

  describe('parseContent', () => {
    it('should parse UserPromptEvent', () => {
      const content = `
        {"kind":"UserPromptEvent","prompt":"Hello, can you help me?"}
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      const userMessages = messages.filter(m => m.type === 'user');
      expect(userMessages).toHaveLength(1);
      
      const userMsg = userMessages[0] as { type: 'user'; content: Array<{ type: string; text: string }> };
      const textContent = userMsg.content.filter(c => c.type === 'text');
      expect(textContent[0].text).toBe('Hello, can you help me?');
    });

    it('should parse AgentResponseEvent', () => {
      const content = `
        {"kind":"AgentResponseEvent","response":"I can help you with that!"}
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      const assistantMessages = messages.filter(m => m.type === 'assistant_text');
      expect(assistantMessages).toHaveLength(1);
    });

    it('should handle empty content', () => {
      const { messages, metadata } = parser.parseContent('', 'test-session');

      expect(messages).toHaveLength(0);
      expect(metadata?.messageCount).toBe(0);
    });

    it('should skip unparseable lines', () => {
      const content = `
        not valid json
        {"kind":"UserPromptEvent","prompt":"Hello"}
        also not json
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      const userMessages = messages.filter(m => m.type === 'user');
      expect(userMessages).toHaveLength(1);
    });

    it('should extract project path from SessionA2uxEvent with blob', () => {
      const blobContent = JSON.stringify({
        lastAgentState: {
          projectStr: {
            content: "Project root directory: /home/user/my-project\nSome other content"
          }
        }
      });
      
      const content = `
        {"kind":"SessionA2uxEvent","event":{"state":"IN_PROGRESS","agentEvent":{"blob":${JSON.stringify(blobContent)}}}}
        {"kind":"UserPromptEvent","prompt":"Hello"}
      `;

      const { metadata } = parser.parseContent(content, 'test-session');

      expect(metadata?.cwd).toBe('/home/user/my-project');
    });

    it('should use first user prompt as title', () => {
      const content = `
        {"kind":"UserPromptEvent","prompt":"This is my question about the code"}
      `;

      const result = parser.parseContent(content, 'test-session');

      expect(result.title).toBe('This is my question about the code');
    });

    it('should truncate long titles', () => {
      const longPrompt = 'A'.repeat(150);
      const content = `
        {"kind":"UserPromptEvent","prompt":"${longPrompt}"}
      `;

      const result = parser.parseContent(content, 'test-session');

      expect(result.title).toBe('A'.repeat(100) + '...');
    });

    it('should handle multiple events in order', () => {
      const content = `
        {"kind":"UserPromptEvent","prompt":"First question"}
        {"kind":"AgentResponseEvent","response":"First answer"}
        {"kind":"UserPromptEvent","prompt":"Second question"}
        {"kind":"AgentResponseEvent","response":"Second answer"}
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      expect(messages).toHaveLength(4);
      expect(messages[0].type).toBe('user');
      expect(messages[1].type).toBe('assistant_text');
      expect(messages[2].type).toBe('user');
      expect(messages[3].type).toBe('assistant_text');
    });
  });

  describe('parseFile', () => {
    it('should return null for non-existent file', () => {
      const result = parser.parseFile('/nonexistent/path/events.jsonl');
      expect(result).toBeNull();
    });

    it('should parse existing file', () => {
      // Create a temp file
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'junie-test-'));
      const tempFile = path.join(tempDir, 'events.jsonl');

      try {
        const content = `
          {"kind":"UserPromptEvent","prompt":"Test question"}
          {"kind":"AgentResponseEvent","response":"Test answer"}
        `;
        fs.writeFileSync(tempFile, content);

        const result = parser.parseFile(tempFile);

        expect(result).not.toBeNull();
        expect(result!.sessionId).toBe(path.basename(tempDir));
        expect(result!.messages).toHaveLength(2);
        expect(result!.title).toBe('Test question');
      } finally {
        // Cleanup
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      }
    });
  });

  describe('parseSession', () => {
    it('should return null for non-existent session', () => {
      const result = parser.parseSession('nonexistent-session-id-12345');
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle content with only whitespace', () => {
      const { messages } = parser.parseContent('   \n\n   ', 'test-session');

      expect(messages).toHaveLength(0);
    });

    it('should handle content with no parseable events', () => {
      const content = `
        {"kind":"UnknownEvent","data":"something"}
        {"kind":"AnotherUnknownEvent","data":"else"}
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      // These events don't create messages in the current implementation
      expect(messages).toHaveLength(0);
    });

    it('should parse array content in events', () => {
      const content = `
        {"kind":"UserPromptEvent","prompt":["Line 1", "Line 2"]}
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      const userMessages = messages.filter(m => m.type === 'user');
      expect(userMessages).toHaveLength(1);
    });

    it('should parse object content with code type', () => {
      const content = `
        {"kind":"UserPromptEvent","prompt":{"type":"code","code":"console.log('hello')","language":"javascript"}}
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      const userMessages = messages.filter(m => m.type === 'user');
      expect(userMessages).toHaveLength(1);
    });

    it('should handle events without timestamp', () => {
      const content = `
        {"kind":"UserPromptEvent","prompt":"No timestamp"}
      `;

      const { messages } = parser.parseContent(content, 'test-session');

      expect(messages).toHaveLength(1);
      expect(messages[0].timestamp).toBeDefined();
    });
  });
});
