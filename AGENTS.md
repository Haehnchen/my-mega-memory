# AGENTS.md

This file provides guidance when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript + copy templates & public assets to dist/
npm run dev            # Start dev server with ts-node (no build needed)
npm start              # Build + start production server on port 3000
npm test               # Run all Jest tests
npm run test:watch     # Run tests in watch mode
npx jest src/adapters/claude/__tests__/claude.test.ts  # Run a single test file
npm run clean          # Remove dist/
```

The build step (`tsc`) compiles to `dist/` and also copies `src/templates/` and `src/public/` since EJS templates and static assets aren't handled by TypeScript.

## Architecture

This is a TypeScript/Node.js application that imports AI coding assistant chat sessions from multiple providers into a SQLite database, then serves a web UI to browse them.

### Core Flow

1. **CLI** (`src/cli.ts`) — Commander.js with two subcommands: `serve` and `import`
2. **Import pipeline** (`src/adapters/importer.ts`) — `SessionImporter` orchestrates all provider adapters, groups sessions by project (extracted from `cwd`), and writes to SQLite via repositories
3. **Web server** (`src/command/serve.ts`, `src/app.ts`) — Express + EJS with layout system, routes through controllers

### Provider Adapter Pattern

Each provider (Claude Code, OpenCode, Codex, Amp, Junie) follows the same two-class pattern in `src/adapters/<provider>/index.ts`:

- **`*SessionFinder`** — Locates session files on disk (provider-specific paths like `~/.claude/projects/`, `~/.local/share/opencode/storage/`, etc.)
- **`*SessionParser`** — Parses raw files (JSONL or JSON) into the unified `SessionDetail` type

All adapters produce `SessionDetail` with `ParsedMessage[]`, which the importer converts to `RenderableMessage` for database storage.

### Data Layer

- **Database**: SQLite via `better-sqlite3`, stored at `var/sessions.db` (auto-created)
- **`DatabaseManager`** (`src/database.ts`) — Creates tables on first run, exposes repository instances
- **Repositories** (`src/repository/`) — `ProjectRepository`, `SessionRepository`, `MessageRepository` handle SQL queries
- Schema: `projects` → `sessions` → `messages` (foreign keys with CASCADE delete)
- Sessions are uniquely identified by `(project_id, session_id)` and upserted on re-import

### Type System

`src/types.ts` defines the unified type model (ported from a Kotlin codebase):
- `ParsedMessage` — Union type of 6 message kinds: `user`, `assistant_text`, `assistant_thinking`, `tool_use`, `tool_result`, `info`
- `RenderableMessage` — Database/UI card format with `cardType`, `content: MessageContent[]`, display metadata
- `MessageContent` — Union of `text`, `code`, `markdown`, `json`, `diff`, `html` blocks

### Web UI

- Express routes: `projectController` (`/`) and `sessionController` (`/sessions/...`)
- Templates in `src/templates/` using EJS with `express-ejs-layouts`
- Static assets in `src/public/` (CSS, provider icons)
- Session detail view converts `diff` blocks to HTML via `DiffBuilder` and markdown via `MarkdownConverter`

### Test Structure

Tests live in `src/adapters/<provider>/__tests__/` and `src/utils/__tests__/` with JSONL/JSON fixture files. Tests use `parseContent`/`parseFile` methods directly — no mocking of the filesystem.
