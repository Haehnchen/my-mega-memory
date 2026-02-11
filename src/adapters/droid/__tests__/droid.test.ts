import { DroidSessionFinder, DroidSessionParser } from '../index';

describe('DroidSessionParser', () => {
  const parser = new DroidSessionParser();

  describe('parseContent', () => {
    it('should parse session_start line', () => {
      const content = JSON.stringify({
        type: 'session_start',
        id: '1535cefc-1c55-4956-a51b-abadba8e0e92',
        title: 'test session',
        sessionTitle: 'New Session',
        owner: 'daniel',
        version: 2,
        cwd: '/home/daniel/plugins'
      });

      const result = parser.parseContent(content);

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('1535cefc-1c55-4956-a51b-abadba8e0e92');
      expect(result?.title).toBe('test session');
    });

    it('should parse user message', () => {
      const content = [
        JSON.stringify({
          type: 'session_start',
          id: 'test-id',
          title: 'test',
          sessionTitle: 'New Session',
          owner: 'daniel',
          version: 2,
          cwd: '/home/daniel/test'
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          timestamp: '2026-01-24T16:49:08.867Z',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello, world!' }
            ]
          }
        })
      ].join('\n');

      const result = parser.parseContent(content);

      expect(result?.messages).toHaveLength(1);
      const msg = result?.messages[0];
      expect(msg?.type).toBe('user');
      if (msg?.type === 'user') {
        expect(msg.content).toEqual([{ type: 'text', text: 'Hello, world!' }]);
      }
    });

    it('should parse assistant text message', () => {
      const content = [
        JSON.stringify({
          type: 'session_start',
          id: 'test-id',
          title: 'test',
          sessionTitle: 'New Session',
          owner: 'daniel',
          version: 2,
          cwd: '/home/daniel/test'
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          timestamp: '2026-01-24T16:49:10.867Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Hi! How can I help you?' }
            ]
          }
        })
      ].join('\n');

      const result = parser.parseContent(content);

      expect(result?.messages).toHaveLength(1);
      const msg = result?.messages[0];
      expect(msg?.type).toBe('assistant_text');
      if (msg?.type === 'assistant_text') {
        expect(msg.content).toEqual([{ type: 'markdown', markdown: 'Hi! How can I help you?' }]);
      }
    });

    it('should parse tool_use message', () => {
      const content = [
        JSON.stringify({
          type: 'session_start',
          id: 'test-id',
          title: 'test',
          sessionTitle: 'New Session',
          owner: 'daniel',
          version: 2,
          cwd: '/home/daniel/test'
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          timestamp: '2026-01-24T16:49:10.867Z',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_123abc',
                name: 'Read',
                input: { file_path: '/path/to/file.txt' }
              }
            ]
          }
        })
      ].join('\n');

      const result = parser.parseContent(content);

      expect(result?.messages).toHaveLength(1);
      const msg = result?.messages[0];
      expect(msg?.type).toBe('tool_use');
      if (msg?.type === 'tool_use') {
        expect(msg.toolName).toBe('Read');
        expect(msg.toolCallId).toBe('toolu_123abc');
        expect(msg.input).toEqual({ file_path: '/path/to/file.txt' });
      }
    });

    it('should parse tool_result message', () => {
      const content = [
        JSON.stringify({
          type: 'session_start',
          id: 'test-id',
          title: 'test',
          sessionTitle: 'New Session',
          owner: 'daniel',
          version: 2,
          cwd: '/home/daniel/test'
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          timestamp: '2026-01-24T16:49:10.867Z',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_123abc',
                name: 'Read',
                input: { file_path: '/path/to/file.txt' }
              }
            ]
          }
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-2',
          timestamp: '2026-01-24T16:49:11.867Z',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_123abc',
                content: 'File content here'
              }
            ]
          }
        })
      ].join('\n');

      const result = parser.parseContent(content);

      expect(result?.messages).toHaveLength(2); // tool_use, tool_result
      const toolResult = result?.messages.find(m => m.type === 'tool_result');
      expect(toolResult?.type).toBe('tool_result');
      if (toolResult?.type === 'tool_result') {
        expect(toolResult.toolName).toBe('Read');
        expect(toolResult.toolCallId).toBe('toolu_123abc');
      }
    });

    it('should extract title from first user message when session_start title is generic', () => {
      const content = [
        JSON.stringify({
          type: 'session_start',
          id: 'test-id',
          title: 'New Session',
          sessionTitle: 'New Session',
          owner: 'daniel',
          version: 2,
          cwd: '/home/daniel/test'
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          timestamp: '2026-01-24T16:49:08.867Z',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Implement feature X' }
            ]
          }
        })
      ].join('\n');

      const result = parser.parseContent(content);

      expect(result?.title).toBe('Implement feature X');
    });

    it('should handle empty content gracefully', () => {
      const result = parser.parseContent('');
      expect(result).toBeNull();
    });

    it('should handle non-session_start first line', () => {
      const content = JSON.stringify({
        type: 'message',
        id: 'msg-1'
      });

      const result = parser.parseContent(content);
      expect(result).toBeNull();
    });

    it('should skip invalid message lines', () => {
      const content = [
        JSON.stringify({
          type: 'session_start',
          id: 'test-id',
          title: 'test',
          sessionTitle: 'New Session',
          owner: 'daniel',
          version: 2,
          cwd: '/home/daniel/test'
        }),
        'invalid json line',
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          timestamp: '2026-01-24T16:49:08.867Z',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' }
            ]
          }
        })
      ].join('\n');

      const result = parser.parseContent(content);

      // Should parse valid message and skip invalid line
      expect(result?.messages).toHaveLength(1);
    });
  });

  describe('parseFile', () => {
    it('should return null for non-existent file', () => {
      const result = parser.parseFile('/non/existent/path/file.jsonl');
      expect(result).toBeNull();
    });
  });
});
