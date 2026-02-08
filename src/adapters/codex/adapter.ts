import { SessionProvider } from '../../types';
import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { CodexSessionFinder, CodexSessionParser } from './index';
import { extractProjectName } from '../../utils/project';
import { toDateTimeString } from '../../utils/time';

export class CodexAdapter implements SessionAdapter {
  readonly provider = SessionProvider.CODEX;
  readonly label = 'Codex';

  private finder: CodexSessionFinder;
  private parser: CodexSessionParser;

  constructor() {
    this.finder = new CodexSessionFinder();
    this.parser = new CodexSessionParser();
  }

  async getSessions(): Promise<SessionWithProject[]> {
    const sessions: SessionWithProject[] = [];
    const sessionInfos = this.finder.listSessions();

    for (const info of sessionInfos) {
      try {
        const session = this.parser.parseFile(info.filePath);
        if (session) {
          const projectPath = info.cwd || session.metadata?.cwd;

          if (!projectPath) {
            console.log(`Skipping Codex session ${session.sessionId}: no valid project path`);
            continue;
          }

          const projectName = extractProjectName(projectPath);

          if (!projectName) {
            console.log(`Skipping Codex session ${session.sessionId}: no valid project name`);
            continue;
          }

          sessions.push({
            session,
            provider: SessionProvider.CODEX,
            projectPath,
            projectName,
            created: toDateTimeString(info.created),
            updated: toDateTimeString(info.updated)
          });
        }
      } catch (e) {
        console.error(`Error parsing Codex session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }
}
