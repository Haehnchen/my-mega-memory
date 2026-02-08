import Database from 'better-sqlite3';
import { Project } from '../types';

/**
 * Repository for projects table operations
 */
export class ProjectRepository {
  constructor(private db: Database.Database) {}

  /**
   * Insert or update a project
   */
  upsert(project: Project): number {
    const stmt = this.db.prepare(`
      INSERT INTO projects (project_uuid, name, path, created_at, updated_at)
      VALUES (@projectUuid, @name, @path, @createdAt, @updatedAt)
      ON CONFLICT(project_uuid) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        updated_at = excluded.updated_at
      RETURNING id
    `);
    
    const result = stmt.get({
      projectUuid: project.projectUuid,
      name: project.name,
      path: project.path || null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }) as { id: number };
    
    return result.id;
  }

  /**
   * Get project by UUID
   */
  getByUuid(projectUuid: string): Project | undefined {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE project_uuid = ?');
    const row = stmt.get(projectUuid) as any;
    
    if (!row) return undefined;
    
    return this.mapRowToProject(row);
  }

  /**
   * List all projects with aggregated session info
   */
  listAll(): Array<{
    id: number;
    projectUuid: string;
    name: string;
    path?: string;
    sessionCount: number;
    providers: string[];
    updatedAt: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT p.id, p.project_uuid, p.name, p.path, p.updated_at, COUNT(s.id) as session_count,
             GROUP_CONCAT(DISTINCT s.provider) as providers
      FROM projects p
      LEFT JOIN sessions s ON p.id = s.project_id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `);

    return stmt.all().map((row: any) => ({
      id: row.id,
      projectUuid: row.project_uuid,
      name: row.name,
      path: row.path,
      sessionCount: row.session_count,
      providers: row.providers ? row.providers.split(',') : [],
      updatedAt: row.updated_at
    }));
  }

  /**
   * Get total count of projects
   */
  getCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM projects').get() as any;
    return result.count;
  }

  private mapRowToProject(row: any): Project {
    return {
      id: row.id,
      projectUuid: row.project_uuid,
      name: row.name,
      path: row.path,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
