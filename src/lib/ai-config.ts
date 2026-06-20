/**
 * Centralized Anthropic API configuration.
 *
 * When Anthropic retires a model, update ANTHROPIC_MODEL here.
 * All API routes import from this file — one change covers the whole app.
 *
 * Current model: claude-sonnet-4-6 (replaces retired claude-sonnet-4-20250514)
 * Anthropic deprecation schedule: ~60–90 days; watch platform.claude.com/docs/en/about-claude/model-deprecations
 */

export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
export const ANTHROPIC_VERSION = "2023-06-01";
