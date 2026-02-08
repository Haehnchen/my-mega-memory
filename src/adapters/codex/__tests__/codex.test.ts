import * as fs from 'fs';
import * as path from 'path';
import { CodexSessionFinder, CodexSessionParser } from '../index';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('CodexSessionFinder', () => {
  let finder: CodexSessionFinder;

  beforeEach(() => {
    finder = new CodexSessionFinder();
  });

  describe('extractSessionId', () => {
    it('should extract UUID from filename', () => {
      const testFile = '/tmp/rollout-2026-01-26T12-27-20-019bfa0e-ec98-70e0-8575-5132b767abff.jsonl';
      const sessionId = finder.extractSessionId(testFile);
      expect(sessionId).toBe('019bfa0e-ec98-70e0-8575-5132b767abff');
    });

    it('should return null for invalid filename', () => {
      const testFile = '/tmp/invalid-file.jsonl';
      const sessionId = finder.extractSessionId(testFile);
      expect(sessionId).toBeNull();
    });

    it('should return null for filename without rollout prefix', () => {
      const testFile = '/tmp/some-uuid-123.jsonl';
      const sessionId = finder.extractSessionId(testFile);
      expect(sessionId).toBeNull();
    });
  });

  describe('getCodexSessionsDirs', () => {
    it('should return an array', () => {
      const dirs = finder.getCodexSessionsDirs();
      expect(Array.isArray(dirs)).toBe(true);
    });
  });
});

describe('CodexSessionParser', () => {
  let parser: CodexSessionParser;

  beforeEach(() => {
    parser = new CodexSessionParser();
  });

  describe('parseContent', () => {
    // ============ Session Meta Tests ============

    it('should extract session metadata', () => {
      const content = loadFixture('session_meta');
      const { messages, metadata } = parser.parseContent(content);

      expect(metadata).toBeDefined();
      expect(metadata.cwd).toBe('/home/user/project');
      expect(metadata.gitBranch).toBe('main');
      expect(metadata.version).toBe('1.0.0');
    });

    // ============ Event Message Tests ============

    it('should skip user_message event (duplicate of response_item)', () => {
      const content = loadFixture('user_message');
      const { messages } = parser.parseContent(content);

      // user_message from event_msg is skipped because response_item/message contains the same data
      expect(messages).toHaveLength(0);
    });

    it('should skip agent_message event (duplicate of response_item)', () => {
      const content = loadFixture('agent_message');
      const { messages } = parser.parseContent(content);

      // agent_message from event_msg is skipped because response_item/message contains the same data
      expect(messages).toHaveLength(0);
    });

    it('should skip agent_reasoning event (duplicate of response_item)', () => {
      const content = loadFixture('agent_reasoning');
      const { messages } = parser.parseContent(content);

      // agent_reasoning from event_msg is skipped because response_item/reasoning contains the same data
      expect(messages).toHaveLength(0);
    });

    // ============ Response Item Tests ============

    it('should parse function_call response', () => {
      const content = loadFixture('function_call');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');

      const msg = messages[0] as { type: 'tool_use'; toolName: string; toolCallId: string; input: Record<string, string> };
      expect(msg.toolName).toBe('shell');
      expect(msg.toolCallId).toBe('call_ABC123');
      expect(msg.input).toHaveProperty('command');
      expect(msg.input['command']).toBe('ls -la');
    });

    it('should parse function_call_output response', () => {
      const content = loadFixture('function_call_output');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_result');

      const msg = messages[0] as { type: 'tool_result'; toolCallId: string; output: Array<{ type: string; code: string }> };
      expect(msg.toolCallId).toBe('call_ABC123');
      const outputContent = msg.output[0]?.code || '';
      expect(outputContent).toContain('file1.txt');
    });

    it('should parse custom_tool_call response', () => {
      const content = loadFixture('custom_tool_call');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');

      const msg = messages[0] as { type: 'tool_use'; toolName: string; toolCallId: string };
      expect(msg.toolName).toBe('create_file');
      expect(msg.toolCallId).toBe('call_XYZ789');
    });

    it('should parse custom_tool_call_output response', () => {
      const content = loadFixture('custom_tool_call_output');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_result');

      const msg = messages[0] as { type: 'tool_result'; toolCallId: string; output: Array<{ type: string; code: string }> };
      expect(msg.toolCallId).toBe('call_XYZ789');
      const outputContent = msg.output[0]?.code || '';
      expect(outputContent).toContain('Success');
    });

    it('should parse reasoning response', () => {
      const content = loadFixture('reasoning');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('assistant_thinking');

      const msg = messages[0] as { type: 'assistant_thinking'; thinking: string };
      expect(msg.thinking).toContain('Analyzing the code structure');
      expect(msg.thinking).toContain('Identifying potential issues');
    });

    // ============ Tool Connection Tests ============

    it('should connect function_call with function_call_output', () => {
      const content = `
        {"timestamp":"2024-01-15T10:00:00.000Z","type":"response_item","payload":{"type":"function_call","name":"shell","call_id":"call_CONNECT","arguments":"{\\"command\\":\\"echo hello\\"}"}}
        {"timestamp":"2024-01-15T10:01:00.000Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_CONNECT","output":"hello"}}
      `;

      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');

      const toolUse = messages[0] as { type: 'tool_use'; results: Array<{ output: string }> };
      expect(toolUse.results).toBeDefined();
      expect(toolUse.results.length).toBe(1);
      expect(toolUse.results[0].output).toContain('hello');
    });

    // ============ Mixed Conversation Tests ============

    it('should parse mixed conversation', () => {
      const content = loadFixture('mixed_conversation');
      const { messages, metadata } = parser.parseContent(content);

      // Should have: function_call (connected with output)
      // Note: user_message, agent_message, and agent_reasoning from event_msg are skipped
      expect(messages.length).toBeGreaterThanOrEqual(1);

      // Check metadata
      expect(metadata).toBeDefined();
      expect(metadata.cwd).toBe('/home/user/project');
      expect(metadata.gitBranch).toBe('main');

      // Check model tracking
      expect(metadata.models).toBeDefined();
      expect(metadata.models!.length).toBeGreaterThan(0);
      expect(metadata.models![0][0]).toBe('gpt-4o');

      // Check tool use
      const toolUse = messages.find(m => m.type === 'tool_use');
      expect(toolUse).toBeDefined();
      if (toolUse && toolUse.type === 'tool_use') {
        expect(toolUse.toolName).toBe('shell');
        expect(toolUse.results).toBeDefined();
        expect(toolUse.results.length).toBeGreaterThan(0);
      }
    });
  });

  describe('parseFile', () => {
    it('should parse fixture file and return session detail', () => {
      const filePath = path.join(fixturesDir, 'mixed_conversation.jsonl');
      const sessionDetail = parser.parseFile(filePath);

      expect(sessionDetail).not.toBeNull();
      expect(sessionDetail!.sessionId).toBeDefined();
      expect(sessionDetail!.messages.length).toBeGreaterThan(0);
      expect(sessionDetail!.metadata).toBeDefined();
    });

    it('should return null for non-existent file', () => {
      const result = parser.parseFile('/nonexistent/path/session.jsonl');
      expect(result).toBeNull();
    });

    it('should extract title from first user message', () => {
      // Create a temp file with a user message
      const tempDir = require('os').tmpdir();
      const tempFile = path.join(tempDir, `test-codex-session-${Date.now()}.jsonl`);
      
      try {
        const content = `
          {"timestamp":"2024-01-15T10:00:00.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Help me with my code"}]}}
        `;
        fs.writeFileSync(tempFile, content);

        const sessionDetail = parser.parseFile(tempFile);

        expect(sessionDetail).not.toBeNull();
        expect(sessionDetail!.title).toBe('Help me with my code');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });

  describe('parseSession', () => {
    it('should return null for non-existent session', () => {
      const result = parser.parseSession('non-existent-session-id-12345');
      expect(result).toBeNull();
    });
  });

  describe('fixture files', () => {
    it('should parse session_meta.jsonl', () => {
      const filePath = path.join(fixturesDir, 'session_meta.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages, metadata } = parser.parseContent(content);

      expect(metadata).toBeDefined();
      expect(metadata.cwd).toBe('/home/user/project');
      expect(metadata.gitBranch).toBe('main');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should parse user_message.jsonl', () => {
      const filePath = path.join(fixturesDir, 'user_message.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      // user_message from event_msg is skipped
      expect(messages).toHaveLength(0);
    });

    it('should parse agent_message.jsonl', () => {
      const filePath = path.join(fixturesDir, 'agent_message.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      // agent_message from event_msg is skipped
      expect(messages).toHaveLength(0);
    });

    it('should parse agent_reasoning.jsonl', () => {
      const filePath = path.join(fixturesDir, 'agent_reasoning.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      // agent_reasoning from event_msg is skipped
      expect(messages).toHaveLength(0);
    });

    it('should parse function_call.jsonl', () => {
      const filePath = path.join(fixturesDir, 'function_call.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');
    });

    it('should parse function_call_output.jsonl', () => {
      const filePath = path.join(fixturesDir, 'function_call_output.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_result');
    });

    it('should parse custom_tool_call.jsonl', () => {
      const filePath = path.join(fixturesDir, 'custom_tool_call.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_use');
    });

    it('should parse custom_tool_call_output.jsonl', () => {
      const filePath = path.join(fixturesDir, 'custom_tool_call_output.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_result');
    });

    it('should parse reasoning.jsonl', () => {
      const filePath = path.join(fixturesDir, 'reasoning.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('assistant_thinking');
    });

    it('should parse mixed_conversation.jsonl', () => {
      const filePath = path.join(fixturesDir, 'mixed_conversation.jsonl');
      const content = fs.readFileSync(filePath, 'utf-8');
      const { messages, metadata } = parser.parseContent(content);

      expect(messages.length).toBeGreaterThan(0);
      expect(metadata).toBeDefined();
      expect(metadata.cwd).toBe('/home/user/project');
      expect(metadata.gitBranch).toBe('main');
    });
  });

  // ============ Edge Cases ============

  describe('edge cases', () => {
    it('should handle invalid JSON gracefully', () => {
      const content = `
        not valid json
        {"timestamp":"2024-01-15T10:00:00.000Z","type":"response_item","payload":{"type":"reasoning","summary":[{"text":"Let me think about this step by step"}]}}
      `;

      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('assistant_thinking');
    });

    it('should skip token_count events', () => {
      const content = `
        {"timestamp":"2024-01-15T10:00:00.000Z","type":"event_msg","payload":{"type":"token_count","input_tokens":100,"output_tokens":200}}
      `;

      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(0);
    });

    it('should handle empty content', () => {
      const { messages, metadata } = parser.parseContent('');

      expect(messages).toHaveLength(0);
      expect(metadata.messageCount).toBe(0);
    });

    it('should handle content with only whitespace', () => {
      const { messages } = parser.parseContent('   \n\n   ');

      expect(messages).toHaveLength(0);
    });

    it('should parse message with multiple content blocks', () => {
      const content = `
        {"timestamp":"2024-01-15T10:00:00.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Hello"},{"type":"input_text","text":"World"}]}}
      `;

      const { messages } = parser.parseContent(content);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('user');
    });
  });
});

// Helper function to load fixture files
function loadFixture(name: string): string {
  const filePath = path.join(fixturesDir, `${name}.jsonl`);
  return fs.readFileSync(filePath, 'utf-8');
}
