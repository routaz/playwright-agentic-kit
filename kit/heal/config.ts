// Per-developer settings for `npm run heal`, read from heal.local.json (git-ignored).
// Each developer heals with their own signed-in Claude Code, so no shared token is needed.

import { existsSync, readFileSync } from 'node:fs';

export interface HealConfig {
  /** Path to the Claude Code CLI. */
  claudePath: string;
  /** Model for the healer, e.g. "sonnet" or "haiku". Empty = the agent file's default. */
  model: string;
  /** Hard stop on agent turns, to cap usage. */
  maxTurns: number;
  /** What to do with repairs that pass the guard: leave them for review, or commit them. */
  afterHeal: 'leave' | 'commit';
  /** Open GitHub issues for app bugs and stale context, with your own `gh` login. */
  reportIssues: boolean;
}

export const DEFAULTS: HealConfig = {
  claudePath: 'claude',
  model: '',
  maxTurns: 40,
  afterHeal: 'leave',
  reportIssues: false,
};

export const CONFIG_FILE = 'heal.local.json';

export function loadConfig(path = CONFIG_FILE): HealConfig {
  const file = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const config = { ...DEFAULTS, ...file };
  if (process.env.HEAL_CLAUDE_PATH) config.claudePath = process.env.HEAL_CLAUDE_PATH;

  if (!['leave', 'commit'].includes(config.afterHeal)) {
    throw new Error(`${path}: afterHeal must be "leave" or "commit", got "${config.afterHeal}"`);
  }
  if (!Number.isInteger(config.maxTurns) || config.maxTurns < 1) {
    throw new Error(`${path}: maxTurns must be a positive whole number`);
  }
  return config;
}
