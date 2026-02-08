import { diffLines } from 'diff';

/**
 * Represents a single line in a diff
 */
export interface DiffLine {
  type: 'removed' | 'added' | 'context';
  line: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * HTML building utilities for generating diff views
 * Ported from de.espend.ml.llm.session.util.HtmlBuilder
 */
export class DiffBuilder {
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

  /**
   * Strips the working directory from a file path for cleaner display
   */
  static stripWorkingDirectory(filePath: string, workingDir?: string): string {
    if (!workingDir) return filePath;

    const normalizedWorkingDir = workingDir.replace(/\/$/, '');
    if (filePath.startsWith(normalizedWorkingDir)) {
      return filePath.substring(normalizedWorkingDir.length).replace(/^\//, '');
    }
    return filePath;
  }

  /**
   * Generates an inline diff using the 'diff' library
   * For small changes, shows the full diff. For larger changes, shows changed hunks.
   */
  static generateInlineDiff(oldText: string, newText: string): DiffLine[] {
    // Strip common leading whitespace to reduce indentation in diff view
    const { strippedOld, strippedNew } = this.stripCommonLeadingWhitespace(oldText, newText);

    const diffResult = diffLines(strippedOld, strippedNew);
    const lines: DiffLine[] = [];

    let oldLineNum = 1;
    let newLineNum = 1;

    for (const part of diffResult) {
      const partLines = part.value.split('\n');
      // Remove the last empty line that split creates
      if (partLines.length > 0 && partLines[partLines.length - 1] === '') {
        partLines.pop();
      }

      for (const line of partLines) {
        if (part.added) {
          lines.push({
            type: 'added',
            line,
            newLineNumber: newLineNum++
          });
        } else if (part.removed) {
          lines.push({
            type: 'removed',
            line,
            oldLineNumber: oldLineNum++
          });
        } else {
          lines.push({
            type: 'context',
            line,
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++
          });
        }
      }
    }

    return lines;
  }

  /**
   * Strips common leading whitespace from both texts
   */
  private static stripCommonLeadingWhitespace(
    oldText: string,
    newText: string
  ): { strippedOld: string; strippedNew: string } {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const allLines = [...oldLines, ...newLines];

    // Find minimum leading whitespace among non-empty lines
    const minIndent = allLines
      .filter(line => line.trim().length > 0)
      .reduce((min, line) => {
        const indent = line.match(/^[\s\t]*/)?.[0].length || 0;
        return Math.min(min, indent);
      }, Infinity);

    if (minIndent === 0 || minIndent === Infinity) {
      return { strippedOld: oldText, strippedNew: newText };
    }

    // Strip the common indentation from all lines
    const strippedOld = oldLines
      .map(line => {
        if (line.length <= minIndent || line.trim().length === 0) {
          return line.trim();
        }
        return line.substring(minIndent);
      })
      .join('\n');

    const strippedNew = newLines
      .map(line => {
        if (line.length <= minIndent || line.trim().length === 0) {
          return line.trim();
        }
        return line.substring(minIndent);
      })
      .join('\n');

    return { strippedOld, strippedNew };
  }

  /**
   * Formats diff lines to HTML
   */
  static formatDiffToHtml(lines: DiffLine[]): string {
    return lines
      .map(line => {
        const escaped = this.escapeHtml(line.line);
        switch (line.type) {
          case 'removed':
            return `<div class="diff-line diff-removed"><span class="diff-marker">-</span><span class="diff-content">${escaped}</span></div>`;
          case 'added':
            return `<div class="diff-line diff-added"><span class="diff-marker">+</span><span class="diff-content">${escaped}</span></div>`;
          case 'context':
            return `<div class="diff-line diff-context"><span class="diff-marker"> </span><span class="diff-content">${escaped}</span></div>`;
          default:
            return `<div class="diff-line diff-context"><span class="diff-marker"> </span><span class="diff-content">${escaped}</span></div>`;
        }
      })
      .join('');
  }

  /**
   * Generates a complete diff view HTML for old and new text
   */
  static generateDiffView(oldText: string, newText: string): string {
    const lines = this.generateInlineDiff(oldText, newText);
    return this.formatDiffToHtml(lines);
  }
}

/**
 * Gets a value from the parameter map using normalized key matching
 * Normalizes keys by converting to lowercase and removing underscores
 * This allows matching both "old_string" and "oldString" with the same lookup
 * 
 * Ported from SessionDetailView.kt getParameterValue()
 */
export function getParameterValue(
  parameters: Record<string, string>,
  ...normalizedKeys: string[]
): string | undefined {
  for (const normalizedKey of normalizedKeys) {
    // First try direct lookup with the normalized key
    if (normalizedKey in parameters) {
      return parameters[normalizedKey];
    }

    // Then search through all keys, normalizing them for comparison
    for (const [key, value] of Object.entries(parameters)) {
      const keyNormalized = key.toLowerCase().replace(/_/g, '');
      if (keyNormalized === normalizedKey) {
        return value;
      }
    }
  }
  return undefined;
}
