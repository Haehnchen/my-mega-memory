import * as fs from 'fs';
import { SessionProvider } from '../../types';
import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { extractProjectName } from '../../utils/project';
import { toDateTimeString } from '../../utils/time';
import { ClaudeSessionFinder, ClaudeSessionParser } from './index';

export class ClaudeSessionAdapter implements SessionAdapter {
  readonly provider = SessionProvider.CLAUDE_CODE;
  readonly label = 'Claude Code';

  private finder: ClaudeSessionFinder;
  private parser: ClaudeSessionParser;

  constructor() {
    this.finder = new ClaudeSessionFinder();
    this.parser = new ClaudeSessionParser();
  }

  async getSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const files = this.finder.listSessionFiles();

    for (const { filePath, projectName } of files) {
      try {
        const session = this.parser.parseFile(filePath);
        if (session) {
          const projectPath = session.metadata?.cwd || projectName;
          const extractedProjectName = extractProjectName(projectPath);

          if (!extractedProjectName) {
            console.log(`Skipping Claude session ${session.sessionId}: no valid project path`);
            continue;
          }

          const stats = fs.statSync(filePath);

          sessions.push({
            session,
            provider: SessionProvider.CLAUDE_CODE,
            projectPath,
            projectName: extractedProjectName,
            created: toDateTimeString(stats.birthtimeMs),
            updated: toDateTimeString(stats.mtimeMs)
          });
        }
      } catch (e) {
        console.error(`Error parsing Claude session file ${filePath}:`, e);
      }
    }

    return sessions;
  }
}
