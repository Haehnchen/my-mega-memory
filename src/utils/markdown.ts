import MarkdownIt from 'markdown-it';

/**
 * Markdown to HTML converter using markdown-it library.
 * Ported from: de.espend.ml.llm.session.util.MarkdownConverter.kt
 * Converts markdown content to HTML for session display.
 */

// Patterns that indicate content is likely markdown
const MARKDOWN_PATTERNS = [
  /\*\*[^*]+\*\*/,           // **bold**
  /__[^_]+__/,                // __bold__
  /\*[^*]+\*/,                // *italic*
  /_[^_]+_/,                  // _italic_
  /`[^`]+`/,                  // `code`
  /\[.+\]\(.+\)/,             // [link](url)
  /^#{1,6}\s+.+$/m,           // # Header
  /^[-*+]\s+.+$/m,            // - list item
  /^\d+\.\s+.+$/m,            // 1. numbered list
  /```[\s\S]*?```/,           // ```code block```
];

// Initialize markdown-it with CommonMark support
const md = new MarkdownIt({
  html: false,        // Disable HTML tags in source
  breaks: false,      // Convert '\n' in paragraphs into <br>
  linkify: true,      // Autoconvert URL-like text to links
  typographer: true,  // Enable smart quotes and other typographic replacements
});

/**
 * HTML building utilities
 */
export class HtmlBuilder {
  /**
   * Escapes HTML special characters
   */
  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/**
 * MarkdownConverter class for detecting and converting markdown content
 */
export class MarkdownConverter {
  /**
   * Checks if the content appears to be markdown.
   * Returns true if the content contains markdown patterns.
   */
  static isMarkdown(content: string): boolean {
    if (!content || content.trim().length === 0) return false;

    for (const pattern of MARKDOWN_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Converts markdown content to HTML using markdown-it library.
   */
  static toHtml(content: string): string {
    if (!content || content.trim().length === 0) return '';

    // Render markdown to HTML
    const html = md.render(content);

    // Remove wrapping <p> tags if the content is a single paragraph
    // This matches the behavior of the Kotlin implementation which removes <body> tags
    return html.trim();
  }

  /**
   * Converts if content is markdown, otherwise returns HTML-escaped content.
   */
  static convertIfMarkdown(content: string): string {
    if (this.isMarkdown(content)) {
      return this.toHtml(content);
    } else {
      return HtmlBuilder.escapeHtml(content);
    }
  }
}
