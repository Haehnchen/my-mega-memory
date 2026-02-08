import Database from 'better-sqlite3';
import { RenderableMessage } from '../types';

/**
 * Repository for messages table operations
 */
export class MessageRepository {
  constructor(private db: Database.Database) {}

  /**
   * Insert or update a renderable message
   */
  upsert(message: RenderableMessage): number {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        session_id, sequence, card_type, title, subtitle, content_json,
        timestamp, can_expand, is_error, created_at
      )
      VALUES (
        @sessionId, @sequence, @cardType, @title, @subtitle, @contentJson,
        @timestamp, @canExpand, @isError, @createdAt
      )
      ON CONFLICT(session_id, sequence) DO UPDATE SET
        card_type = excluded.card_type,
        title = excluded.title,
        subtitle = excluded.subtitle,
        content_json = excluded.content_json,
        timestamp = excluded.timestamp,
        can_expand = excluded.can_expand,
        is_error = excluded.is_error,
        created_at = excluded.created_at
      RETURNING id
    `);
    
    const result = stmt.get({
      sessionId: message.sessionId,
      sequence: message.sequence,
      cardType: message.cardType,
      title: message.title,
      subtitle: message.subtitle || null,
      contentJson: JSON.stringify(message.content),
      timestamp: message.timestamp,
      canExpand: message.canExpand ? 1 : 0,
      isError: message.isError ? 1 : 0,
      createdAt: message.createdAt
    }) as { id: number };
    
    return result.id;
  }

  /**
   * Get messages for a session
   */
  getBySessionId(sessionId: number): RenderableMessage[] {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY sequence ASC');
    const rows = stmt.all(sessionId) as any[];
    
    return rows.map(row => this.mapRowToMessage(row));
  }

  /**
   * Get total count of messages
   */
  getCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as any;
    return result.count;
  }

  /**
   * Delete all messages for a session
   */
  deleteBySessionId(sessionId: number): void {
    const stmt = this.db.prepare('DELETE FROM messages WHERE session_id = ?');
    stmt.run(sessionId);
  }

  /**
   * Delete messages for a session with sequence greater than the given value
   * Used during re-import to remove stale messages that were truncated
   */
  deleteBySessionIdAndMinSequence(sessionId: number, minSequence: number): void {
    const stmt = this.db.prepare('DELETE FROM messages WHERE session_id = ? AND sequence > ?');
    stmt.run(sessionId, minSequence);
  }

  private mapRowToMessage(row: any): RenderableMessage {
    return {
      id: row.id,
      sessionId: row.session_id,
      sequence: row.sequence,
      cardType: row.card_type,
      title: row.title,
      subtitle: row.subtitle,
      content: JSON.parse(row.content_json),
      timestamp: row.timestamp,
      canExpand: row.can_expand === 1,
      isError: row.is_error === 1,
      createdAt: row.created_at
    };
  }
}
