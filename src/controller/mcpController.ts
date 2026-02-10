import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DatabaseManager } from '../database';
import { SearchDatabase } from '../searchDatabase';
import { MessageContent, RenderableMessage } from '../types';

const MAX_SEARCH_LIMIT = 100;
const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SNIPPET_CHARS = 600;

const router = Router();
const transports = new Map<string, StreamableHTTPServerTransport>();

router.post('/', async (req: Request, res: Response) => {
  const db: DatabaseManager = req.app.locals.db;
  const searchDb: SearchDatabase = req.app.locals.searchDb;

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: req?.body?.id
        });
        return;
      }

      const server = createMcpServer(db, searchDb);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          transports.set(id, transport);
        },
        // Local-only server; disable for MCP Inspector compatibility.
        enableDnsRebindingProtection: false
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: req?.body?.id
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: req?.body?.id
      });
    }
  }
});

router.get('/', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: (req as any)?.body?.id
    });
    return;
  }

  try {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: (req as any)?.body?.id
      });
    }
  }
});

router.delete('/', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: (req as any)?.body?.id
    });
    return;
  }

  try {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: (req as any)?.body?.id
      });
    }
  }
});

function createMcpServer(db: DatabaseManager, searchDb: SearchDatabase): McpServer {
  const server = new McpServer({
    name: 'mega-memory',
    version: '1.0.0'
  });
  const registerTool = server.registerTool.bind(server) as any;

  registerTool(
    'search_sessions',
    {
      title: 'Search Sessions',
      description: 'Full-text search across sessions with snippets and relevance scores.',
      inputSchema: {
        query: z.string().describe('Search query'),
        project: z.string().optional().describe('Optional project UUID or project name'),
        limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional().describe('Max results to return'),
        offset: z.number().int().min(0).optional().describe('Result offset for pagination')
      }
    },
    async (args: any): Promise<CallToolResult> => {
      const query = String(args.query || '').trim();
      const projectArg = args.project ? String(args.project).trim() : '';
      const limit = clampInt(args.limit, 1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT);
      const offset = clampInt(args.offset, 0, MAX_SEARCH_LIMIT, 0);
      const safeLimit = Math.min(limit + offset, MAX_SEARCH_LIMIT);

      try {
        const projects = db.projects.listAll();
        const projectMatch = resolveProject(projectArg, projects);

        const rawResults = projectMatch
          ? searchDb.search.searchByProject(projectMatch.name, query, safeLimit)
          : searchDb.search.search(query, safeLimit);

        const grouped = new Map<
          string,
          {
            sessionId: string;
            sessionTitle: string;
            projectId: string;
            projectName: string;
            score: number;
            snippets: string[];
          }
        >();

        rawResults.forEach((result) => {
          let entry = grouped.get(result.sessionId);
          if (!entry) {
            entry = {
              sessionId: result.sessionId,
              sessionTitle: result.sessionTitle,
              projectId: result.projectId,
              projectName: result.projectName,
              score: result.score,
              snippets: []
            };
            grouped.set(result.sessionId, entry);
          }
          if (result.score > entry.score) {
            entry.score = result.score;
          }
          if (entry.snippets.length < 5) {
            entry.snippets.push(formatSnippet(result.content));
          }
        });

        const groupedResults = Array.from(grouped.values());
        const results = groupedResults.slice(offset, offset + limit);

        const payload = {
          query,
          project: projectMatch
            ? { projectUuid: projectMatch.projectUuid, name: projectMatch.name }
            : projectArg || null,
          limit,
          offset,
          total: groupedResults.length,
          results
        };

        return toJsonResult(payload);
      } catch (error: any) {
        const message =
          error?.message && String(error.message).includes('fts5')
            ? 'Invalid search query. Try simpler terms or use quotes for exact phrases.'
            : error?.message || 'Search error';
        return toTextResult(message, true);
      }
    }
  );

  registerTool(
    'get_session',
    {
      title: 'Get Session',
      description: 'Fetch a session with formatted message content.',
      inputSchema: {
        sessionId: z.string().describe('Session UUID')
      }
    },
    async (args: any): Promise<CallToolResult> => {
      const sessionId = String(args.sessionId || '').trim();
      if (!sessionId) {
        return toTextResult('Missing sessionId', true);
      }

      const session = db.sessions.getBySessionId(sessionId);
      if (!session || !session.id) {
        return toTextResult(`Session not found: ${sessionId}`, true);
      }

      const messages = db.messages.getBySessionId(session.id);
      const projects = db.projects.listAll();
      const project = projects.find((p) => p.id === Number(session.projectId));

      const formattedMessages = messages.map((msg) => ({
        sequence: msg.sequence,
        cardType: msg.cardType,
        title: msg.title,
        subtitle: msg.subtitle,
        timestamp: msg.timestamp,
        markdown: formatRenderableMessage(msg)
      }));

      const payload = {
        session: {
          sessionId: session.sessionId,
          title: session.title,
          provider: session.provider,
          version: session.version,
          gitBranch: session.gitBranch,
          cwd: session.cwd,
          models: session.modelsJson ? JSON.parse(session.modelsJson) : [],
          created: session.created,
          modified: session.modified,
          messageCount: session.messageCount
        },
        project: project
          ? {
              projectUuid: project.projectUuid,
              name: project.name,
              path: project.path
            }
          : null,
        messages: formattedMessages
      };

      return toJsonResult(payload);
    }
  );

  return server;
}

function formatRenderableMessage(message: RenderableMessage): string {
  const lines: string[] = [];
  const header = `[${message.sequence}] ${message.cardType}${message.title ? `: ${message.title}` : ''}`;
  lines.push(header);
  if (message.subtitle) {
    lines.push(message.subtitle);
  }

  message.content.forEach((block) => {
    lines.push(formatContentBlock(block));
  });

  return lines.filter(Boolean).join('\n\n');
}

function formatContentBlock(block: MessageContent): string {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'markdown':
      return block.markdown;
    case 'code': {
      const lang = block.language ? block.language : '';
      return `\`\`\`${lang}\n${block.code}\n\`\`\``;
    }
    case 'json':
      return `\`\`\`json\n${block.json}\n\`\`\``;
    case 'diff': {
      const header = block.filePath ? `# ${block.filePath}\n` : '';
      return `\`\`\`diff\n${header}${block.oldText}\n---\n${block.newText}\n\`\`\``;
    }
    case 'html':
      return `\`\`\`html\n${block.html}\n\`\`\``;
    default:
      return '';
  }
}

function formatSnippet(content: string): string {
  const withoutMarks = content.replace(/<mark>/g, '**').replace(/<\/mark>/g, '**');
  if (withoutMarks.length <= MAX_SNIPPET_CHARS) return withoutMarks;
  return `${withoutMarks.slice(0, MAX_SNIPPET_CHARS)}...`;
}

function resolveProject(
  projectArg: string,
  projects: Array<{ id: number; projectUuid: string; name: string }>
): { projectUuid: string; name: string } | null {
  if (!projectArg) return null;
  const byUuid = projects.find((project) => project.projectUuid === projectArg);
  if (byUuid) return { projectUuid: byUuid.projectUuid, name: byUuid.name };
  const byName = projects.find((project) => project.name === projectArg);
  if (byName) return { projectUuid: byName.projectUuid, name: byName.name };
  return null;
}

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function toJsonResult(payload: any): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function toTextResult(text: string, isError: boolean): CallToolResult {
  return {
    isError,
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
}

export const mcpController = router;
