import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GeminiSessionFinder, GeminiSessionParser } from '../index';

describe('GeminiSessionFinder', () => {
  let finder: GeminiSessionFinder;

  beforeEach(() => {
    finder = new GeminiSessionFinder();
  });

  describe('getBaseDir', () => {
    it('should return correct base directory path', () => {
      const baseDir = (finder as any).baseDir;
      const homeDir = require('os').homedir();
      expect(baseDir).toBe(path.join(homeDir, '.gemini', 'tmp'));
    });
  });

  describe('readProjectRoot', () => {
    it('should read project path from .project_root file', () => {
      // Create a temporary directory structure
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
      const projectDir = path.join(tmpDir, 'my-mega-memory');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, '.project_root'), '/home/daniel/projects/my-mega-memory');
      
      try {
        // Temporarily override baseDir
        (finder as any).baseDir = tmpDir;
        
        const projectPath = (finder as any).readProjectRoot('my-mega-memory');
        expect(projectPath).toBe('/home/daniel/projects/my-mega-memory');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('should return null when .project_root does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
      
      try {
        (finder as any).baseDir = tmpDir;
        
        const projectPath = (finder as any).readProjectRoot('nonexistent');
        expect(projectPath).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('should return null when .project_root is empty', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
      const projectDir = path.join(tmpDir, 'empty-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, '.project_root'), '');
      
      try {
        (finder as any).baseDir = tmpDir;
        
        const projectPath = (finder as any).readProjectRoot('empty-project');
        expect(projectPath).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe('extractProjectName', () => {
    it('should extract basename from path', () => {
      const name = (finder as any).extractProjectName('/home/daniel/projects/my-mega-memory');
      expect(name).toBe('my-mega-memory');
    });

    it('should handle simple directory names', () => {
      const name = (finder as any).extractProjectName('my-project');
      expect(name).toBe('my-project');
    });
  });

  describe('listSessions', () => {
    it('should find sessions in projects with .project_root', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
      
      // Create project with .project_root and chats
      const projectDir = path.join(tmpDir, 'my-mega-memory');
      const chatsDir = path.join(projectDir, 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, '.project_root'), '/home/user/my-mega-memory');
      
      // Create a session file
      const sessionData = {
        sessionId: 'test-session-123',
        projectHash: 'abc123',
        startTime: '2026-02-11T17:00:00.000Z',
        lastUpdated: '2026-02-11T17:01:00.000Z',
        messages: [{ id: 'msg-1', timestamp: '2026-02-11T17:00:00.000Z', type: 'user', content: 'Hello' }]
      };
      fs.writeFileSync(path.join(chatsDir, 'session-2026-02-11T17-00-test.json'), JSON.stringify(sessionData));
      
      // Create project without .project_root (should be skipped)
      const noRootDir = path.join(tmpDir, 'no-root-project');
      const noRootChatsDir = path.join(noRootDir, 'chats');
      fs.mkdirSync(noRootChatsDir, { recursive: true });
      fs.writeFileSync(path.join(noRootChatsDir, 'session-test.json'), JSON.stringify(sessionData));
      
      try {
        (finder as any).baseDir = tmpDir;
        
        const sessions = finder.listSessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].projectName).toBe('my-mega-memory');
        expect(sessions[0].projectPath).toBe('/home/user/my-mega-memory');
        expect(sessions[0].sessionId).toBe('test-session-123');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('should skip directories without .project_root', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
      
      // Create project without .project_root
      const projectDir = path.join(tmpDir, 'hash-directory');
      const chatsDir = path.join(projectDir, 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });
      
      const sessionData = {
        sessionId: 'test-session-456',
        projectHash: 'def456',
        startTime: '2026-02-11T17:00:00.000Z',
        lastUpdated: '2026-02-11T17:01:00.000Z',
        messages: []
      };
      fs.writeFileSync(path.join(chatsDir, 'session-test.json'), JSON.stringify(sessionData));
      
      try {
        (finder as any).baseDir = tmpDir;
        
        const sessions = finder.listSessions();
        expect(sessions).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('should sort sessions by updated date descending', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
      
      const projectDir = path.join(tmpDir, 'project');
      const chatsDir = path.join(projectDir, 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, '.project_root'), '/home/user/project');
      
      // Create older session
      const oldSession = {
        sessionId: 'old-session',
        projectHash: 'abc',
        startTime: '2026-02-11T10:00:00.000Z',
        lastUpdated: '2026-02-11T10:00:00.000Z',
        messages: []
      };
      fs.writeFileSync(path.join(chatsDir, 'session-old.json'), JSON.stringify(oldSession));
      
      // Create newer session
      const newSession = {
        sessionId: 'new-session',
        projectHash: 'abc',
        startTime: '2026-02-11T12:00:00.000Z',
        lastUpdated: '2026-02-11T12:00:00.000Z',
        messages: []
      };
      fs.writeFileSync(path.join(chatsDir, 'session-new.json'), JSON.stringify(newSession));
      
      try {
        (finder as any).baseDir = tmpDir;
        
        const sessions = finder.listSessions();
        expect(sessions).toHaveLength(2);
        expect(sessions[0].sessionId).toBe('new-session');
        expect(sessions[1].sessionId).toBe('old-session');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });
});

describe('GeminiSessionParser', () => {
  let parser: GeminiSessionParser;
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    parser = new GeminiSessionParser();
  });

  describe('parseFile', () => {
    it('should return null for non-existent file', () => {
      const result = parser.parseFile('/nonexistent/path/session.json');
      expect(result).toBeNull();
    });
  });

  describe('parseContent', () => {
    it('should parse user message', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'user_message.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session).not.toBeNull();
      expect(session.title).toBe('Hello, this is a simple user message');
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].type).toBe('user');
      
      const userMsg = session.messages[0] as { type: 'user'; content: Array<{ type: string; text?: string }> };
      expect(userMsg.content[0].type).toBe('text');
      if (userMsg.content[0].type === 'text') {
        expect(userMsg.content[0].text).toBe('Hello, this is a simple user message');
      }
    });

    it('should parse error message', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'error_message.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session).not.toBeNull();
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].type).toBe('info');
      
      const errorMsg = session.messages[0] as { type: 'info'; title: string; content?: { type: string; text: string } };
      expect(errorMsg.title).toBe('error');
      expect(errorMsg.content?.text).toBe('An error occurred while processing your request');
    });

    it('should parse info message', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'info_message.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session).not.toBeNull();
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].type).toBe('info');
      
      const infoMsg = session.messages[0] as { type: 'info'; title: string; content?: { type: string; text: string } };
      expect(infoMsg.title).toBe('info');
      expect(infoMsg.content?.text).toContain('Gemini CLI update');
    });

    it('should parse simple assistant message', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'assistant_simple.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session).not.toBeNull();
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].type).toBe('assistant_text');
      
      const assistantMsg = session.messages[0] as { type: 'assistant_text'; content: Array<{ type: string; markdown?: string }> };
      expect(assistantMsg.content[0].type).toBe('markdown');
      if (assistantMsg.content[0].type === 'markdown') {
        expect(assistantMsg.content[0].markdown).toBe('This is a simple assistant response without thoughts or tool calls.');
      }
    });

    it('should parse mixed conversation with user, gemini, and tool calls', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'mixed_conversation.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session).not.toBeNull();
      expect(session.messages.length).toBeGreaterThan(0);
      
      // Check metadata
      expect(session.metadata).toBeDefined();
      expect(session.metadata?.models).toBeDefined();
      expect(session.metadata?.models.length).toBeGreaterThan(0);
      expect(session.metadata?.models[0][0]).toBe('gemini-3-flash-preview');
      
      // Should have user messages
      const userMessages = session.messages.filter(m => m.type === 'user');
      expect(userMessages.length).toBeGreaterThan(0);
      
      // Should have thinking messages (from thoughts)
      const thinkingMessages = session.messages.filter(m => m.type === 'assistant_thinking');
      expect(thinkingMessages.length).toBeGreaterThan(0);
      
      // Should have tool_use messages
      const toolUseMessages = session.messages.filter(m => m.type === 'tool_use');
      expect(toolUseMessages.length).toBeGreaterThan(0);
      
      // Should have assistant_text messages
      const assistantMessages = session.messages.filter(m => m.type === 'assistant_text');
      expect(assistantMessages.length).toBeGreaterThan(0);
    });

    it('should parse file with file diff in tool results', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'with_file_diff.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session).not.toBeNull();
      expect(session.messages.length).toBeGreaterThan(0);
      
      // Find tool_use messages with file diffs
      const toolUseMessages = session.messages.filter(m => m.type === 'tool_use');
      expect(toolUseMessages.length).toBeGreaterThan(0);
      
      // Check that at least one tool_use has results
      const toolWithResults = toolUseMessages.find(m => {
        const toolUse = m as { type: 'tool_use'; results?: Array<any> };
        return toolUse.results && toolUse.results.length > 0;
      });
      expect(toolWithResults).toBeDefined();
    });

    it('should parse user message with array content', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'with_file_diff.json'), 'utf-8');
      const session = parser.parseContent(content);

      const userMessages = session.messages.filter(m => m.type === 'user');
      expect(userMessages.length).toBeGreaterThan(0);
      
      // First message should be user with array content
      const firstUserMsg = userMessages[0] as { type: 'user'; content: Array<{ type: string; text?: string }> };
      expect(firstUserMsg.content[0].type).toBe('text');
      if (firstUserMsg.content[0].type === 'text') {
        expect(firstUserMsg.content[0].text).toContain('hello world');
      }
    });

    it('should handle content as string vs array', () => {
      // Test with string content (from mixed_conversation.json)
      const stringContent = fs.readFileSync(path.join(fixturesDir, 'user_message.json'), 'utf-8');
      const stringSession = parser.parseContent(stringContent);
      
      // Test with array content (from with_file_diff.json)
      const arrayContent = fs.readFileSync(path.join(fixturesDir, 'with_file_diff.json'), 'utf-8');
      const arraySession = parser.parseContent(arrayContent);
      
      expect(stringSession.messages).toHaveLength(1);
      expect(arraySession.messages.length).toBeGreaterThan(0);
      
      // Both should have valid user messages
      const stringUser = stringSession.messages.find(m => m.type === 'user') as { type: 'user'; content: Array<any> };
      const arrayUser = arraySession.messages.find(m => m.type === 'user') as { type: 'user'; content: Array<any> };
      
      expect(stringUser).toBeDefined();
      expect(arrayUser).toBeDefined();
      expect(stringUser.content.length).toBeGreaterThan(0);
      expect(arrayUser.content.length).toBeGreaterThan(0);
    });
  });

  describe('title extraction', () => {
    it('should extract title from first user message', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'user_message.json'), 'utf-8');
      const session = parser.parseContent(content);
      expect(session.title).toBe('Hello, this is a simple user message');
    });

    it('should truncate long titles', () => {
      const longMessage = {
        sessionId: 'test-long-title',
        projectHash: 'abc123',
        startTime: '2026-02-08T17:00:00.000Z',
        lastUpdated: '2026-02-08T17:00:00.000Z',
        messages: [
          {
            id: 'msg-001',
            timestamp: '2026-02-08T17:00:00.000Z',
            type: 'user',
            content: 'a'.repeat(150)
          }
        ]
      };
      
      const session = parser.parseContent(JSON.stringify(longMessage));
      expect(session.title.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(session.title.endsWith('...')).toBe(true);
    });

    it('should use default title when no user message exists', () => {
      const noUserMessage = {
        sessionId: 'test-no-user',
        projectHash: 'abc123',
        startTime: '2026-02-08T17:00:00.000Z',
        lastUpdated: '2026-02-08T17:00:00.000Z',
        messages: [
          {
            id: 'msg-001',
            timestamp: '2026-02-08T17:00:00.000Z',
            type: 'gemini',
            content: 'Just an assistant message'
          }
        ]
      };
      
      const session = parser.parseContent(JSON.stringify(noUserMessage));
      expect(session.title).toBe('Gemini Session');
    });
  });

  describe('metadata extraction', () => {
    it('should extract model information from messages', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'mixed_conversation.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session.metadata).toBeDefined();
      expect(session.metadata?.models).toBeDefined();
      expect(session.metadata?.models.length).toBeGreaterThan(0);
      
      // Should have gemini-3-flash-preview model
      const modelEntry = session.metadata?.models.find(m => m[0] === 'gemini-3-flash-preview');
      expect(modelEntry).toBeDefined();
      expect(modelEntry![1]).toBeGreaterThan(0); // Count should be > 0
    });

    it('should track message count', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'mixed_conversation.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session.metadata?.messageCount).toBeGreaterThan(0);
    });

    it('should extract timestamps', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'user_message.json'), 'utf-8');
      const session = parser.parseContent(content);

      expect(session.metadata?.created).toBe('2026-02-08T17:00:00.000Z');
      expect(session.metadata?.modified).toBe('2026-02-08T17:01:00.000Z');
    });
  });

  describe('thought parsing', () => {
    it('should parse thoughts into assistant_thinking messages', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'mixed_conversation.json'), 'utf-8');
      const session = parser.parseContent(content);

      const thinkingMessages = session.messages.filter(m => m.type === 'assistant_thinking');
      expect(thinkingMessages.length).toBeGreaterThan(0);
      
      const firstThought = thinkingMessages[0] as { type: 'assistant_thinking'; thinking: string };
      expect(firstThought.thinking).toContain('Determining Project Identity');
    });

    it('should handle empty thoughts array', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'assistant_simple.json'), 'utf-8');
      const session = parser.parseContent(content);

      // Should not create thinking messages when thoughts array is empty
      const thinkingMessages = session.messages.filter(m => m.type === 'assistant_thinking');
      expect(thinkingMessages).toHaveLength(0);
    });
  });

  describe('tool call parsing', () => {
    it('should parse tool calls with input arguments', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'mixed_conversation.json'), 'utf-8');
      const session = parser.parseContent(content);

      const toolUseMessages = session.messages.filter(m => m.type === 'tool_use');
      expect(toolUseMessages.length).toBeGreaterThan(0);
      
      // Find the read_file tool
      const readFileTool = toolUseMessages.find(m => {
        const tool = m as { type: 'tool_use'; toolName: string };
        return tool.toolName === 'ReadFile';
      }) as { type: 'tool_use'; toolName: string; input: Record<string, string> };
      
      expect(readFileTool).toBeDefined();
      expect(readFileTool.input).toHaveProperty('file_path');
      expect(readFileTool.input.file_path).toBe('package.json');
    });

    it('should connect tool results to tool use', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'mixed_conversation.json'), 'utf-8');
      const session = parser.parseContent(content);

      const toolUseMessages = session.messages.filter(m => m.type === 'tool_use');
      
      // Find a tool with results
      const toolWithResults = toolUseMessages.find(m => {
        const tool = m as { type: 'tool_use'; results?: Array<any> };
        return tool.results && tool.results.length > 0;
      }) as { type: 'tool_use'; results: Array<{ output: string }> };
      
      expect(toolWithResults).toBeDefined();
      expect(toolWithResults.results.length).toBeGreaterThan(0);
      expect(toolWithResults.results[0].output).toContain('my-mega-memory');
    });

    it('should parse file diff from resultDisplay', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'with_file_diff.json'), 'utf-8');
      const session = parser.parseContent(content);

      const toolUseMessages = session.messages.filter(m => m.type === 'tool_use');
      
      // Find write_file tool with diff
      const writeFileTool = toolUseMessages.find(m => {
        const tool = m as { type: 'tool_use'; toolName: string; results: Array<any> };
        return tool.toolName === 'WriteFile' && tool.results.some(r => 
          r.output && r.output.includes('Index:')
        );
      });
      
      expect(writeFileTool).toBeDefined();
    });
  });
});
