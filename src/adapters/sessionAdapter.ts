import { SessionDetail, SessionProvider } from '../types';

export interface SessionWithProject {
  session: SessionDetail;
  provider: SessionProvider;
  projectPath: string;
  projectName: string;
  title?: string;
  created: string;
  updated: string;
}

export interface SessionAdapter {
  readonly provider: SessionProvider;
  readonly label: string;
  getSessions(): Promise<SessionWithProject[]>;
}
