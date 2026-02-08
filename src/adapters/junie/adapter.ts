import { SessionProvider } from '../../types';
import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { JunieSessionFinder, JunieSessionParser } from './index';
import { extractProjectName } from '../../utils/project';
import { toDateTimeString } from '../../utils/time';

export class JunieAdapter implements SessionAdapter {
  readonly provider = SessionProvider.JUNIE;
  readonly label = 'Junie';

  private finder: JunieSessionFinder;
  private parser: JunieSessionParser;

  constructor() {
    this.finder = new JunieSessionFinder();
    this.parser = new JunieSessionParser();
  }

  async getSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.finder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.parser.parseFile(info.filePath);
        if (session) {
          const projectPath = info.projectPath || session.metadata?.cwd;

          if (!projectPath) {
            console.log(`Skipping Junie session ${session.sessionId}: no valid project path`);
            continue;
          }

          const projectName = extractProjectName(projectPath);

          if (!projectName) {
            console.log(`Skipping Junie session ${session.sessionId}: no valid project path`);
            continue;
          }

          sessions.push({
            session,
            provider: SessionProvider.JUNIE,
            projectPath,
            projectName,
            title: info.title,
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated),
          });
        }
      } catch (e) {
        console.error(`Error parsing Junie session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }
}
