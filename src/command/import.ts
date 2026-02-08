import { Command } from 'commander';
import { SessionImporter } from '../adapters/importer';

export const importCommand = new Command('import')
  .description('Import AI chat sessions from various sources')
  .action(async () => {
    console.log('=================================');
    console.log('  AI Session Importer');
    console.log('  (Auto-detects projects)');
    console.log('=================================\n');

    const importer = new SessionImporter();

    try {
      await importer.importAll();
      importer.vacuum();
      importer.optimizeSearch();
      console.log('\nImport completed successfully!');
    } catch (error) {
      console.error('\nImport failed:', error);
      process.exit(1);
    } finally {
      importer.close();
    }
  });
