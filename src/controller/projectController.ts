import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../database';

const router = Router();

// Project list (home)
router.get('/', (req: Request, res: Response) => {
  const db: DatabaseManager = req.app.locals.db;
  const projects = db.projects.listAll();
  
  res.render('projects', {
    title: 'Projects - Mega Memory',
    projects,
    breadcrumbs: [
      { label: 'Projects', url: '/', active: true }
    ]
  });
});

export { router as projectController };
