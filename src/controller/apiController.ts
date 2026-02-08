import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../database';
import { SearchDatabase } from '../searchDatabase';
import { SessionImporter } from '../adapters/importer';

const router = Router();

router.post('/import/session', (req: Request, res: Response) => {
  const db: DatabaseManager = req.app.locals.db;
  const searchDb: SearchDatabase = req.app.locals.searchDb;

  try {
    const sessionWithProject = req.body;

    if (!sessionWithProject?.session?.sessionId) {
      return res.status(400).json({ error: 'Missing session data' });
    }
    if (!sessionWithProject.projectName) {
      return res.status(400).json({ error: 'Missing projectName' });
    }
    if (!sessionWithProject.projectPath || sessionWithProject.projectPath === 'unknown') {
      return res.status(400).json({ error: 'Missing or invalid projectPath' });
    }
    if (!sessionWithProject.provider) {
      return res.status(400).json({ error: 'Missing provider' });
    }

    const importer = new SessionImporter([], db, searchDb);
    importer.importSingleSession(sessionWithProject);
    importer.close();

    res.json({
      ok: true,
      sessionId: sessionWithProject.session.sessionId,
      projectName: sessionWithProject.projectName,
    });
  } catch (e: any) {
    console.error('Error importing session via API:', e);
    res.status(500).json({ error: e.message || 'Import failed' });
  }
});

export const apiController = router;
