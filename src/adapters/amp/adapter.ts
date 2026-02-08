import { SessionProvider } from '../../types';
import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { AmpSessionFinder, AmpSessionParser } from './index';
import { extractProjectName } from '../../utils/project';
import { toDateTimeString } from '../../utils/time';

export class AmpAdapter implements SessionAdapter {
  readonly provider = SessionProvider.AMP;
  readonly label = 'Amp';

  private readonly finder: AmpSessionFinder;
  private readonly parser: AmpSessionParser;

  constructor() {
    this.finder = new AmpSessionFinder();
    this.parser = new AmpSessionParser();
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
            console.log(`Skipping Amp session ${session.sessionId}: no valid project path`);
            continue;
          }

          const extractedProjectName = extractProjectName(projectPath);

          if (!extractedProjectName) {
            console.log(`Skipping Amp session ${session.sessionId}: no valid project name`);
            continue;
          }

          sessions.push({
            session,
            provider: SessionProvider.AMP,
            projectPath: projectPath as string,
            projectName: extractedProjectName as string,
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated)
          });
        }
      } catch (e) {
        console.error(`Error parsing Amp session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }
}
