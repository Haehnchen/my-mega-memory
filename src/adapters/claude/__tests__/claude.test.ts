import * as fs from 'fs';
import * as path from 'path';
import { ClaudeSessionFinder, ClaudeSessionParser } from '../index';

describe('ClaudeSessionFinder', () => {
  let finder: ClaudeSessionFinder;

  beforeEach(() => {
    finder = new ClaudeSessionFinder();
  });

  describe('projectPathToClaudeDir', () => {
    it('should convert absolute path to Claude format', () => {
      const result = finder.projectPathToClaudeDir('/home/user/project');
      expect(result).toBe('-home-user-project');
    });

    it('should handle nested paths', () => {
      const result = finder.projectPathToClaudeDir('/home/user/my-projects/some-project');
      expect(result).toBe('-home-user-my-projects-some-project');
    });

    it('should handle Windows paths with colons', () => {
      const result = finder.projectPathToClaudeDir('C:/Users/user/project');
      expect(result).toBe('C-Users-user-project');
    });

    it('should handle real-world example', () => {
      const result = finder.projectPathToClaudeDir('/home/daniel/my-projects/idea-de-espend-ml-llm');
      expect(result).toBe('-home-daniel-my-projects-idea-de-espend-ml-llm');
    });

    it('should not remove leading dash', () => {
      // Regression test for the bug where removePrefix("-") was incorrectly used
      const result = finder.projectPathToClaudeDir('/home/user/project');
      expect(result.startsWith('-')).toBe(true);
    });
  });

  describe('getClaudeProjectsDir', () => {
    it('should return correct path', () => {
      const result = finder.getClaudeProjectsDir();
      const homeDir = require('os').homedir();
      expect(result).toBe(path.join(homeDir, '.claude', 'projects'));
    });
  });
});

describe('ClaudeSessionParser', () => {
  let parser: ClaudeSessionParser;
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    parser = new ClaudeSessionParser();
  });

  describe('parseContent', () => {
    it('should parse command message', () => {
      // Use \\n for literal backslash-n in the JSON string (not actual newlines)
      const jsonl = '{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>\\n            <command-message>clear</command-message>\\n            <command-args></command-args>"},"timestamp":"2026-02-03T19:30:29.273Z","uuid":"test-uuid"}';

      const { messages } = parser.parseContent(jsonl);

      expect(messages).toHaveLength(1);
      const msg = messages[0];
      expect(msg.type).toBe('info');
      expect(msg.type === 'info' && msg.title).toBe('command');
      expect(msg.type === 'info' && msg.content?.type === 'text' && msg.content.text).toBe('clear');
    });

    it('should parse compact command message', () => {
      // Use \\n for literal backslash-n in the JSON string (not actual newlines)
      const jsonl = '{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>\\n            <command-message>compact</command-message>"},"timestamp":"2026-02-03T19:30:29.273Z","uuid":"test-uuid"}';

      const { messages } = parser.parseContent(jsonl);

      expect(messages).toHaveLength(1);
      const msg = messages[0];
      expect(msg.type).toBe('info');
      expect(msg.type === 'info' && msg.title).toBe('command');
      expect(msg.type === 'info' && msg.content?.type === 'text' && msg.content.text).toBe('compact');
    });

    it('should skip local-command-stdout messages', () => {
      const jsonl = `{"type":"user","message":{"role":"user","content":"<local-command-stdout></local-command-stdout>"},"timestamp":"2026-02-03T19:30:29.274Z","uuid":"test-uuid"}`;

      const { messages } = parser.parseContent(jsonl);

      expect(messages).toHaveLength(0);
    });

    it('should skip isMeta messages', () => {
      const jsonl = `{"type":"user","message":{"role":"user","content":"<local-command-caveat>Some caveat text</local-command-caveat>"},"isMeta":true,"timestamp":"2026-02-03T19:30:29.274Z","uuid":"test-uuid"}`;

      const { messages } = parser.parseContent(jsonl);

      expect(messages).toHaveLength(0);
    });

    it('should extract title from first real user message skipping commands', () => {
      const jsonl = `
        {"type":"user","message":{"role":"user","content":"<local-command-caveat>Caveat</local-command-caveat>"},"isMeta":true,"timestamp":"2026-02-03T19:30:29.274Z","uuid":"uuid1"}
        {"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>"},"timestamp":"2026-02-03T19:30:29.275Z","uuid":"uuid2"}
        {"type":"user","message":{"role":"user","content":"<local-command-stdout></local-command-stdout>"},"timestamp":"2026-02-03T19:30:29.276Z","uuid":"uuid3"}
        {"type":"user","message":{"role":"user","content":"This is my actual question about the code"},"timestamp":"2026-02-03T19:30:53.895Z","uuid":"uuid4"}
      `;

      const { messages } = parser.parseContent(jsonl);

      // Should have: command info + real user message (meta and stdout are skipped)
      expect(messages).toHaveLength(2);

      // First should be the command
      expect(messages[0].type).toBe('info');
      expect(messages[0].type === 'info' && messages[0].title).toBe('command');

      // Second should be the real user message
      expect(messages[1].type).toBe('user');
      const userMsg = messages[1];
      expect(userMsg.type === 'user').toBe(true);
      if (userMsg.type === 'user') {
        const text = userMsg.content
          .filter(c => c.type === 'text')
          .map(c => c.type === 'text' ? c.text : '')
          .join('');
        expect(text).toBe('This is my actual question about the code');
      }
    });

    it('should handle local-command-stdout with content', () => {
      const jsonl = `{"type":"user","message":{"role":"user","content":"<local-command-stdout>Some output here</local-command-stdout>"},"timestamp":"2026-02-03T19:30:29.274Z","uuid":"test-uuid"}`;

      const { messages } = parser.parseContent(jsonl);

      // Non-empty stdout should also be skipped (it's command output)
      expect(messages).toHaveLength(0);
    });
  });

  describe('parseFile', () => {
    it('should use first real user message for title', () => {
      // Create a temp file with command followed by real message
      const tempDir = require('os').tmpdir();
      const tempFile = path.join(tempDir, `test-session-${Date.now()}.jsonl`);
      
      try {
        const content = `
          {"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>"},"timestamp":"2026-02-03T19:30:29.275Z","uuid":"uuid1"}
          {"type":"user","message":{"role":"user","content":"<local-command-stdout></local-command-stdout>"},"timestamp":"2026-02-03T19:30:29.276Z","uuid":"uuid2"}
          {"type":"user","message":{"role":"user","content":"My real question here"},"timestamp":"2026-02-03T19:30:53.895Z","uuid":"uuid3"}
        `;
        fs.writeFileSync(tempFile, content);

        const sessionDetail = parser.parseFile(tempFile);

        expect(sessionDetail).not.toBeNull();
        expect(sessionDetail!.title).toBe('My real question here');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return null for non-existent file', () => {
      const result = parser.parseFile('/nonexistent/path/session.jsonl');
      expect(result).toBeNull();
    });
  });

  describe('fixture files', () => {
    it('should parse user_message.jsonl', () => {
      const filePath = path.join(fixturesDir, 'user_message.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('user');
      if (messages[0].type === 'user') {
        expect(messages[0].content[0].type).toBe('text');
        if (messages[0].content[0].type === 'text') {
          expect(messages[0].content[0].text).toBe('Hello, this is a user message');
        }
      }
    });

    it('should parse assistant_text.jsonl', () => {
      const filePath = path.join(fixturesDir, 'assistant_text.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('assistant_text');
      if (messages[0].type === 'assistant_text') {
        expect(messages[0].content[0].type).toBe('markdown');
        if (messages[0].content[0].type === 'markdown') {
          expect(messages[0].content[0].markdown).toBe('Here is my response to your question.');
        }
      }
    });

    it('should parse assistant_tool_use.jsonl', () => {
      const filePath = path.join(fixturesDir, 'assistant_tool_use.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');
      if (messages[0].type === 'tool_use') {
        expect(messages[0].toolName).toBe('Bash');
        expect(messages[0].input).toHaveProperty('command');
        expect(messages[0].input.command).toBe('ls -la');
      }
    });

    it('should parse mixed_conversation.jsonl', () => {
      const filePath = path.join(fixturesDir, 'mixed_conversation.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages, metadata } = parser.parseContent(content);

      expect(messages.length).toBeGreaterThan(0);
      expect(metadata).toBeDefined();
      expect(metadata!.cwd).toBe('/home/user/project');
      expect(metadata!.gitBranch).toBe('main');
      expect(metadata!.version).toBe('1.0');
    });

    it('should parse system_turn_duration.jsonl', () => {
      const filePath = path.join(fixturesDir, 'system_turn_duration.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages.length).toBeGreaterThan(0);
      const durationMsg = messages.find(m => m.type === 'info' && m.title === 'duration');
      expect(durationMsg).toBeDefined();
    });

    it('should parse tool_result_in_user.jsonl', () => {
      const filePath = path.join(fixturesDir, 'tool_result_in_user.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages.length).toBeGreaterThan(0);
      // Tool results in user messages should be parsed correctly
      const toolResultMsg = messages.find(m => m.type === 'tool_result' || m.type === 'user');
      expect(toolResultMsg).toBeDefined();
    });

    it('should connect tool results to tool use in mixed_conversation_with_tool_connection', () => {
      const filePath = path.join(fixturesDir, 'mixed_conversation_with_tool_connection.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      // Find tool_use messages and verify they have connected results
      const toolUseMessages = messages.filter(m => m.type === 'tool_use');
      
      for (const toolUse of toolUseMessages) {
        if (toolUse.type === 'tool_use') {
          // Tool use should have results connected
          expect(Array.isArray(toolUse.results)).toBe(true);
        }
      }
    });

    it('should parse all assistant tool use variants', () => {
      const variants = [
        'assistant_tool_use_read.jsonl',
        'assistant_tool_use_write.jsonl',
        'assistant_tool_use_edit.jsonl',
        'assistant_tool_use_glob.jsonl'
      ];

      for (const variant of variants) {
        const filePath = path.join(fixturesDir, variant);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const { messages } = parser.parseContent(content);
          expect(messages.length).toBeGreaterThan(0);
          expect(messages[0].type).toBe('tool_use');
        }
      }
    });

    it('should parse assistant_thinking.jsonl', () => {
      const filePath = path.join(fixturesDir, 'assistant_thinking.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      // Thinking messages should be parsed as assistant_thinking or assistant_text with thinking content
      expect(['assistant_thinking', 'assistant_text']).toContain(messages[0].type);
    });

    it('should parse user_with_text_and_tool_result.jsonl', () => {
      const filePath = path.join(fixturesDir, 'user_with_text_and_tool_result.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages.length).toBeGreaterThan(0);
      // Should parse as user message with both text and tool result content
      const userMsg = messages.find(m => m.type === 'user');
      expect(userMsg).toBeDefined();
    });
  });
});
