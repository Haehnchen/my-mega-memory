import { ContentCleaner } from '../contentCleaner';
import { MessageContent } from '../../types';

describe('ContentCleaner', () => {
  describe('extractText', () => {
    it('extracts text from text blocks', () => {
      const content: MessageContent[] = [
        { type: 'text', text: 'Hello world' },
      ];
      expect(ContentCleaner.extractText(content)).toBe('Hello world');
    });

    it('extracts text from code blocks', () => {
      const content: MessageContent[] = [
        { type: 'code', code: 'const x = 1;', language: 'typescript' },
      ];
      expect(ContentCleaner.extractText(content)).toBe('const x = 1;');
    });

    it('extracts text from markdown blocks', () => {
      const content: MessageContent[] = [
        { type: 'markdown', markdown: '# Title\nSome text' },
      ];
      expect(ContentCleaner.extractText(content)).toBe('# Title Some text');
    });

    it('strips structural chars from json blocks', () => {
      const content: MessageContent[] = [
        { type: 'json', json: '{"key": "value", "num": 42}' },
      ];
      const result = ContentCleaner.extractText(content);
      expect(result).not.toContain('{');
      expect(result).not.toContain('}');
      expect(result).not.toContain('"');
      expect(result).toContain('key');
      expect(result).toContain('value');
    });

    it('combines oldText and newText from diff blocks', () => {
      const content: MessageContent[] = [
        { type: 'diff', oldText: 'old content', newText: 'new content' },
      ];
      const result = ContentCleaner.extractText(content);
      expect(result).toContain('old content');
      expect(result).toContain('new content');
    });

    it('strips HTML tags from html blocks', () => {
      const content: MessageContent[] = [
        { type: 'html', html: '<p>Hello <b>world</b></p>' },
      ];
      expect(ContentCleaner.extractText(content)).toBe('Hello world');
    });

    it('combines multiple blocks', () => {
      const content: MessageContent[] = [
        { type: 'text', text: 'Hello' },
        { type: 'code', code: 'world' },
      ];
      expect(ContentCleaner.extractText(content)).toBe('Hello world');
    });

    it('returns empty string for empty content', () => {
      expect(ContentCleaner.extractText([])).toBe('');
    });
  });

  describe('normalizeWhitespace', () => {
    it('collapses multiple spaces', () => {
      expect(ContentCleaner.normalizeWhitespace('hello   world')).toBe('hello world');
    });

    it('collapses newlines and tabs', () => {
      expect(ContentCleaner.normalizeWhitespace('hello\n\n\tworld')).toBe('hello world');
    });

    it('trims leading and trailing whitespace', () => {
      expect(ContentCleaner.normalizeWhitespace('  hello  ')).toBe('hello');
    });
  });
});
