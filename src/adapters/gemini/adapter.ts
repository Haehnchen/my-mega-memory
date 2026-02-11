import { SessionProvider } from '../../types';
import { SessionAdapter, SessionWithProject } from '../sessionAdapter';
import { GeminiSessionFinder, GeminiSessionParser } from './index';

export class GeminiAdapter implements SessionAdapter {
  readonly provider = SessionProvider.GEMINI;
  readonly label = 'Gemini';

  private finder: GeminiSessionFinder;
  private parser: GeminiSessionParser;

  constructor() {
    this.finder = new GeminiSessionFinder();
    this.parser = new GeminiSessionParser();
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
            provider: SessionProvider.GEMINI,
            projectPath: info.projectPath,
            projectName: info.projectName,
            created: info.created,
            updated: info.updated
          });
        }
      } catch (e) {
        console.error(`Error parsing Gemini session ${info.sessionId}:`, e);
      }
    }

    return sessions;
  }
}
