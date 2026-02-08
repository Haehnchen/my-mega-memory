import {Command} from 'commander';
import express from 'express';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';
import {DatabaseManager} from '../database';
import {SearchDatabase} from '../searchDatabase';
import {projectController} from '../controller/projectController';
import {sessionController} from '../controller/sessionController';
import {searchController} from '../controller/searchController';

export const serveCommand = new Command('serve')
  .description('Start the web server to view sessions')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .action((options) => {
    const port = parseInt(options.port, 10);
    
    const app = express();
    
    // Setup EJS
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'templates'));
    
    // Express EJS Layouts
    app.use(expressLayouts);
    app.set('layout', 'layout');
    
    // Static files
    app.use(express.static(path.join(__dirname, '..', 'public')));
    
    // Initialize databases
    app.locals.db = new DatabaseManager();
    app.locals.searchDb = new SearchDatabase();

    // Routes
    app.use('/', projectController);
    app.use('/sessions', sessionController);
    app.use('/search', searchController);
    
    // Error handler
    app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
    
    const server = app.listen(port, () => {
      console.log(`Mega Memory Server running at http://localhost:${port}`);
    });
    
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Error: Port ${port} is already in use`);
      } else {
        console.error(`Server error:`, err.message);
      }
      process.exit(1);
    });
  });
