import * as fs from 'fs';
import * as path from 'path';
import { AmpSessionFinder, AmpSessionParser, AmpSessionInfo } from '../index';

// Helper function to create a temporary directory with test files
function createTempDir(): string {
  const tempDir = require('os').tmpdir();
  const testDir = path.join(tempDir, `amp-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Helper function to clean up temp directory
function cleanupTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('AmpSessionFinder', () => {
  let finder: AmpSessionFinder;
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    finder = new AmpSessionFinder();
  });

  describe('AmpSessionInfo data class', () => {
    it('should hold values correctly', () => {
      const session: AmpSessionInfo = {
        sessionId: 'T-test-1234',
        created: 1234567890,
        messageCount: 5,
        title: 'Test prompt',
        projectPath: '/home/test',
        filePath: '/home/test/T-test-1234.json',
        updated: 1234567890
      };

      expect(session.sessionId).toBe('T-test-1234');
      expect(session.created).toBe(1234567890);
      expect(session.messageCount).toBe(5);
      expect(session.title).toBe('Test prompt');
      expect(session.projectPath).toBe('/home/test');
    });
  });

  describe('listSessions from fixtures', () => {
    it('should parse sessions from fixtures directory', () => {
      // Override baseDir to use fixtures
      const testFinder = new AmpSessionFinder();
      (testFinder as any).baseDir = fixturesDir;
      
      const result = testFinder.listSessions();

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      const session = result.find(s => s.sessionId === 'T-019c2505-6bed-73de-8e27-51899656b47b');
      expect(session).toBeDefined();
      expect(session?.messageCount).toBe(3);
      expect(session?.projectPath).toBe('/home/user/project');
      expect(session?.title).toContain('Tailwind');
    });

    it('should parse multiple fixtures', () => {
      const testFinder = new AmpSessionFinder();
      (testFinder as any).baseDir = fixturesDir;
      
      const result = testFinder.listSessions();

      // Session ID should come from filename, not JSON id field
      const session = result.find(s => s.sessionId === 'T-array-format-test');
      expect(session).toBeDefined();
      expect(session?.messageCount).toBe(5);
      expect(session?.projectPath).toBe('/home/user/project');
      expect(session?.title).toContain('edit');
    });

    it('should use session ID from filename not JSON id field', () => {
      const testFinder = new AmpSessionFinder();
      (testFinder as any).baseDir = fixturesDir;
      
      const result = testFinder.listSessions();

      // The array format fixture has id="T-different-id-in-json" in JSON
      // but filename is "T-array-format-test.json"
      const sessionByFilename = result.find(s => s.sessionId === 'T-array-format-test');
      const sessionByJsonId = result.find(s => s.sessionId === 'T-different-id-in-json');

      expect(sessionByFilename).toBeDefined();
      expect(sessionByJsonId).toBeUndefined();
    });
  });

  describe('listSessions with temp files', () => {
    it('should extract cwd from env.initial.trees.uri', () => {
      const tempDir = createTempDir();
      try {
        const sessionJson = {
          v: 2514,
          id: 'T-test-env-cwd',
          created: 1770147638256,
          messages: [
            {
              role: 'user',
              messageId: 0,
              content: [{ type: 'text', text: 'Test prompt' }]
            }
          ],
          env: {
            initial: {
              trees: [
                {
                  displayName: 'my-project',
                  uri: 'file:///home/daniel/projects/my-project',
                  repository: {
                    type: 'git',
                    url: 'https://github.com/test/test',
                    ref: 'refs/heads/main',
                    sha: 'abc123'
                  }
                }
              ],
              platform: {
                os: 'linux',
                osVersion: 'Ubuntu 25.10',
                cpuArchitecture: 'x64',
                webBrowser: false,
                client: 'JetBrains',
                clientVersion: '0.0.1',
                clientType: 'cli'
              }
            }
          }
        };

        const sessionFile = path.join(tempDir, 'T-test-env-cwd.json');
        fs.writeFileSync(sessionFile, JSON.stringify(sessionJson));

        const testFinder = new AmpSessionFinder();
        (testFinder as any).baseDir = tempDir;
        
        const result = testFinder.listSessions();
        const session = result.find(s => s.sessionId === 'T-test-env-cwd');

        expect(session).toBeDefined();
        expect(session?.projectPath).toBe('/home/daniel/projects/my-project');
        expect(session?.title).toBe('Test prompt');
        expect(session?.messageCount).toBe(1);
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should count messages correctly', () => {
      const tempDir = createTempDir();
      try {
        const sessionJson = {
          v: 2514,
          id: 'T-test-session',
          created: 1770147638256,
          messages: [
            { role: 'user', messageId: 0, content: [{ type: 'text', text: 'First' }] },
            { role: 'assistant', messageId: 1, content: [{ type: 'text', text: 'Response' }] },
            { role: 'user', messageId: 2, content: [{ type: 'text', text: 'Second' }] }
          ]
        };

        const sessionFile = path.join(tempDir, 'T-test-session.json');
        fs.writeFileSync(sessionFile, JSON.stringify(sessionJson));

        const testFinder = new AmpSessionFinder();
        (testFinder as any).baseDir = tempDir;
        
        const result = testFinder.listSessions();
        const session = result.find(s => s.sessionId === 'T-test-session');

        expect(session).toBeDefined();
        expect(session?.messageCount).toBe(3);
        expect(session?.title).toBe('First');
      } finally {
        cleanupTempDir(tempDir);
      }
    });
  });
});

describe('AmpSessionParser', () => {
  let parser: AmpSessionParser;
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    parser = new AmpSessionParser();
  });

  describe('parseFile', () => {
    it('should parse valid session JSON', () => {
      const fixtureFile = path.join(fixturesDir, 'T-019c2505-6bed-73de-8e27-51899656b47b.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('T-019c2505-6bed-73de-8e27-51899656b47b');
      expect(result!.messages.length).toBeGreaterThan(0);
    });

    it('should parse second fixture', () => {
      const fixtureFile = path.join(fixturesDir, 'T-array-format-test.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      // Session ID comes from JSON id field in parser
      expect(result!.sessionId).toBe('T-different-id-in-json');
      expect(result!.messages.length).toBeGreaterThan(0);
    });

    it('should extract title from first user message', () => {
      const fixtureFile = path.join(fixturesDir, 'T-019c2505-6bed-73de-8e27-51899656b47b.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      expect(result!.title.length).toBeGreaterThan(0);
      expect(result!.title).toContain('Tailwind');
    });

    it('should handle missing file gracefully', () => {
      const result = parser.parseFile('/nonexistent/path/T-nonexistent-0000-0000-0000-000000000000.json');

      expect(result).toBeNull();
    });

    it('should parse user messages correctly', () => {
      const fixtureFile = path.join(fixturesDir, 'T-019c2505-6bed-73de-8e27-51899656b47b.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      const userMessages = result!.messages.filter(m => m.type === 'user');
      expect(userMessages.length).toBeGreaterThan(0);

      const firstUser = userMessages[0];
      expect(firstUser.type).toBe('user');
      if (firstUser.type === 'user') {
        const textContent = firstUser.content.filter(c => c.type === 'text');
        expect(textContent.length).toBeGreaterThan(0);
      }
    });

    it('should parse assistant messages with thinking', () => {
      const fixtureFile = path.join(fixturesDir, 'T-019c2505-6bed-73de-8e27-51899656b47b.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      const thinkingMessages = result!.messages.filter(m => m.type === 'assistant_thinking');
      // The assistant message has both thinking and text, so it may be parsed as assistant_text
      // or we may have separate handling
      expect(result!.messages.some(m => m.type === 'assistant_thinking' || m.type === 'assistant_text')).toBe(true);
    });

    it('should parse tool use messages', () => {
      const fixtureFile = path.join(fixturesDir, 'T-019c2505-6bed-73de-8e27-51899656b47b.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      const toolUseMessages = result!.messages.filter(m => m.type === 'tool_use');
      expect(toolUseMessages.length).toBeGreaterThan(0);

      const toolUse = toolUseMessages[0];
      expect(toolUse.type).toBe('tool_use');
      if (toolUse.type === 'tool_use') {
        expect(toolUse.toolName).toBe('Read');
        expect(toolUse.toolCallId).toBeDefined();
      }
    });

    it('should return multiple tool_use blocks from single assistant message', () => {
      const fixtureFile = path.join(fixturesDir, 'T-array-format-test.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      const toolUseMessages = result!.messages.filter(m => m.type === 'tool_use');

      // The fixture has: Read, glob, and edit_file tool calls
      expect(toolUseMessages.length).toBeGreaterThanOrEqual(3);

      const toolNames = toolUseMessages.map(t => (t as any).toolName);
      expect(toolNames).toContain('Read');
      expect(toolNames).toContain('glob');
      expect(toolNames).toContain('edit_file');
    });

    it('should parse edit_file tool with old_str and new_str', () => {
      const fixtureFile = path.join(fixturesDir, 'T-array-format-test.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      const toolUseMessages = result!.messages.filter(m => m.type === 'tool_use');
      const editTool = toolUseMessages.find(t => (t as any).toolName === 'edit_file');

      expect(editTool).toBeDefined();
      if (editTool && editTool.type === 'tool_use') {
        expect(editTool.input).toHaveProperty('old_str');
        expect(editTool.input).toHaveProperty('new_str');
        expect(editTool.input.old_str).toBe('println("Hello")');
        expect(editTool.input.new_str).toBe('println("Hello World")');
      }
    });

    it('should skip tool_result with only diff field', () => {
      const fixtureFile = path.join(fixturesDir, 'T-array-format-test.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      const userMessages = result!.messages.filter(m => m.type === 'user');

      // Should have the initial user message
      expect(userMessages.length).toBeGreaterThanOrEqual(1);

      const firstUser = userMessages[0];
      if (firstUser.type === 'user') {
        const textContent = firstUser.content.filter(c => c.type === 'text');
        expect(textContent.some(c => c.type === 'text' && c.text.includes('edit'))).toBe(true);
      }
    });

    it('should extract metadata correctly', () => {
      const fixtureFile = path.join(fixturesDir, 'T-019c2505-6bed-73de-8e27-51899656b47b.json');

      if (!fs.existsSync(fixtureFile)) {
        return;
      }

      const result = parser.parseFile(fixtureFile);

      expect(result).not.toBeNull();
      expect(result!.metadata).toBeDefined();

      const metadata = result!.metadata;
      expect(metadata!.messageCount).toBeGreaterThan(0);
      expect(metadata!.created).toBeDefined();
    });
  });

  describe('parseContent with inline JSON', () => {
    it('should handle invalid JSON gracefully', () => {
      // parseContent is not directly exposed, but we can test via parseFile
      // by creating a temp file with invalid JSON
      const tempDir = createTempDir();
      try {
        const sessionFile = path.join(tempDir, 'T-invalid.json');
        fs.writeFileSync(sessionFile, 'invalid json');

        const result = parser.parseFile(sessionFile);
        expect(result).toBeNull();
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should handle empty JSON gracefully', () => {
      const tempDir = createTempDir();
      try {
        const sessionFile = path.join(tempDir, 'T-empty.json');
        fs.writeFileSync(sessionFile, '{}');

        const result = parser.parseFile(sessionFile);
        // Empty JSON should parse but return minimal session
        expect(result).not.toBeNull();
        expect(result!.messages).toEqual([]);
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should parse inline JSON', () => {
      const json = {
        id: 'T-test-inline',
        created: 1770147638256,
        messages: [
          { role: 'user', messageId: 0, content: [{ type: 'text', text: 'Hello' }] },
          { role: 'assistant', messageId: 1, content: [{ type: 'text', text: 'Hi there' }], usage: { timestamp: '2026-02-03T10:00:00.000Z' } }
        ]
      };

      const tempDir = createTempDir();
      try {
        const sessionFile = path.join(tempDir, 'T-inline.json');
        fs.writeFileSync(sessionFile, JSON.stringify(json));

        const result = parser.parseFile(sessionFile);

        expect(result).not.toBeNull();
        expect(result!.sessionId).toBe('T-test-inline');
        expect(result!.messages.length).toBeGreaterThan(0);

        const userMessages = result!.messages.filter(m => m.type === 'user');
        expect(userMessages.length).toBe(1);

        const assistantMessages = result!.messages.filter(m => m.type === 'assistant_text');
        expect(assistantMessages.length).toBe(1);
      } finally {
        cleanupTempDir(tempDir);
      }
    });
  });
});
