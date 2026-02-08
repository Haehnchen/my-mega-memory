import Database from 'better-sqlite3';
import { SearchRepository } from './repository/SearchRepository';
import { existsSync } from 'fs';

/**
 * Manages the separate FTS5 search database (var/search.db)
 */
export const SEARCH_TABLE_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS search_messages USING fts5(
    content,
    session_id,
    project_id,
    card_type,
    session_title,
    project_name,
    timestamp UNINDEXED,
    tokenize='trigram'
  )
`;

export class SearchDatabase {
  private readonly db: Database.Database;
  public search: SearchRepository;

  constructor() {
    const dbPath = 'var/search.db';
    const isNewDatabase = !existsSync(dbPath);
    this.db = new Database(dbPath);

    // Optimize database performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');

    if (isNewDatabase) {
      this.db.exec(SEARCH_TABLE_SQL);
    }
    this.search = new SearchRepository(this.db);
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
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Vacuum the database to reclaim space and defragment
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }
}
