# My Mega Memory

AI Chat Session Importer and Viewer

Import your AI chat sessions into a local database, then browse and search them through a web interface.

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

## Screenshots

![My Mega Memory screenshot](docs/my-mega-memory.webp)
![My Mega Memory screenshot](docs/my-mega-memory_1.webp)