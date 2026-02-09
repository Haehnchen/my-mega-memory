import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../database';
import { DiffBuilder } from '../utils/diff';
import { MarkdownConverter } from '../utils/markdown';
import { MessageContent, RenderableMessage } from '../types';

const router = Router();

// Sessions for a project
router.get('/project/:projectUuid', (req: Request, res: Response) => {
  const db: DatabaseManager = req.app.locals.db;
  const projectUuid = req.params.projectUuid as string;

  if (!projectUuid) {
    return res.status(400).render('error', {
      title: 'Error',
      message: 'Invalid project ID',
      breadcrumbs: [{ label: 'Projects', url: '/' }]
    });
  }

  const project = db.projects.getByUuid(projectUuid);
  if (!project) {
    return res.status(404).render('error', {
      title: 'Error',
      message: 'Project not found',
      breadcrumbs: [{ label: 'Projects', url: '/' }]
    });
  }

  const sessions = project.id ? db.sessions.listByProjectId(project.id) : [];
  const projects = db.projects.listAll();

  res.render('sessions', {
    title: `${project.name} - Sessions`,
    projects,
    project: {
      id: project.id!,
      projectUuid: project.projectUuid,
      name: project.name,
      path: project.path
    },
    sessions: sessions || [],
    activeProjectUuid: project.projectUuid,
    breadcrumbs: [
      { label: 'Projects', url: '/' },
      { label: project.name, url: `/sessions/project/${projectUuid}`, active: true }
    ]
  });
});

// Session detail
router.get('/:sessionId', (req: Request, res: Response) => {
  const db: DatabaseManager = req.app.locals.db;
  const sessionId = req.params.sessionId as string;

  if (!sessionId) {
    return res.status(400).render('error', {
      title: 'Error',
      message: 'Invalid session ID',
      breadcrumbs: [{ label: 'Projects', url: '/' }]
    });
  }

  const session = db.sessions.getBySessionId(sessionId);
  if (!session || !session.id) {
    return res.status(404).render('error', {
      title: 'Error',
      message: 'Session not found',
      breadcrumbs: [{ label: 'Projects', url: '/' }]
    });
  }

  const messages = db.messages.getBySessionId(session.id);
  const projects = db.projects.listAll();
  const project = projects.find((p: { id: number }) => p.id === Number(session.projectId));
  const sessions = session.projectId ? db.sessions.listByProjectId(Number(session.projectId)) : [];

  // Process messages to convert diff blocks and markdown to HTML
  const processedMessages = messages.map((msg: RenderableMessage) => ({
    ...msg,
    content: msg.content.map((block: MessageContent) => {
      if (block.type === 'diff') {
        return {
          type: 'html' as const,
          html: DiffBuilder.generateDiffView(block.oldText, block.newText)
        };
      }
      if (block.type === 'markdown' && block.markdown) {
        // Convert markdown to HTML
        const html = MarkdownConverter.toHtml(block.markdown);
        return {
          type: 'html' as const,
          html
        };
      }
      return block;
    })
  }));

  res.render('session-detail', {
    title: `${session.title} - Session Detail`,
    projects,
    sessions,
    session: {
      id: session.id,
      projectId: session.projectId,
      sessionId: session.sessionId,
      title: session.title,
      provider: session.provider,
      version: session.version,
      gitBranch: session.gitBranch,
      cwd: session.cwd,
      models: session.modelsJson ? JSON.parse(session.modelsJson) : [],
      created: session.created,
      modified: session.modified,
      messageCount: session.messageCount
    },
    messages: processedMessages,
    project,
    activeProjectUuid: project?.projectUuid,
    activeSessionId: session.sessionId,
    breadcrumbs: [
      { label: 'Projects', url: '/' },
      { label: project?.name || 'Unknown', url: `/sessions/project/${project?.projectUuid || session.projectId}` },
      { label: session.title.slice(0, 30) + (session.title.length > 30 ? '...' : ''), url: `/sessions/${sessionId}`, active: true }
    ]
  });
});

export { router as sessionController };
