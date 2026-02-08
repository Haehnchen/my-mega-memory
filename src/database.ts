import Database from 'better-sqlite3';
import { ProjectRepository, SessionRepository, MessageRepository } from './repository';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

export class DatabaseManager {
  private readonly db: Database.Database;
  public projects: ProjectRepository;
  public sessions: SessionRepository;
  public messages: MessageRepository;

  constructor() {
    const dbPath = 'var/sessions.db';
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const isNewDatabase = !existsSync(dbPath);
    this.db = new Database(dbPath);

    // Optimize database performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('locking_mode = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');

    if (isNewDatabase) {
      this.initTables();
    }
    this.projects = new ProjectRepository(this.db);
    this.sessions = new SessionRepository(this.db);
    this.messages = new MessageRepository(this.db);
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_uuid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        path TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        provider TEXT NOT NULL,
        version TEXT,
        git_branch TEXT,
        cwd TEXT,
        models_json TEXT,
        created TEXT,
        modified TEXT,
        message_count INTEGER DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, session_id)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        card_type TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        content_json TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        can_expand INTEGER DEFAULT 1,
        is_error INTEGER DEFAULT 0,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, sequence)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(sequence)
    `);
  }

  resetTables(): void {
    this.db.exec('DROP TABLE IF EXISTS messages');
    this.db.exec('DROP TABLE IF EXISTS sessions');
    this.db.exec('DROP TABLE IF EXISTS projects');
    this.initTables();
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Begin a transaction
   */
  beginTransaction(): void {
    this.db.exec('BEGIN TRANSACTION');
  }

  /**
   * Commit a transaction
   */
  commitTransaction(): void {
    this.db.exec('COMMIT');
  }

  /**
   * Rollback a transaction
   */
  rollbackTransaction(): void {
    this.db.exec('ROLLBACK');
  }

  /**
   * Vacuum the database to reclaim space and defragment
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }
}
