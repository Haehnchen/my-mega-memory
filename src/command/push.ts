import { Command } from 'commander';
import { SessionAdapter } from '../adapters/sessionAdapter';
import { ClaudeSessionAdapter } from '../adapters/claude/adapter';
import { OpenCodeAdapter } from '../adapters/opencode/adapter';
import { CodexAdapter } from '../adapters/codex/adapter';
import { AmpAdapter } from '../adapters/amp/adapter';
import { JunieAdapter } from '../adapters/junie/adapter';

function createDefaultAdapters(): SessionAdapter[] {
  return [
    new ClaudeSessionAdapter(),
    new OpenCodeAdapter(),
    new CodexAdapter(),
    new AmpAdapter(),
    new JunieAdapter(),
  ];
}

export const pushCommand = new Command('push')
  .description('Push all sessions to a remote Mega Memory server via API')
  .option('-u, --url <url>', 'Server base URL', 'http://localhost:3000')
  .action(async (options) => {
    const baseUrl = options.url.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/api/import/session`;

    console.log(`Pushing sessions to ${baseUrl}\n`);

    const adapters = createDefaultAdapters();
    let pushed = 0;
    let skipped = 0;
    let errors = 0;

    for (const adapter of adapters) {
      console.log(`Scanning ${adapter.label} sessions...`);
      const sessions = await adapter.getSessions();
      console.log(`Found ${sessions.length} ${adapter.label} sessions`);

      for (const session of sessions) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(session),
          });

          if (res.ok) {
            pushed++;
          } else {
            const body = await res.json().catch(() => ({})) as Record<string, string>;
            console.error(`  Failed ${session.session.sessionId}: ${res.status} ${body.error || ''}`);
            errors++;
          }
        } catch (e: any) {
          console.error(`  Error pushing ${session.session.sessionId}: ${e.message}`);
          errors++;
        }
      }
    }

    console.log(`\n=================================`);
    console.log(`Push complete!`);
    console.log(`  Pushed: ${pushed}`);
    if (skipped > 0) console.log(`  Skipped: ${skipped}`);
    if (errors > 0) console.log(`  Errors: ${errors}`);
    console.log(`=================================`);
  });
