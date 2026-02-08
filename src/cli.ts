#!/usr/bin/env node

import { Command } from 'commander';
import { serveCommand } from './command/serve';
import { importCommand } from './command/import';
const program = new Command();

program
  .name('mega-memory')
  .description('AI Session Manager - Import, query, and serve AI chat sessions')
  .version('1.0.0');

program.addCommand(serveCommand);
program.addCommand(importCommand);

program.parse();
