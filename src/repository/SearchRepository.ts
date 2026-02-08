import Database from 'better-sqlite3';

export interface SearchEntry {
  content: string;
  sessionId: string;
  projectId: string;
  cardType: string;
  sessionTitle: string;
  projectName: string;
  timestamp: string;
}

export interface SearchResult {
  content: string;
  sessionId: string;
  projectId: string;
  cardType: string;
  sessionTitle: string;
  projectName: string;
  timestamp: string;
  score: number;
}

// BM25 column weights: content, session_id, project_id, card_type, session_title, project_name
const BM25_WEIGHTS = '10.0, 0.0, 0.0, 0.0, 5.0, 2.0';
const MAX_LIMIT = 100;

/**
 * Repository for FTS5 search operations on search_messages
 */
export class SearchRepository {
  constructor(private db: Database.Database) {}

  /**
   * Insert a search entry into the FTS5 table
   */
  insert(entry: SearchEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO search_messages (content, session_id, project_id, card_type, session_title, project_name, timestamp)
      VALUES (@content, @sessionId, @projectId, @cardType, @sessionTitle, @projectName, @timestamp)
    `);

    stmt.run({
      content: entry.content,
      sessionId: entry.sessionId,
      projectId: entry.projectId,
      cardType: entry.cardType,
      sessionTitle: entry.sessionTitle,
      projectName: entry.projectName,
      timestamp: entry.timestamp,
    });
  }

  /**
   * Delete all search entries for a session UUID
   */
  deleteBySessionId(sessionId: string): void {
    const stmt = this.db.prepare(
      `DELETE FROM search_messages WHERE session_id = ?`
    );
    stmt.run(sessionId);
  }

  /**
   * Full-text search with BM25 weighted scoring, newer messages as tiebreaker
   */
  search(query: string, limit = 50): SearchResult[] {
    const safeLimit = Math.min(limit, MAX_LIMIT);
    const ftsQuery = this.escapeFts5Query(query);

    const stmt = this.db.prepare(`
      SELECT
        highlight(search_messages, 0, '<mark>', '</mark>') AS content,
        session_id AS sessionId,
        project_id AS projectId,
        card_type AS cardType,
        session_title AS sessionTitle,
        project_name AS projectName,
        timestamp,
        ROUND(-bm25(search_messages, ${BM25_WEIGHTS}), 2) AS score
      FROM search_messages
      WHERE search_messages MATCH ?
      ORDER BY bm25(search_messages, ${BM25_WEIGHTS}), timestamp DESC
      LIMIT ?
    `);
    return stmt.all(ftsQuery, safeLimit) as SearchResult[];
  }

  /**
   * Full-text search filtered by project name
   */
  searchByProject(projectName: string, query: string, limit = 50): SearchResult[] {
    const safeLimit = Math.min(limit, MAX_LIMIT);
    const ftsQuery = this.escapeFts5Query(query);

    const stmt = this.db.prepare(`
      SELECT
        highlight(search_messages, 0, '<mark>', '</mark>') AS content,
        session_id AS sessionId,
        project_id AS projectId,
        card_type AS cardType,
        session_title AS sessionTitle,
        project_name AS projectName,
        timestamp,
        ROUND(-bm25(search_messages, ${BM25_WEIGHTS}), 2) AS score
      FROM search_messages
      WHERE search_messages MATCH ?
        AND project_name = ?
      ORDER BY bm25(search_messages, ${BM25_WEIGHTS}), timestamp DESC
      LIMIT ?
    `);
    return stmt.all(ftsQuery, projectName, safeLimit) as SearchResult[];
  }

  /**
   * Escape an FTS5 search query: wrap in double quotes for substring match
   */
  escapeFts5Query(query: string): string {
    const trimmed = query.trim();
    if (!trimmed) return '""';
    return '"' + this.escapeFts5Value(trimmed) + '"';
  }

  /**
   * Escape a value for use inside FTS5 double quotes
   */
  escapeFts5Value(value: string): string {
    return value.replace(/"/g, '""');
  }

  /**
   * Get total count of indexed entries
   */
  getCount(): number {
    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM search_messages'
    ).get() as any;
    return result.count;
  }

  /**
   * Optimize the FTS5 index after bulk deletions to reclaim space
   * This merges index segments and removes deleted entries
   */
  optimize(): void {
    this.db.exec("INSERT INTO search_messages(search_messages) VALUES('optimize')");
  }
}
