import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { SessionProvider } from '../../types';
import { DroidSessionFinder, DroidSessionParser } from './index';

export class DroidAdapter implements SessionAdapter {
  readonly provider = SessionProvider.DROID;
  readonly label = 'Droid';

  private finder: DroidSessionFinder;
  private parser: DroidSessionParser;

  constructor() {
    this.finder = new DroidSessionFinder();
    this.parser = new DroidSessionParser();
  }

  async getSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.finder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.parser.parseFile(info.filePath);
        if (session) {
          sessions.push({
            session,
            provider: this.provider,
            projectPath: info.projectPath,
            projectName: info.projectName,
            created: info.created,
            updated: info.updated
          });
        }
      } catch (e) {
        console.error(`Error parsing Droid session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }
}
