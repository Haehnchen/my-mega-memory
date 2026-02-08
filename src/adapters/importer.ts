import { DatabaseManager } from '../database';
import { SearchDatabase } from '../searchDatabase';
import {
  SessionProvider,
  SessionDetail,
  ParsedMessage,
  RenderableMessage,
  Session,
} from '../types';
import { ToolInputFormatter } from '../utils/toolFormatter';
import { ContentCleaner } from '../utils/contentCleaner';
import { generateProjectUuid } from '../utils/uuid';

// Import all adapters
import { ClaudeSessionFinder, ClaudeSessionParser } from './claude';
import { OpenCodeSessionFinder, OpenCodeSessionParser } from './opencode';
import { CodexSessionFinder, CodexSessionParser } from './codex';
import { AmpSessionFinder, AmpSessionParser } from './amp';
import { JunieSessionFinder, JunieSessionParser } from './junie';

interface SessionWithProject {
  session: SessionDetail;
  provider: SessionProvider;
  projectPath: string;
  projectName: string;
  title?: string; // Optional title from finder (e.g., Junie taskName)
  created: string;
  updated: string;
}

/**
 * Convert Unix timestamp (milliseconds or seconds) to ISO 8601 datetime string
 */
function toDateTimeString(timestamp: number): string {
  // Handle Unix timestamps in milliseconds (13 digits) or seconds (10 digits)
  const ms = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(ms).toISOString();
}

/**
 * Main session importer class
 * Imports sessions from all supported providers into SQLite
 * Extracts project information from the sessions themselves
 */
export class SessionImporter {
  private db: DatabaseManager;
  private searchDb: SearchDatabase;
  private claudeFinder: ClaudeSessionFinder;
  private claudeParser: ClaudeSessionParser;
  private openCodeFinder: OpenCodeSessionFinder;
  private openCodeParser: OpenCodeSessionParser;
  private codexFinder: CodexSessionFinder;
  private codexParser: CodexSessionParser;
  private ampFinder: AmpSessionFinder;
  private ampParser: AmpSessionParser;
  private junieFinder: JunieSessionFinder;
  private junieParser: JunieSessionParser;

  constructor() {
    this.db = new DatabaseManager();
    this.searchDb = new SearchDatabase();
    this.claudeFinder = new ClaudeSessionFinder();
    this.claudeParser = new ClaudeSessionParser();
    this.openCodeFinder = new OpenCodeSessionFinder();
    this.openCodeParser = new OpenCodeSessionParser();
    this.codexFinder = new CodexSessionFinder();
    this.codexParser = new CodexSessionParser();
    this.ampFinder = new AmpSessionFinder();
    this.ampParser = new AmpSessionParser();
    this.junieFinder = new JunieSessionFinder();
    this.junieParser = new JunieSessionParser();
  }

  /**
   * Import all sessions from all providers
   * Extracts projects from session metadata
   */
  async importAll(): Promise<void> {
    console.log('Starting import from all providers...\n');

    const allSessions: SessionWithProject[] = [];

    // Import from Claude Code
    console.log('Scanning Claude Code sessions...');
    const claudeSessions = await this.importClaudeSessions();
    console.log(`Found ${claudeSessions.length} Claude Code sessions`);
    allSessions.push(...claudeSessions);

    // Import from OpenCode
    console.log('\nScanning OpenCode sessions...');
    const openCodeSessions = await this.importOpenCodeSessions();
    console.log(`Found ${openCodeSessions.length} OpenCode sessions`);
    allSessions.push(...openCodeSessions);

    // Import from Codex
    console.log('\nScanning Codex sessions...');
    const codexSessions = await this.importCodexSessions();
    console.log(`Found ${codexSessions.length} Codex sessions`);
    allSessions.push(...codexSessions);

    // Import from Amp
    console.log('\nScanning Amp sessions...');
    const ampSessions = await this.importAmpSessions();
    console.log(`Found ${ampSessions.length} Amp sessions`);
    allSessions.push(...ampSessions);

    // Import from Junie
    console.log('\nScanning Junie sessions...');
    const junieSessions = await this.importJunieSessions();
    console.log(`Found ${junieSessions.length} Junie sessions`);
    allSessions.push(...junieSessions);

    console.log(`\n=================================`);
    console.log(`Total sessions found: ${allSessions.length}`);
    console.log(`=================================\n`);

    // Group sessions by project
    // Filter out sessions with invalid project names
    const validSessions = allSessions.filter(s => {
      if (!s.projectName) {
        console.log(`Skipping session ${s.session.sessionId}: no valid project name`);
        return false;
      }
      return true;
    });
    
    // Group sessions by project
    const sessionsByProject = this.groupSessionsByProject(validSessions);
    console.log(`Projects detected: ${Object.keys(sessionsByProject).length}\n`);

    // Import all sessions grouped by project
    let importedCount = 0;
    let errorCount = 0;

    for (const [projectName, sessions] of Object.entries(sessionsByProject)) {
      console.log(`Importing project: ${projectName} (${sessions.length} sessions)`);
      
      // Create or get project (projects use upsert so no transaction needed per project)
      const projectPath = sessions[0]?.projectPath;
      
      // Calculate project timestamps from sessions (min created, max updated)
      const projectCreatedAt = toDateTimeString(Math.min(...sessions.map(s => new Date(s.created).getTime())));
      const projectUpdatedAt = toDateTimeString(Math.max(...sessions.map(s => new Date(s.updated).getTime())));
      
      // Generate deterministic UUID from project path
      const projectUuid = generateProjectUuid(projectPath || projectName);
      
      const projectId = this.db.projects.upsert({
        projectUuid,
        name: projectName,
        path: projectPath,
        createdAt: projectCreatedAt,
        updatedAt: projectUpdatedAt
      });

      for (const sessionWithProject of sessions) {
        // Skip sessions without valid project path
        if (!sessionWithProject.projectPath || sessionWithProject.projectPath === 'unknown') {
          console.log(`  Skipping session ${sessionWithProject.session.sessionId}: no valid project path`);
          continue;
        }
        
        try {
          await this.importSession(sessionWithProject, projectId, projectUuid);
          importedCount++;
        } catch (e) {
          errorCount++;
          console.error(`Error importing session ${sessionWithProject.session.sessionId}:`, e);
        }
      }
    }

    console.log(`\n=================================`);
    console.log('Import complete!');
    console.log(`Successfully imported: ${importedCount} sessions`);
    if (errorCount > 0) {
      console.log(`Errors: ${errorCount} sessions`);
    }
    console.log(`=================================\n`);

    // Show stats
    console.log('Database stats:');
    console.log(`  Projects: ${this.db.projects.getCount()}`);
    console.log(`  Sessions: ${this.db.sessions.getCount()}`);
    console.log(`  Messages: ${this.db.messages.getCount()}`);
    console.log(`  Search entries: ${this.searchDb.search.getCount()}`);
  }

  /**
   * Import Claude Code sessions
   */
  private async importClaudeSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const files = this.claudeFinder.listSessionFiles();

    for (const { filePath, projectName } of files) {
      try {
        const session = this.claudeParser.parseFile(filePath);
        if (session) {
          const projectPath = session.metadata?.cwd || projectName;
          const extractedProjectName = this.extractProjectName(projectPath);
          
          // Skip if we can't determine a valid project name
          if (!extractedProjectName) {
            console.log(`Skipping Claude session ${session.sessionId}: no valid project path`);
            continue;
          }
          
          const stats = require('fs').statSync(filePath);
          
          sessions.push({
            session,
            provider: SessionProvider.CLAUDE_CODE,
            projectPath,
            projectName: extractedProjectName,
            created: toDateTimeString(stats.birthtimeMs),
            updated: toDateTimeString(stats.mtimeMs)
          });
        }
      } catch (e) {
        console.error(`Error parsing Claude session file ${filePath}:`, e);
      }
    }

    return sessions;
  }

  /**
   * Import OpenCode sessions
   */
  private async importOpenCodeSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.openCodeFinder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.openCodeParser.parseSession(info.sessionId);
        if (session) {
          const extractedProjectName = this.extractProjectName(info.projectPath);
          
          // Skip if we can't determine a valid project name
          if (!extractedProjectName || !info.projectPath) {
            console.log(`Skipping OpenCode session ${session.sessionId}: no valid project path`);
            continue;
          }
          
          sessions.push({
            session,
            provider: SessionProvider.OPENCODE,
            projectPath: info.projectPath as string,
            projectName: extractedProjectName as string,
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated)
          });
        }
      } catch (e) {
        console.error(`Error parsing OpenCode session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }

  /**
   * Import Codex sessions
   */
  private async importCodexSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.codexFinder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.codexParser.parseFile(info.filePath);
        if (session) {
          const projectPath = info.cwd || session.metadata?.cwd;
          
          // Skip if we can't determine a valid project path
          if (!projectPath) {
            console.log(`Skipping Codex session ${session.sessionId}: no valid project path`);
            continue;
          }
          
          const extractedProjectName = this.extractProjectName(projectPath);
          
          // Skip if we can't determine a valid project name
          if (!extractedProjectName) {
            console.log(`Skipping Codex session ${session.sessionId}: no valid project name`);
            continue;
          }
          
          sessions.push({
            session,
            provider: SessionProvider.CODEX,
            projectPath: projectPath as string,
            projectName: extractedProjectName as string,
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated)
          });
        }
      } catch (e) {
        console.error(`Error parsing Codex session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }

  /**
   * Import Amp sessions
   */
  private async importAmpSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.ampFinder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.ampParser.parseFile(info.filePath);
        if (session) {
          const projectPath = info.projectPath || session.metadata?.cwd;
          
          // Skip if we can't determine a valid project path
          if (!projectPath) {
            console.log(`Skipping Amp session ${session.sessionId}: no valid project path`);
            continue;
          }
          
          const extractedProjectName = this.extractProjectName(projectPath);
          
          // Skip if we can't determine a valid project name
          if (!extractedProjectName) {
            console.log(`Skipping Amp session ${session.sessionId}: no valid project name`);
            continue;
          }
          
          sessions.push({
            session,
            provider: SessionProvider.AMP,
            projectPath: projectPath as string,
            projectName: extractedProjectName as string,
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated)
          });
        }
      } catch (e) {
        console.error(`Error parsing Amp session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }

  /**
   * Import Junie sessions
   */
  private async importJunieSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.junieFinder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.junieParser.parseFile(info.filePath);
        if (session) {
          const projectPath = info.projectPath || session.metadata?.cwd;
          
          // Skip if we can't determine a valid project path
          if (!projectPath) {
            console.log(`Skipping Junie session ${session.sessionId}: no valid project path`);
            continue;
          }
          
          const extractedProjectName = this.extractProjectName(projectPath);
          
          // Skip if we can't determine a valid project name
          if (!extractedProjectName) {
            console.log(`Skipping Junie session ${session.sessionId}: no valid project path`);
            continue;
          }
          
          sessions.push({
            session,
            provider: SessionProvider.JUNIE,
            projectPath: projectPath as string,
            projectName: extractedProjectName as string,
            title: info.title, // Pass title from finder (taskName)
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated)
          });
        }
      } catch (e) {
        console.error(`Error parsing Junie session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }

  /**
   * Group sessions by project
   */
  private groupSessionsByProject(sessions: SessionWithProject[]): Record<string, SessionWithProject[]> {
    const grouped: Record<string, SessionWithProject[]> = {};

    for (const session of sessions) {
      const projectName = session.projectName;
      if (!grouped[projectName]) {
        grouped[projectName] = [];
      }
      grouped[projectName].push(session);
    }

    return grouped;
  }

  /**
   * Extract a clean project name from a path
   * Returns null if path is invalid/unknown
   */
  private extractProjectName(projectPath: string): string | null {
    if (!projectPath || projectPath === 'unknown' || projectPath === 'null' || projectPath === 'undefined') {
      return null;
    }

    // Get the last part of the path
    const parts = projectPath.split(/[/\\]/).filter(p => p.length > 0);
    const lastPart = parts[parts.length - 1];

    if (!lastPart) {
      return null;
    }

    // Clean up the name
    const cleaned = lastPart
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    
    return cleaned || null;
  }

  /**
   * Import a single session
   */
  private async importSession(sessionWithProject: SessionWithProject, projectId: number, projectUuid: string): Promise<void> {
    const sessionDetail = sessionWithProject.session;
    const provider = sessionWithProject.provider;
    
    // Use actual timestamps from the session, not current time
    const createdAt = sessionWithProject.created;
    const updatedAt = sessionWithProject.updated;
    
    // Use title from finder if available, otherwise from parser
    const title = sessionWithProject.title || sessionDetail.title;

    // Start transaction for this session
    this.db.beginTransaction();
    try {
      // Check if session already exists in this project (composite key lookup)
      const existingSession = this.db.sessions.getByProjectAndSessionId(projectId, sessionDetail.sessionId);
      
      const sessionData: Session = {
        projectId,
        sessionId: sessionDetail.sessionId,
        title,
        provider,
        version: sessionDetail.metadata?.version,
        gitBranch: sessionDetail.metadata?.gitBranch,
        cwd: sessionDetail.metadata?.cwd,
        modelsJson: sessionDetail.metadata?.models ? JSON.stringify(sessionDetail.metadata.models) : undefined,
        created: sessionDetail.metadata?.created,
        modified: sessionDetail.metadata?.modified,
        messageCount: sessionDetail.messages.length,
        createdAt,
        updatedAt
      };

      const sessionId = this.db.sessions.upsert(sessionData);

      // Import messages with sequence number (upsert to handle re-imports)
      // Batch in transactions of 50 messages for better performance
      const MSG_BATCH_SIZE = 50;
      const renderableMessages: RenderableMessage[] = [];
      let lastSequence = -1;
      
      sessionDetail.messages.forEach((message, index) => {
        const messageData = this.convertToMessage(message, sessionId, createdAt, index, sessionDetail.metadata?.cwd);
        this.db.messages.upsert(messageData);
        renderableMessages.push(messageData);
        lastSequence = index;
        
        // Commit and start new transaction every MSG_BATCH_SIZE messages
        if ((index + 1) % MSG_BATCH_SIZE === 0) {
          this.db.commitTransaction();
          this.db.beginTransaction();
        }
      });

      // Delete stale messages with sequence greater than the last imported message
      // This handles cases where messages were truncated from the session
      if (lastSequence >= 0) {
        this.db.messages.deleteBySessionIdAndMinSequence(sessionId, lastSequence);
      }

      this.db.commitTransaction();
      
      // Index messages for full-text search in batches of 50 (failure should not block main import)
      const SEARCH_BATCH_SIZE = 50;
      try {
        this.searchDb.search.deleteBySessionId(sessionDetail.sessionId);
        this.searchDb.beginTransaction();
        renderableMessages.forEach((msg, i) => {
          const text = ContentCleaner.extractText(msg.content);
          if (text) {
            this.searchDb.search.insert({
              content: text,
              sessionId: sessionDetail.sessionId,
              projectId: projectUuid,
              cardType: msg.cardType,
              sessionTitle: title,
              projectName: sessionWithProject.projectName,
              timestamp: msg.timestamp,
            });
          }
          if ((i + 1) % SEARCH_BATCH_SIZE === 0) {
            this.searchDb.commitTransaction();
            this.searchDb.beginTransaction();
          }
        });
        this.searchDb.commitTransaction();
      } catch (e) {
        console.error(`Error indexing search for session ${sessionDetail.sessionId}:`, e);
        try { this.searchDb.rollbackTransaction(); } catch (rollbackErr) {
          console.error(`Error rolling back search transaction:`, rollbackErr);
        }
      }
    } catch (e) {
      this.db.rollbackTransaction();
      throw e;
    }
  }

  /**
   * Convert a ParsedMessage to a RenderableMessage card
   * Matches the rendering logic in SessionDetailView
   */
  private convertToMessage(msg: ParsedMessage, sessionId: number, now: string, sequence: number, cwd?: string): RenderableMessage {
    const baseCard: Partial<RenderableMessage> = {
      sessionId,
      sequence,
      timestamp: msg.timestamp,
      createdAt: now,
      canExpand: true
    };

    switch (msg.type) {
      case 'user':
        return {
          ...baseCard,
          cardType: 'user',
          title: 'user',
          content: msg.content,
          isError: false
        } as RenderableMessage;

      case 'assistant_text':
        return {
          ...baseCard,
          cardType: 'assistant',
          title: 'text',
          content: msg.content,
          isError: false
        } as RenderableMessage;

      case 'assistant_thinking':
        return {
          ...baseCard,
          cardType: 'thinking',
          title: 'thinking',
          content: [{ type: 'text', text: msg.thinking }],
          isError: false
        } as RenderableMessage;

      case 'tool_use':
        // Format tool input with path stripping and diff generation for Edit tools
        const toolContent = ToolInputFormatter.formatInputWithPathStripping(
          msg.input,
          msg.toolName,
          cwd
        );
        
        // Convert ToolInputContent to MessageContent
        const messageContent = ToolInputFormatter.convertToMessageContent(toolContent);
        
        return {
          ...baseCard,
          cardType: 'tool-use',
          title: 'tool_use',
          subtitle: msg.toolName,
          content: messageContent,
          isError: false
        } as RenderableMessage;

      case 'tool_result':
        return {
          ...baseCard,
          cardType: 'tool-result',
          title: 'tool_result',
          subtitle: msg.toolCallId?.slice(0, 24),
          content: msg.output,
          isError: msg.isError
        } as RenderableMessage;

      case 'info':
        const isErrorStyle = msg.style === 'error';
        const contentList = msg.content ? [msg.content] : [{ type: 'text' as const, text: `[${msg.title}]` }];
        
        return {
          ...baseCard,
          cardType: isErrorStyle ? 'error' : 'info',
          title: msg.title,
          subtitle: msg.subtitle,
          content: contentList,
          isError: isErrorStyle
        } as RenderableMessage;

      default:
        return {
          ...baseCard,
          cardType: 'info',
          title: 'unknown',
          content: [{ type: 'text' as const, text: 'Unknown message type' }],
          timestamp: new Date().toISOString(),
          isError: false,
          canExpand: false
        } as RenderableMessage;
    }
  }

  /**
   * Vacuum both databases to reclaim space and defragment
   */
  vacuum(): void {
    console.log('Vacuuming databases...');
    this.db.vacuum();
    this.searchDb.vacuum();
    console.log('Vacuum complete.');
  }

  /**
   * Optimize the search index to reclaim space from deleted entries
   */
  optimizeSearch(): void {
    console.log('Optimizing search index...');
    this.searchDb.search.optimize();
    console.log('Search index optimized.');
  }

  /**
   * Close the importer and database
   */
  close(): void {
    this.db.close();
    this.searchDb.close();
  }
}