import Database from 'better-sqlite3';
import { Session } from '../types';

/**
 * Repository for sessions table operations
 */
export class SessionRepository {
  constructor(private db: Database.Database) {}

  /**
   * Insert or update a session
   */
  upsert(session: Session): number {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        project_id, session_id, title, provider, version, git_branch, cwd,
        models_json, created, modified, message_count, created_at, updated_at
      )
      VALUES (
        @projectId, @sessionId, @title, @provider, @version, @gitBranch, @cwd,
        @modelsJson, @created, @modified, @messageCount, @createdAt, @updatedAt
      )
      ON CONFLICT(project_id, session_id) DO UPDATE SET
        title = excluded.title,
        provider = excluded.provider,
        version = excluded.version,
        git_branch = excluded.git_branch,
        cwd = excluded.cwd,
        models_json = excluded.models_json,
        created = excluded.created,
        modified = excluded.modified,
        message_count = excluded.message_count,
        updated_at = excluded.updated_at
      RETURNING id
    `);
    
    const result = stmt.get({
      projectId: session.projectId,
      sessionId: session.sessionId,
      title: session.title,
      provider: session.provider,
      version: session.version || null,
      gitBranch: session.gitBranch || null,
      cwd: session.cwd || null,
      modelsJson: session.modelsJson || null,
      created: session.created || null,
      modified: session.modified || null,
      messageCount: session.messageCount,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }) as { id: number };
    
    return result.id;
  }

  /**
   * Get session by sessionId (UUID)
   */
  getBySessionId(sessionId: string): Session | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    
    if (!row) return undefined;
    
    return this.mapRowToSession(row);
  }

  /**
   * Get session by project_id and sessionId (composite key lookup)
   */
  getByProjectAndSessionId(projectId: number, sessionId: string): Session | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE project_id = ? AND session_id = ?');
    const row = stmt.get(projectId, sessionId) as any;
    
    if (!row) return undefined;
    
    return this.mapRowToSession(row);
  }

  /**
   * Get all sessions for a project
   */
  getByProjectId(projectId: number): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC');
    const rows = stmt.all(projectId) as any[];
    
    return rows.map(row => this.mapRowToSession(row));
  }

  /**
   * List sessions for a project with timestamps
   */
  listByProjectId(projectId: number): Array<{
    id: number;
    sessionId: string;
    title: string;
    provider: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
  }> {
    const sessions = this.getByProjectId(projectId);

    return sessions.map(s => ({
      id: s.id!,
      sessionId: s.sessionId,
      title: s.title,
      provider: s.provider,
      messageCount: s.messageCount,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }));
  }

  /**
   * Get total count of sessions
   */
  getCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any;
    return result.count;
  }

  private mapRowToSession(row: any): Session {
    return {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      title: row.title,
      provider: row.provider,
      version: row.version,
      gitBranch: row.git_branch,
      cwd: row.cwd,
      modelsJson: row.models_json,
      created: row.created,
      modified: row.modified,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
