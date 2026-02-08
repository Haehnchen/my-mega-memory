import express from 'express';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';
import { DatabaseManager } from './database';

const app = express();
const port = process.env.PORT || 3000;

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

// Express EJS Layouts
app.use(expressLayouts);
app.set('layout', 'layout');

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
const db = new DatabaseManager();

// Make db available to routes
app.locals.db = db;

// Routes
import { projectController } from './controller/projectController';
import { sessionController } from './controller/sessionController';

app.use('/', projectController);
app.use('/sessions', sessionController);

// Error handler
app.use((err: any, req: express.Request, res: express.Response) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    title: 'Error',
    message: 'Something went wrong!',
    breadcrumbs: [{ label: 'Projects', url: '/' }],
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).render('error', {
    title: 'Not Found',
    message: 'Page not found',
    breadcrumbs: [{ label: 'Projects', url: '/' }]
  });
});

app.listen(port, () => {
  console.log(`Mega Memory Server running at http://localhost:${port}`);
  console.log(`Database: sessions.db`);
});

export { db };
