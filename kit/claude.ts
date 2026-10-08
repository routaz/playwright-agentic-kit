// Running one of the agents headlessly through the Claude Code CLI, with the
// developer's own login. Shared by `npm run plan`, `generate` and `heal`.
// Settings (claudePath, model, maxTurns) come from heal.local.json.

import { existsSync } from 'node:fs';
import { CONFIG_FILE, type HealConfig } from './heal/config.ts';
import { failure, run } from './run.ts';

/** Exit with a helpful message unless Claude Code can be run; print which one is used. */
export function requireClaude(config: HealConfig): void {
  const version = run(config.claudePath, ['--version']);
  if (version.status !== 0) {
    console.error(
      `Can't run Claude Code at "${config.claudePath}" (${failure(version)}). Install it, or set "claudePath" in ${CONFIG_FILE}` +
        ` (see heal.local.example.json) or the HEAL_CLAUDE_PATH environment variable.`,
    );
    process.exit(2);
  }
  console.log(
    `Using Claude Code ${version.stdout.trim()}${existsSync(CONFIG_FILE) ? ` (settings: ${CONFIG_FILE})` : ''}`,
  );
}

export interface AgentRun {
  /** Name of the agent in .claude/agents/, e.g. e2e-planner. */
  agent: string;
  prompt: string;
  /** Tools the run may use without asking, e.g. `Read,Glob,mcp__playwright-test__*`. */
  tools: string;
  maxTurns: number;
  model?: string;
}

/**
 * Run the agent with its output streamed to the terminal. Returns the CLI's exit code.
 * The prompt goes in on stdin, never the command line, so on Windows it can't be
 * mangled by cmd.exe whatever it contains.
 */
export function runAgent(config: HealConfig, agent: AgentRun): number | null {
  const args = [
    '-p',
    '--agent',
    agent.agent,
    '--mcp-config',
    '.mcp.json',
    '--strict-mcp-config',
    '--allowedTools',
    agent.tools,
    '--max-turns',
    String(agent.maxTurns),
    ...(agent.model ? ['--model', agent.model] : []),
  ];
  return run(config.claudePath, args, { input: agent.prompt, stdio: ['pipe', 'inherit', 'inherit'] }).status;
}

/** `--max-turns` from the command line, else the configured value. */
export function maxTurnsFrom(flag: string | undefined, config: HealConfig): number {
  if (flag === undefined) return config.maxTurns;
  const n = Number(flag);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--max-turns must be a positive whole number, got "${flag}"`);
    process.exit(2);
  }
  return n;
}
