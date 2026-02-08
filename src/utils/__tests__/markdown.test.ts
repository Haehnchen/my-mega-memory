import { MarkdownConverter, HtmlBuilder } from '../markdown';

describe('MarkdownConverter', () => {
  describe('isMarkdown', () => {
    it('should detect bold text with **', () => {
      expect(MarkdownConverter.isMarkdown('This is **bold** text')).toBe(true);
    });

    it('should detect bold text with __', () => {
      expect(MarkdownConverter.isMarkdown('This is __bold__ text')).toBe(true);
    });

    it('should detect italic text with *', () => {
      expect(MarkdownConverter.isMarkdown('This is *italic* text')).toBe(true);
    });

    it('should detect italic text with _', () => {
      expect(MarkdownConverter.isMarkdown('This is _italic_ text')).toBe(true);
    });

    it('should detect inline code', () => {
      expect(MarkdownConverter.isMarkdown('Use `console.log()` for debugging')).toBe(true);
    });

    it('should detect links', () => {
      expect(MarkdownConverter.isMarkdown('Check out [this link](https://example.com)')).toBe(true);
    });

    it('should detect headers', () => {
      expect(MarkdownConverter.isMarkdown('# Header 1')).toBe(true);
      expect(MarkdownConverter.isMarkdown('## Header 2')).toBe(true);
      expect(MarkdownConverter.isMarkdown('###### Header 6')).toBe(true);
    });

    it('should detect unordered lists', () => {
      expect(MarkdownConverter.isMarkdown('- Item 1')).toBe(true);
      expect(MarkdownConverter.isMarkdown('* Item 1')).toBe(true);
      expect(MarkdownConverter.isMarkdown('+ Item 1')).toBe(true);
    });

    it('should detect ordered lists', () => {
      expect(MarkdownConverter.isMarkdown('1. First item')).toBe(true);
      expect(MarkdownConverter.isMarkdown('42. Item 42')).toBe(true);
    });

    it('should detect code blocks', () => {
      expect(MarkdownConverter.isMarkdown('```javascript\nconst x = 1;\n```')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(MarkdownConverter.isMarkdown('This is just plain text')).toBe(false);
      expect(MarkdownConverter.isMarkdown('No markdown here 123')).toBe(false);
    });

    it('should return false for empty or blank content', () => {
      expect(MarkdownConverter.isMarkdown('')).toBe(false);
      expect(MarkdownConverter.isMarkdown('   ')).toBe(false);
    });
  });

  describe('toHtml', () => {
    it('should convert markdown to HTML', () => {
      const markdown = '**Bold** and *italic*';
      const html = MarkdownConverter.toHtml(markdown);
      expect(html).toContain('<strong>Bold</strong>');
      expect(html).toContain('<em>italic</em>');
    });

    it('should convert headers', () => {
      const html = MarkdownConverter.toHtml('# Header 1');
      expect(html).toContain('<h1>Header 1</h1>');
    });

    it('should convert code blocks with language', () => {
      const markdown = '```javascript\nconst x = 1;\n```';
      const html = MarkdownConverter.toHtml(markdown);
      expect(html).toContain('<pre>');
      expect(html).toContain('<code');
      expect(html).toContain('const x = 1;');
    });

    it('should convert inline code', () => {
      const markdown = 'Use `console.log()` for debugging';
      const html = MarkdownConverter.toHtml(markdown);
      expect(html).toContain('<code>console.log()</code>');
    });

    it('should convert links', () => {
      const markdown = '[Example](https://example.com)';
      const html = MarkdownConverter.toHtml(markdown);
      expect(html).toContain('<a href="https://example.com">Example</a>');
    });

    it('should convert lists', () => {
      const markdown = '- Item 1\n- Item 2';
      const html = MarkdownConverter.toHtml(markdown);
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Item 1</li>');
    });

    it('should return empty string for empty input', () => {
      expect(MarkdownConverter.toHtml('')).toBe('');
      expect(MarkdownConverter.toHtml('   ')).toBe('');
    });
  });

  describe('convertIfMarkdown', () => {
    it('should convert markdown content to HTML', () => {
      const markdown = '**Bold** text';
      const html = MarkdownConverter.convertIfMarkdown(markdown);
      expect(html).toContain('<strong>Bold</strong>');
    });

    it('should escape plain text when not markdown', () => {
      const plainText = 'This is <script>alert("xss")</script> text';
      const html = MarkdownConverter.convertIfMarkdown(plainText);
      expect(html).toBe('This is &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; text');
    });
  });
});

describe('HtmlBuilder', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(HtmlBuilder.escapeHtml('<div>')).toBe('&lt;div&gt;');
      expect(HtmlBuilder.escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
      expect(HtmlBuilder.escapeHtml("'single'")).toBe('&#039;single&#039;');
      expect(HtmlBuilder.escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('should handle complex HTML', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      expect(HtmlBuilder.escapeHtml(input)).toBe(expected);
    });
  });
});
