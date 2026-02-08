import { SessionProvider } from '../../types';
import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { OpenCodeSessionFinder, OpenCodeSessionParser } from './index';
import { extractProjectName } from '../../utils/project';
import { toDateTimeString } from '../../utils/time';

export class OpenCodeAdapter implements SessionAdapter {
  readonly provider = SessionProvider.OPENCODE;
  readonly label = 'OpenCode';

  private finder: OpenCodeSessionFinder;
  private parser: OpenCodeSessionParser;

  constructor() {
    this.finder = new OpenCodeSessionFinder();
    this.parser = new OpenCodeSessionParser();
  }

  async getSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.finder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.parser.parseSession(info.sessionId);
        if (session) {
          const projectName = extractProjectName(info.projectPath);

          if (!projectName || !info.projectPath) {
            console.log(`Skipping OpenCode session ${session.sessionId}: no valid project path`);
            continue;
          }

          sessions.push({
            session,
            provider: SessionProvider.OPENCODE,
            projectPath: info.projectPath,
            projectName,
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated)
          });
        }
      } catch (e) {
        console.error(`Error parsing OpenCode session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }
}
