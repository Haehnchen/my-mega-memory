import { Command } from 'commander';
import { DatabaseManager } from '../database';
import { SearchDatabase } from '../searchDatabase';

export const createDatabaseCommand = new Command('create-database')
  .description('Create fresh databases, dropping all existing data if present')
  .action(() => {
    console.log('Creating databases...\n');

    const db = new DatabaseManager();
    const searchDb = new SearchDatabase();

    db.resetTables();
    console.log('  Sessions database created');

    searchDb.resetTables();
    console.log('  Search database created');

    db.vacuum();
    searchDb.vacuum();

    db.close();
    searchDb.close();

    console.log('\nDatabases created successfully.');
  });
