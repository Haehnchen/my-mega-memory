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
import { toDateTimeString } from '../utils/time';

import { SessionAdapter, SessionWithProject } from './sessionAdapter';
import { ClaudeSessionAdapter } from './claude/adapter';
import { OpenCodeAdapter } from './opencode/adapter';
import { CodexAdapter } from './codex/adapter';
import { AmpAdapter } from './amp/adapter';
import { JunieAdapter } from './junie/adapter';
import { KiloSessionAdapter } from './kilocode/adapter';
import { GeminiAdapter } from './gemini/adapter';

function createDefaultAdapters(): SessionAdapter[] {
  return [
    new ClaudeSessionAdapter(),
    new OpenCodeAdapter(),
    new CodexAdapter(),
    new AmpAdapter(),
    new JunieAdapter(),
    new KiloSessionAdapter(),
    new GeminiAdapter(),
  ];
}

/**
 * Main session importer class
 * Imports sessions from all supported providers into SQLite
 * Extracts project information from the sessions themselves
 */
export class SessionImporter {
  private db: DatabaseManager;
  private searchDb: SearchDatabase;
  private adapters: SessionAdapter[];

  private ownsDb: boolean;

  constructor(adapters?: SessionAdapter[], db?: DatabaseManager, searchDb?: SearchDatabase) {
    this.ownsDb = !db;
    this.db = db || new DatabaseManager();
    this.searchDb = searchDb || new SearchDatabase();
    this.adapters = adapters || createDefaultAdapters();
  }

  /**
   * Import all sessions from all providers
   * Extracts projects from session metadata
   */
  async importAll(): Promise<void> {
    console.log('Starting import from all providers...\n');

    const allSessions: SessionWithProject[] = [];

    for (const adapter of this.adapters) {
      console.log(`Scanning ${adapter.label} sessions...`);
      const sessions = await adapter.getSessions();
      console.log(`Found ${sessions.length} ${adapter.label} sessions`);
      allSessions.push(...sessions);
    }

    console.log(`\n=================================`);
    console.log(`Total sessions found: ${allSessions.length}`);
    console.log(`=================================\n`);

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
   * Import a single session with automatic project upsert.
   * Can be called standalone (e.g. from an API endpoint).
   */
  async importSingleSession(sessionWithProject: SessionWithProject): Promise<void> {
    if (!sessionWithProject.projectName) {
      throw new Error(`Session ${sessionWithProject.session.sessionId}: no valid project name`);
    }
    if (!sessionWithProject.projectPath || sessionWithProject.projectPath === 'unknown') {
      throw new Error(`Session ${sessionWithProject.session.sessionId}: no valid project path`);
    }

    const projectUuid = generateProjectUuid(sessionWithProject.projectPath || sessionWithProject.projectName);

    const projectId = this.db.projects.upsert({
      projectUuid,
      name: sessionWithProject.projectName,
      path: sessionWithProject.projectPath,
      createdAt: sessionWithProject.created,
      updatedAt: sessionWithProject.updated,
    });

    await this.importSession(sessionWithProject, projectId, projectUuid);
  }

  private async importSession(sessionWithProject: SessionWithProject, projectId: number, projectUuid: string): Promise<void> {
    const sessionDetail = sessionWithProject.session;
    const provider = sessionWithProject.provider;
    
    const createdAt = sessionWithProject.created;
    const updatedAt = sessionWithProject.updated;
    
    const title = sessionWithProject.title || sessionDetail.title;

    this.db.beginTransaction();
    try {
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

      const MSG_BATCH_SIZE = 50;
      const renderableMessages: RenderableMessage[] = [];
      let lastSequence = -1;
      
      sessionDetail.messages.forEach((message, index) => {
        const messageData = this.convertToMessage(message, sessionId, createdAt, index, sessionDetail.metadata?.cwd);
        this.db.messages.upsert(messageData);
        renderableMessages.push(messageData);
        lastSequence = index;
        
        if ((index + 1) % MSG_BATCH_SIZE === 0) {
          this.db.commitTransaction();
          this.db.beginTransaction();
        }
      });

      if (lastSequence >= 0) {
        this.db.messages.deleteBySessionIdAndMinSequence(sessionId, lastSequence);
      }

      this.db.commitTransaction();
      
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
        const toolContent = ToolInputFormatter.formatInputWithPathStripping(
          msg.input,
          msg.toolName,
          cwd
        );
        
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

  vacuum(): void {
    console.log('Vacuuming databases...');
    this.db.vacuum();
    this.searchDb.vacuum();
    console.log('Vacuum complete.');
  }

  optimizeSearch(): void {
    console.log('Optimizing search index...');
    this.searchDb.search.optimize();
    console.log('Search index optimized.');
  }

  close(): void {
    if (this.ownsDb) {
      this.db.close();
      this.searchDb.close();
    }
  }
}
