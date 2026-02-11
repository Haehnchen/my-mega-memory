/**
 * Session provider types
 * Ported from: de.espend.ml.llm.session.SessionListItem.kt
 */
export enum SessionProvider {
  CLAUDE_CODE = 'claude_code',
  OPENCODE = 'opencode',
  CODEX = 'codex',
  AMP = 'amp',
  JUNIE = 'junie',
  KILO_CODE = 'kilocode',
  GEMINI = 'gemini',
  DROID = 'droid'
}

  /**
   * Session list item
   * Ported from: de.espend.ml.llm.session.SessionListItem.kt
   */
  export interface SessionListItem {
    sessionId: string;
    title: string;
    provider: SessionProvider;
    updated: string;
    created: string;
    messageCount?: number;
  }

/**
 * Session metadata
 * Ported from: de.espend.ml.llm.session.SessionService.kt
 */
export interface SessionMetadata {
  version?: string;
  gitBranch?: string;
  cwd?: string;
  models: Array<[string, number]>; // Model name to usage count, sorted by count desc
  created?: string;
  modified?: string;
  messageCount: number;
}

/**
 * Session detail
 * Ported from: de.espend.ml.llm.session.SessionService.kt
 */
export interface SessionDetail {
  sessionId: string;
  title: string;
  messages: ParsedMessage[];
  metadata?: SessionMetadata;
}

/**
 * Message content types
 * Ported from: de.espend.ml.llm.session.model.MessageModels.kt
 */
export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'code'; code: string; language?: string }
  | { type: 'markdown'; markdown: string }
  | { type: 'json'; json: string }
  | { type: 'diff'; oldText: string; newText: string; filePath?: string }
  | { type: 'html'; html: string };

/**
 * Tool result
 * Ported from: de.espend.ml.llm.session.model.MessageModels.kt
 */
export interface ToolResult {
  output: string;
  isError: boolean;
  toolCallId?: string;
}

/**
 * Info message style
 * Ported from: de.espend.ml.llm.session.model.MessageModels.kt
 */
export type InfoStyle = 'default' | 'error';

/**
 * Parsed message types (internal representation from parsers)
 * Ported from: de.espend.ml.llm.session.model.MessageModels.kt
 */
export type ParsedMessage =
  | { type: 'user'; timestamp: string; content: MessageContent[] }
  | { type: 'assistant_text'; timestamp: string; content: MessageContent[] }
  | { type: 'assistant_thinking'; timestamp: string; thinking: string }
  | { type: 'tool_use'; timestamp: string; toolName: string; toolCallId?: string; input: Record<string, string>; results: ToolResult[] }
  | { type: 'tool_result'; timestamp: string; toolName?: string; toolCallId?: string; output: MessageContent[]; isError: boolean }
  | { type: 'info'; timestamp: string; title: string; subtitle?: string; content?: MessageContent; style: InfoStyle };

/**
 * Renderable message card for UI display
 * Matches the structure used in SessionDetailView
 */
export interface RenderableMessage {
  /** Unique identifier */
  id?: number;
  
  /** Database session ID */
  sessionId: number;
  
  /** Display sequence/order */
  sequence: number;
  
  /** 
   * Card type / CSS class for styling
   * Matches SessionDetailView message classes:
   * - 'user' - User messages
   * - 'assistant' - Assistant text responses
   * - 'thinking' - Assistant thinking/reasoning
   * - 'tool-use' - Tool invocations
   * - 'tool-result' - Tool results
   * - 'info' - Info/system messages
   * - 'error' - Error messages (schema errors, etc.)
   */
  cardType: 'user' | 'assistant' | 'thinking' | 'tool-use' | 'tool-result' | 'info' | 'error';
  
  /** 
   * Title/label displayed in the card header
   * - For user: 'user'
   * - For assistant: 'text'
   * - For thinking: 'thinking'
   * - For tool-use: 'tool_use'
   * - For tool-result: 'tool_result'
   * - For info: info.title
   * - For error: 'error'
   */
  title: string;
  
  /** 
   * Subtitle/secondary label (optional)
   * - For tool-use: tool name (e.g., 'Read', 'Edit')
   * - For tool-result: tool call ID (truncated)
   * - For info: subtitle
   * - For error: 'schema' or error name
   */
  subtitle?: string;
  
  /** 
   * Content blocks to render
   * Multiple blocks for complex messages
   */
  content: MessageContent[];
  
  /** 
   * Timestamp for display
   * ISO 8601 format
   */
  timestamp: string;
  
  /** 
   * Whether this card can be expanded/collapsed
   * Typically true for long content
   */
  canExpand: boolean;
  
  /** 
   * Whether the card represents an error state
   * Affects styling (red/error colors)
   */
  isError: boolean;
  
  /** Creation timestamp (ISO 8601 datetime string) */
  createdAt: string;
}

/**
 * Project entity for database
 */
export interface Project {
  id?: number;
  projectUuid: string;
  name: string;
  path?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Session entity for database
 */
export interface Session {
  id?: number;
  projectId: number;
  sessionId: string;
  title: string;
  provider: SessionProvider;
  version?: string;
  gitBranch?: string;
  cwd?: string;
  modelsJson?: string;
  created?: string;
  modified?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Session with project info
 */
export interface SessionWithProject extends Session {
  projectName: string;
}
