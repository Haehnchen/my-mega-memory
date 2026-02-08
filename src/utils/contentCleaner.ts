import { MessageContent } from '../types';

/**
 * Extracts and cleans plain text from MessageContent blocks for search indexing
 */
export class ContentCleaner {
  /**
   * Extract plain text from an array of MessageContent blocks
   */
  static extractText(content: MessageContent[]): string {
    const parts: string[] = [];

    for (const block of content) {
      switch (block.type) {
        case 'text':
          parts.push(block.text);
          break;
        case 'code':
          parts.push(block.code);
          break;
        case 'markdown':
          parts.push(block.markdown);
          break;
        case 'json':
          // Strip JSON structural characters
          parts.push(block.json.replace(/[{}\[\]",:]/g, ' '));
          break;
        case 'diff':
          if (block.oldText) parts.push(block.oldText);
          if (block.newText) parts.push(block.newText);
          break;
        case 'html':
          // Strip HTML tags
          parts.push(block.html.replace(/<[^>]*>/g, ' '));
          break;
      }
    }

    return ContentCleaner.normalizeWhitespace(parts.join(' '));
  }

  /**
   * Collapse whitespace and trim
   */
  static normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}
