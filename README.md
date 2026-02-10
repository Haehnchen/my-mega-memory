# My Mega Memory

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/Haehnchen/my-mega-memory)

AI Chat Session Importer and Viewer

Import your AI chat sessions into a local database, then browse and search them through a web interface or via MCP tools.

## Supported Providers

| Provider | Session Storage Location |
|----------|-------------------------|
| **Claude Code** | `~/.claude/projects/` |
| **OpenCode** | `~/.local/share/opencode/storage/` |
| **Codex** (IntelliJ) | `~/.cache/JetBrains/*/aia/codex/sessions/` |
| **Codex** (CLI) | `~/.codex/sessions/` |
| **Amp** | `~/.local/share/amp/threads/` |
| **Junie** | `~/.junie/sessions/` |

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Database** | SQLite (better-sqlite3) | Local storage for sessions and messages |
| **Search** | SQLite FTS5 (trigram tokenizer) | Full-text search with BM25 ranking |
| **Backend** | Node.js + TypeScript + Express 5 | Server and CLI application |
| **Templates** | EJS + express-ejs-layouts | Server-side rendering |
| **Styling** | Tailwind CSS v4 (CDN) | Utility-first CSS framework |

## Quick Start

```bash
# Install dependencies
npm install

# Import your chat sessions
npm run import

# Start the web viewer
npm run dev
```

### npx

```
npx my-mega-memory import
npx my-mega-memory serve
```

Then open http://localhost:3000 to browse your sessions.

## Create Database

Create fresh databases, dropping all existing data if present:

```bash
# npm
npm run create-database

# npx
npx my-mega-memory create-database
```

## Remote Push

You can push sessions from any machine to a running Mega Memory server via API, instead of importing locally.

```bash
# npm
npm run push -- --url http://your-server:3000

# npx
npx my-mega-memory push --url http://your-server:3000
```

This scans all providers locally and sends each session to the server's `POST /api/import/session` endpoint. The `--url` flag defaults to `http://localhost:3000`.

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/import/session` | Import a single session. Expects a JSON body with `session`, `provider`, `projectPath`, `projectName`, `created`, and `updated` fields. |
| `POST` | `/api/mcp` | MCP endpoint (Streamable HTTP) with tools: `search_sessions`, `get_session`. |
| `GET` | `/api/mcp` | Streamable HTTP session channel (used by MCP clients). |
| `DELETE` | `/api/mcp` | Close a Streamable HTTP MCP session. |

The MCP endpoint uses Streamable HTTP over JSON-RPC.

## Screenshots

![My Mega Memory screenshot](docs/my-mega-memory.webp)
![My Mega Memory screenshot](docs/my-mega-memory_1.webp)
