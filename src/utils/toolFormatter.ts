import { DiffBuilder, getParameterValue } from './diff';
import { MessageContent } from '../types';

/**
 * Tool input content block types
 * Extends MessageContent with diff-specific type
 */
export type ToolInputContent =
  | { type: 'text'; text: string }
  | { type: 'code'; code: string; language?: string }
  | { type: 'diff'; oldText: string; newText: string; filePath?: string };

/**
 * Tool input formatter for rendering tool parameters
 * Ported from de.espend.ml.llm.session.view.SessionDetailView
 */
export class ToolInputFormatter {
  /**
   * Formats tool input parameters for display with path stripping applied
   * Handles Edit tool with diff generation directly
   * 
   * Normalizes parameter names to handle both underscore (old_string) and camelCase (oldString) formats
   * Also handles variations like old_str/new_str used by some providers
   * 
   * @param input The tool input parameters
   * @param toolName The name of the tool
   * @param cwd Optional working directory for path stripping
   * @returns Array of content blocks for rendering
   */
  static formatInputWithPathStripping(
    input: Record<string, string>,
    toolName: string,
    cwd?: string
  ): ToolInputContent[] {
    // Special handling for Edit-like tools - generate diff view directly
    // Match tool names containing "edit" (e.g., "Edit", "edit_file", "EditFile")
    if (toolName.toLowerCase().includes('edit')) {
      // Use normalized parameter lookup to handle various naming conventions:
      // old_string, oldString, old_str, oldStr
      const oldString = getParameterValue(input, 'oldstring', 'oldstr');
      const newString = getParameterValue(input, 'newstring', 'newstr');

      if (oldString !== undefined && newString !== undefined) {
        return this.formatEditDiffContent(oldString, newString, input, cwd);
      }
    }

    // Generic formatting for all other cases
    return this.formatGenericToolInput(input);
  }

  /**
   * Formats an Edit tool diff as content blocks
   * Shows removed lines in red with "-" prefix and added lines in green with "+" prefix
   * 
   * Normalizes parameter names to handle various path formats:
   * file_path, filePath, path, pathInProject, pathinproject
   */
  private static formatEditDiffContent(
    oldString: string,
    newString: string,
    parameters: Record<string, string>,
    cwd?: string
  ): ToolInputContent[] {
    const content: ToolInputContent[] = [];

    // Add file path parameter if present using normalized lookup
    // Handle various naming conventions: file_path, filePath, path
    const filePath = getParameterValue(parameters, 'filepath', 'path');
    if (filePath !== undefined) {
      const strippedPath = cwd ? DiffBuilder.stripWorkingDirectory(filePath, cwd) : filePath;
      content.push({ type: 'text', text: `file_path:` });
      content.push({ type: 'code', code: strippedPath });
    }

    // Add the diff view with file path
    content.push({ type: 'diff', oldText: oldString, newText: newString, filePath });

    return content;
  }

  /**
   * Generic formatting for non-Edit tools
   * Adds each parameter with its name as text and value as code block
   */
  private static formatGenericToolInput(input: Record<string, string>): ToolInputContent[] {
    const content: ToolInputContent[] = [];

    for (const [key, value] of Object.entries(input)) {
      content.push({ type: 'text', text: key });
      content.push({ type: 'code', code: value });
    }

    return content;
  }

  /**
   * Converts ToolInputContent to MessageContent for compatibility
   * This is a helper to maintain backward compatibility
   */
  static convertToMessageContent(content: ToolInputContent[]): MessageContent[] {
    return content.map(block => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text };
        case 'code':
          return { type: 'code', code: block.code, language: block.language };
        case 'diff':
          return {
            type: 'diff',
            oldText: block.oldText,
            newText: block.newText,
            filePath: block.filePath
          };
        default:
          return { type: 'text', text: '' };
      }
    });
  }
}
