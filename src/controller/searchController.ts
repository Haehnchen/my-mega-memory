import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../database';
import { SearchDatabase } from '../searchDatabase';
import { SearchResult } from '../repository/SearchRepository';

const router = Router();

interface GroupedResult {
  sessionId: string;
  sessionTitle: string;
  projectName: string;
  matches: SearchResult[];
}

router.get('/', (req: Request, res: Response) => {
  const query = (req.query.q as string || '').trim();
  const projectId = (req.query.project as string || '').trim();
  const db: DatabaseManager = req.app.locals.db;
  const searchDb: SearchDatabase = req.app.locals.searchDb;

  const projects = db.projects.listAll();

  let results: SearchResult[] = [];
  let error: string | undefined;

  if (query) {
    try {
      const selectedProject = projectId ? projects.find((p: { projectUuid: string }) => p.projectUuid === projectId) : undefined;
      if (selectedProject) {
        results = searchDb.search.searchByProject(selectedProject.name, query);
      } else {
        results = searchDb.search.search(query);
      }
    } catch (e: any) {
      if (e.message && e.message.includes('fts5')) {
        error = 'Invalid search query. Try simpler terms or use quotes for exact phrases.';
      } else {
        error = 'Search error. Please try a different query.';
      }
    }
  }

  // Group results by session
  const grouped: GroupedResult[] = [];
  const sessionMap = new Map<string, GroupedResult>();

  for (const result of results) {
    let group = sessionMap.get(result.sessionId);
    if (!group) {
      group = {
        sessionId: result.sessionId,
        sessionTitle: result.sessionTitle,
        projectName: result.projectName,
        matches: [],
      };
      sessionMap.set(result.sessionId, group);
      grouped.push(group);
    }
    group.matches.push(result);
  }

  res.render('search', {
    title: 'Search - Mega Memory',
    query,
    projectId,
    projects,
    grouped,
    totalResults: results.length,
    error,
    breadcrumbs: [
      { label: 'Projects', url: '/' },
      { label: 'Search', url: '/search', active: true },
    ],
  });
});

export { router as searchController };
