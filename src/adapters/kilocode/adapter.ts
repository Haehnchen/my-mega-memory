import * as fs from 'fs';
import { SessionProvider } from '../../types';
import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { extractProjectName } from '../../utils/project';
import { toDateTimeString } from '../../utils/time';
import { KiloSessionFinder, KiloSessionParser } from './index';

export class KiloSessionAdapter implements SessionAdapter {
  readonly provider = SessionProvider.KILO_CODE;
  readonly label = 'Kilo CLI';

  private finder: KiloSessionFinder;
  private parser: KiloSessionParser;

  constructor() {
    this.finder = new KiloSessionFinder();
    this.parser = new KiloSessionParser();
  }

  async getSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const taskInfos = this.finder.listSessionFiles();

    for (const { taskPath, taskId, sessionId, projectPath } of taskInfos) {
      try {
        const session = this.parser.parseSession(taskPath, sessionId);
        if (session) {
          const projectName = extractProjectName(projectPath);

          if (!projectName) {
            console.log(`Skipping Kilo session ${session.sessionId}: could not extract project name from ${projectPath}`);
            continue;
          }

          // Get timestamps from the session files
          let created = toDateTimeString(Date.now());
          let updated = toDateTimeString(Date.now());
          
          try {
            const stats = fs.statSync(taskPath);
            created = toDateTimeString(stats.birthtimeMs);
            updated = toDateTimeString(stats.mtimeMs);
          } catch (e) {
            // Use default timestamps if stat fails
          }

          sessions.push({
            session,
            provider: SessionProvider.KILO_CODE,
            projectPath,
            projectName,
            title: session.title,
            created,
            updated
          });
        }
      } catch (e) {
        console.error(`Error parsing Kilo session ${taskId}:`, e);
      }
    }

    return sessions;
  }
}
