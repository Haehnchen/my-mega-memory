import * as fs from 'fs';
import * as path from 'path';
import { KiloSessionFinder, KiloSessionParser } from '../index';

describe('KiloSessionFinder', () => {
  let finder: KiloSessionFinder;
  let tempDir: string;
  let originalBaseDir: string;

  beforeEach(() => {
    finder = new KiloSessionFinder();
    // Store the original baseDir
    originalBaseDir = (finder as any).baseDir;
  });

  afterEach(() => {
    // Restore original baseDir
    (finder as any).baseDir = originalBaseDir;
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('getBaseDir', () => {
    it('should return correct base directory', () => {
      const result = finder.getBaseDir();
      const homeDir = require('os').homedir();
      expect(result).toBe(path.join(homeDir, '.kilocode', 'cli'));
    });
  });

  describe('listSessionFiles', () => {
    it('should return empty array when workspace-map.json does not exist', () => {
      // Use a temp directory that doesn't have a workspace-map.json
      tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kilo-test-empty-'));
      (finder as any).baseDir = tempDir;
      
      const sessions = finder.listSessionFiles();
      expect(sessions).toEqual([]);
    });

    it('should list sessions from all workspaces with project paths', () => {
      // Create temp kilo directory structure
      tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kilo-test-'));
      (finder as any).baseDir = tempDir;

      const workspacesDir = path.join(tempDir, 'workspaces');
      const tasksDir = path.join(tempDir, 'global', 'tasks');
      fs.mkdirSync(workspacesDir, { recursive: true });
      fs.mkdirSync(tasksDir, { recursive: true });

      // Create workspace-map.json
      const workspaceMap = {
        '/home/user/myproject': 'myproject-abc123',
        '/home/user/another-project': 'another-project-def456'
      };
      fs.writeFileSync(
        path.join(workspacesDir, 'workspace-map.json'),
        JSON.stringify(workspaceMap)
      );

      // Create session.json for first project
      const sessionDir1 = path.join(workspacesDir, 'myproject-abc123');
      fs.mkdirSync(sessionDir1, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir1, 'session.json'),
        JSON.stringify({
          taskSessionMap: {
            'task-123': 'session-456'
          }
        })
      );

      // Create session.json for second project
      const sessionDir2 = path.join(workspacesDir, 'another-project-def456');
      fs.mkdirSync(sessionDir2, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir2, 'session.json'),
        JSON.stringify({
          taskSessionMap: {
            'task-789': 'session-012'
          }
        })
      );

      // Create task directories
      fs.mkdirSync(path.join(tasksDir, 'task-123'), { recursive: true });
      fs.mkdirSync(path.join(tasksDir, 'task-789'), { recursive: true });

      const sessions = finder.listSessionFiles();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toMatchObject({
        taskId: 'task-123',
        sessionId: 'session-456',
        projectPath: '/home/user/myproject'
      });
      expect(sessions[1]).toMatchObject({
        taskId: 'task-789',
        sessionId: 'session-012',
        projectPath: '/home/user/another-project'
      });
    });

    it('should skip tasks that do not exist in tasks directory', () => {
      tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kilo-test-'));
      (finder as any).baseDir = tempDir;

      const workspacesDir = path.join(tempDir, 'workspaces');
      const tasksDir = path.join(tempDir, 'global', 'tasks');
      fs.mkdirSync(workspacesDir, { recursive: true });
      fs.mkdirSync(tasksDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspacesDir, 'workspace-map.json'),
        JSON.stringify({ '/home/user/project': 'project-abc123' })
      );

      const sessionDir = path.join(workspacesDir, 'project-abc123');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir, 'session.json'),
        JSON.stringify({
          taskSessionMap: {
            'existing-task': 'session-1',
            'missing-task': 'session-2'
          }
        })
      );

      // Only create one task directory
      fs.mkdirSync(path.join(tasksDir, 'existing-task'), { recursive: true });

      const sessions = finder.listSessionFiles();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].taskId).toBe('existing-task');
    });

    it('should handle project names with dashes', () => {
      tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kilo-test-'));
      (finder as any).baseDir = tempDir;

      const workspacesDir = path.join(tempDir, 'workspaces');
      const tasksDir = path.join(tempDir, 'global', 'tasks');
      fs.mkdirSync(workspacesDir, { recursive: true });
      fs.mkdirSync(tasksDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspacesDir, 'workspace-map.json'),
        JSON.stringify({
          '/home/user/my-awesome-project': 'my-awesome-project-xyz789',
          '/home/user/idea-de-espend-ml-llm': 'idea-de-espend-ml-llm-abc123'
        })
      );

      const sessionDir1 = path.join(workspacesDir, 'my-awesome-project-xyz789');
      fs.mkdirSync(sessionDir1, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir1, 'session.json'),
        JSON.stringify({ taskSessionMap: { 'task-1': 'session-1' } })
      );

      const sessionDir2 = path.join(workspacesDir, 'idea-de-espend-ml-llm-abc123');
      fs.mkdirSync(sessionDir2, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir2, 'session.json'),
        JSON.stringify({ taskSessionMap: { 'task-2': 'session-2' } })
      );

      fs.mkdirSync(path.join(tasksDir, 'task-1'), { recursive: true });
      fs.mkdirSync(path.join(tasksDir, 'task-2'), { recursive: true });

      const sessions = finder.listSessionFiles();

      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.projectPath)).toContain('/home/user/my-awesome-project');
      expect(sessions.map(s => s.projectPath)).toContain('/home/user/idea-de-espend-ml-llm');
    });
  });
});

describe('KiloSessionParser', () => {
  let parser: KiloSessionParser;
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    parser = new KiloSessionParser();
  });

  describe('parseContent', () => {
    it('should parse user text message', () => {
      const uiMessages: any[] = [
        { ts: 1700000000000, type: 'say', say: 'text', text: 'Hello, how can I help?' }
      ];
      const metadata: any = {};

      const apiHistory: any[] = [];
      const { messages } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('user');
      if (messages[0].type === 'user') {
        expect(messages[0].content[0].type).toBe('text');
        if (messages[0].content[0].type === 'text') {
          expect(messages[0].content[0].text).toBe('Hello, how can I help?');
        }
      }
    });

    it('should parse reasoning message', () => {
      const uiMessages: any[] = [
        { ts: 1700000000100, type: 'say', say: 'reasoning', text: 'Let me think about this...' }
      ];
      const metadata: any = {};

      const apiHistory: any[] = [];
      const { messages } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('assistant_thinking');
      if (messages[0].type === 'assistant_thinking') {
        expect(messages[0].thinking).toBe('Let me think about this...');
      }
    });

    it('should parse tool use message', () => {
      const uiMessages: any[] = [
        { 
          ts: 1700000000400, 
          type: 'ask', 
          ask: 'tool', 
          text: JSON.stringify({ tool: 'readFile', path: '/test/file.txt' })
        }
      ];
      const metadata: any = {};

      const apiHistory: any[] = [];
      const { messages } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');
      if (messages[0].type === 'tool_use') {
        expect(messages[0].toolName).toBe('readFile');
        expect(messages[0].input.path).toBe('/test/file.txt');
      }
    });

    it('should parse updateTodoList tool', () => {
      const uiMessages: any[] = [
        { 
          ts: 1700000000500, 
          type: 'ask', 
          ask: 'tool', 
          text: JSON.stringify({ 
            tool: 'updateTodoList', 
            todos: [
              { id: '1', content: 'Task 1', status: 'pending' },
              { id: '2', content: 'Task 2', status: 'done' }
            ]
          })
        }
      ];
      const metadata: any = {};

      const apiHistory: any[] = [];
      const { messages } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');
      if (messages[0].type === 'tool_use') {
        expect(messages[0].toolName).toBe('updateTodoList');
        expect(messages[0].input.todos).toBeDefined();
      }
    });

    it('should parse followup message', () => {
      const uiMessages: any[] = [
        { ts: 1700000000600, type: 'ask', ask: 'followup', text: 'Would you like me to continue?' }
      ];
      const metadata: any = {};

      const apiHistory: any[] = [];
      const { messages } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('info');
      if (messages[0].type === 'info') {
        expect(messages[0].title).toBe('followup');
      }
    });

    it('should parse error message', () => {
      const uiMessages: any[] = [
        { ts: 1700000000700, type: 'say', say: 'error', text: 'Something went wrong' }
      ];
      const metadata: any = {};

      const apiHistory: any[] = [];
      const { messages } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('info');
      if (messages[0].type === 'info') {
        expect(messages[0].title).toBe('error');
        expect(messages[0].style).toBe('error');
      }
    });

    it('should extract title from first user message', () => {
      const uiMessages: any[] = [
        { ts: 1700000000000, type: 'say', say: 'text', text: 'This is my question' },
        { ts: 1700000000100, type: 'say', say: 'reasoning', text: 'Thinking...' }
      ];
      const apiHistory: any[] = [];
      const metadata: any = {};

      const title = parser['extractTitle'](uiMessages, apiHistory);

      expect(title).toBe('This is my question');
    });

    it('should truncate long titles', () => {
      const uiMessages: any[] = [
        { ts: 1700000000000, type: 'say', say: 'text', text: 'a'.repeat(150) }
      ];
      const apiHistory: any[] = [];
      const metadata: any = {};

      const title = parser['extractTitle'](uiMessages, apiHistory);

      expect(title).toBe('a'.repeat(100) + '...');
    });

    it('should extract title from API history if no UI messages', () => {
      const uiMessages: any[] = [];
      const apiHistory: any[] = [
        { role: 'user', content: [{ type: 'text', text: 'API question' }] }
      ];
      const metadata: any = {};

      const title = parser['extractTitle'](uiMessages, apiHistory);

      expect(title).toBe('API question');
    });

    it('should extract workspace from metadata cwd', () => {
      const uiMessages: any[] = [];
      const apiHistory: any[] = [];
      const metadata: any = { cwd: '/home/user/myproject' };

      const { metadata: sessionMetadata } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(sessionMetadata.cwd).toBe('/home/user/myproject');
    });

    it('should extract workspace from files_in_context', () => {
      const uiMessages: any[] = [];
      const apiHistory: any[] = [];
      const metadata: any = { 
        files_in_context: [{ path: '/home/user/myproject/src/file.ts' }]
      };

      const { metadata: sessionMetadata } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(sessionMetadata.cwd).toBe('/home/user/myproject/src');
    });

    it('should track timestamps', () => {
      const uiMessages: any[] = [
        { ts: 1700000000000, type: 'say', say: 'text', text: 'First' },
        { ts: 1700000100000, type: 'say', say: 'text', text: 'Last' }
      ];
      const apiHistory: any[] = [];
      const metadata: any = {};

      const { metadata: sessionMetadata } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(sessionMetadata.created).toBe(new Date(1700000000000).toISOString());
      expect(sessionMetadata.modified).toBe(new Date(1700000100000).toISOString());
    });

    it('should extract model from API history', () => {
      const uiMessages: any[] = [];
      const apiHistory: any[] = [
        { 
          role: 'user', 
          content: [{ 
            type: 'text', 
            text: '<environment_details>\n<model>minimax/minimax-m2.1:free</model>\n</environment_details>' 
          }] 
        }
      ];
      const metadata: any = {};

      const { metadata: sessionMetadata } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(sessionMetadata.models).toHaveLength(1);
      expect(sessionMetadata.models[0][0]).toBe('minimax/minimax-m2.1:free');
      expect(sessionMetadata.models[0][1]).toBe(1);
    });

    it('should handle API history without model tag', () => {
      const uiMessages: any[] = [];
      const apiHistory: any[] = [
        { 
          role: 'user', 
          content: [{ 
            type: 'text', 
            text: '<environment_details>\n</environment_details>' 
          }] 
        }
      ];
      const metadata: any = {};

      const { metadata: sessionMetadata } = parser.parseContent(uiMessages, apiHistory, metadata, '/test/task');

      expect(sessionMetadata.models).toHaveLength(0);
    });
  });

  describe('parseSession', () => {
    it('should return null for non-existent task path', () => {
      const result = parser.parseSession('/nonexistent/path', 'test-session');
      expect(result).toBeNull();
    });

    it('should parse complete session from files', () => {
      // Create temporary test files
      const tempDir = require('os').tmpdir();
      const taskDir = path.join(tempDir, `kilo-test-task-${Date.now()}`);
      
      try {
        fs.mkdirSync(taskDir, { recursive: true });
        
        fs.writeFileSync(
          path.join(taskDir, 'ui_messages.json'),
          JSON.stringify([
            { ts: 1700000000000, type: 'say', say: 'text', text: 'Test question' },
            { ts: 1700000000100, type: 'say', say: 'reasoning', text: 'Let me analyze' }
          ])
        );
        
        fs.writeFileSync(
          path.join(taskDir, 'api_conversation_history.json'),
          JSON.stringify([
            { role: 'user', content: [{ type: 'text', text: 'Test question' }] }
          ])
        );
        
        fs.writeFileSync(
          path.join(taskDir, 'task_metadata.json'),
          JSON.stringify({ cwd: '/home/user/project' })
        );

        const session = parser.parseSession(taskDir, 'test-session-123');

        expect(session).not.toBeNull();
        expect(session!.sessionId).toBe('test-session-123');
        expect(session!.title).toBe('Test question');
        expect(session!.messages).toHaveLength(2);
        expect(session!.metadata?.cwd).toBe('/home/user/project');
      } finally {
        // Cleanup
        if (fs.existsSync(taskDir)) {
          fs.rmSync(taskDir, { recursive: true });
        }
      }
    });
  });

  describe('fixture files', () => {
    it('should parse fixture files', () => {
      const uiMessagesPath = path.join(fixturesDir, 'ui_messages.json');
      if (fs.existsSync(uiMessagesPath)) {
        const uiMessages: any[] = JSON.parse(fs.readFileSync(uiMessagesPath, 'utf-8'));
        const apiHistory: any[] = [];
        const metadataPath = path.join(fixturesDir, 'task_metadata.json');
        const metadata: any = fs.existsSync(metadataPath)
          ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
          : {};

        const { messages, metadata: sessionMetadata } = parser.parseContent(
          uiMessages, apiHistory, metadata, '/test/task'
        );

        expect(messages.length).toBeGreaterThan(0);
        expect(sessionMetadata).toBeDefined();
      }
    });
  });
});
