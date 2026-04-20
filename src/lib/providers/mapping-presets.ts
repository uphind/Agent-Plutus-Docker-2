/**
 * Endpoint-aware mapping preset registry.
 *
 * Where the existing field-definitions.ts holds a single "default mapping"
 * per provider, this registry holds multiple presets per provider — one per
 * Discovery endpoint shape. The mapping modal renders these as a dropdown
 * above the target column so the user can:
 *
 *   1. Auto-apply a sensible mapping for whichever endpoint they discovered.
 *   2. Switch presets to mirror a different endpoint's response shape.
 *
 * Source field keys here intentionally match the leaf-name format the
 * adapters expect (see field-definitions.ts), so saved mappings remain
 * wire-compatible with the existing sync logic.
 */

import {
  ANTHROPIC_DEFAULTS,
  ANTHROPIC_ANALYTICS_DEFAULTS,
  ANTHROPIC_COMPLIANCE_DEFAULTS,
  CURSOR_DEFAULTS,
  GEMINI_DEFAULTS,
  OPENAI_DEFAULTS,
  VERTEX_DEFAULTS,
  type DefaultMapping,
} from "./field-definitions";

export interface MappingPreset {
  /** Stable identifier used in the dropdown's value. */
  id: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
  /** Short description shown under the dropdown when this preset is active. */
  description?: string;
  /**
   * Discovery endpoint ids this preset is the natural fit for. The first
   * preset whose `endpointMatch` includes the active endpoint id is auto-
   * selected when the modal is opened from Discovery.
   */
  endpointMatch: string[];
  /** Source -> target mappings to apply when this preset is selected. */
  mappings: DefaultMapping[];
}

const ANTHROPIC_PRESETS: MappingPreset[] = [
  {
    id: "anthropic.messages_usage",
    label: "Messages Usage Report",
    description: "Token usage by model / workspace / API key from the Admin Usage endpoint.",
    endpointMatch: ["anthropic.admin.usage_messages", "anthropic.admin.usage_messages_grouped"],
    mappings: [
      { sourceField: "starting_at",                              targetField: "date" },
      { sourceField: "api_key_id",                               targetField: "userRef" },
      { sourceField: "model",                                    targetField: "model" },
      { sourceField: "uncached_input_tokens",                    targetField: "inputTokens" },
      { sourceField: "output_tokens",                            targetField: "outputTokens" },
      { sourceField: "cache_read_input_tokens",                  targetField: "cachedTokens" },
    ],
  },
  {
    id: "anthropic.cost_report",
    label: "Cost Report",
    description: "Cost in USD per bucket grouped by model / token type.",
    endpointMatch: ["anthropic.admin.cost_report", "anthropic.admin.cost_summary"],
    mappings: [
      { sourceField: "starting_at",  targetField: "date" },
      { sourceField: "model",        targetField: "model" },
      { sourceField: "amount",       targetField: "costUsd" },
    ],
  },
  {
    id: "anthropic.claude_code_analytics",
    label: "Claude Code Analytics",
    description: "Per-actor coding activity (sessions, commits, tool actions).",
    endpointMatch: ["anthropic.admin.claude_code_analytics"],
    mappings: [
      { sourceField: "date",                                  targetField: "date" },
      { sourceField: "actor.email_address",                   targetField: "userRef" },
      { sourceField: "core_metrics.num_sessions",             targetField: "requestsCount" },
      { sourceField: "tool_actions.total_accepted",           targetField: "linesAccepted" },
      { sourceField: "tool_actions.total_actions",            targetField: "linesSuggested" },
    ],
  },
  {
    id: "anthropic.legacy_combined",
    label: "Legacy combined",
    description: "Original union of usage + cost + Claude Code fields.",
    endpointMatch: [],
    mappings: ANTHROPIC_DEFAULTS,
  },
];

const ANTHROPIC_COMPLIANCE_PRESETS: MappingPreset[] = [
  {
    id: "anthropic_compliance.audit_logs",
    label: "Audit Logs",
    description: "Per-event audit log identifying actor + activity type.",
    endpointMatch: ["anthropic.compliance.audit_logs"],
    mappings: [
      { sourceField: "actor.email_address", targetField: "userRef" },
      { sourceField: "created_at",          targetField: "date" },
    ],
  },
  {
    id: "anthropic_compliance.legacy",
    label: "Legacy default",
    description: "Original mapping (userRef only).",
    endpointMatch: [],
    mappings: ANTHROPIC_COMPLIANCE_DEFAULTS,
  },
];

const ANTHROPIC_ANALYTICS_PRESETS: MappingPreset[] = [
  {
    id: "anthropic_analytics.claude_code_engagement",
    label: "Per-User Engagement",
    description: "Daily per-user Claude Code / Chat / Office engagement.",
    endpointMatch: ["anthropic.analytics.claude_code_engagement"],
    mappings: ANTHROPIC_ANALYTICS_DEFAULTS,
  },
];

const OPENAI_PRESETS: MappingPreset[] = [
  {
    id: "openai.usage_completions",
    label: "Usage · Completions",
    description: "Per-bucket completions usage (tokens, requests).",
    endpointMatch: ["openai.org.usage.completions"],
    mappings: [
      { sourceField: "user_id",             targetField: "userRef" },
      { sourceField: "model",               targetField: "model" },
      { sourceField: "input_tokens",        targetField: "inputTokens" },
      { sourceField: "output_tokens",       targetField: "outputTokens" },
      { sourceField: "input_cached_tokens", targetField: "cachedTokens" },
      { sourceField: "num_model_requests",  targetField: "requestsCount" },
      { sourceField: "api_key_id",          targetField: "apiKeyId" },
      { sourceField: "batch",               targetField: "isBatch" },
    ],
  },
  {
    id: "openai.usage_audio",
    label: "Usage · Audio (Speech / Transcription)",
    endpointMatch: ["openai.org.usage.audio_speeches", "openai.org.usage.audio_transcriptions"],
    mappings: [
      { sourceField: "user_id",             targetField: "userRef" },
      { sourceField: "model",               targetField: "model" },
      { sourceField: "input_audio_tokens",  targetField: "inputAudioTokens" },
      { sourceField: "output_audio_tokens", targetField: "outputAudioTokens" },
      { sourceField: "num_model_requests",  targetField: "requestsCount" },
    ],
  },
  {
    id: "openai.costs",
    label: "Costs",
    description: "Bucketed cost data in USD.",
    endpointMatch: ["openai.org.costs"],
    mappings: [
      { sourceField: "model",  targetField: "model" },
      { sourceField: "amount", targetField: "costUsd" },
    ],
  },
  {
    id: "openai.legacy_combined",
    label: "Legacy combined",
    endpointMatch: [],
    mappings: OPENAI_DEFAULTS,
  },
];

const CURSOR_PRESETS: MappingPreset[] = [
  {
    id: "cursor.daily_usage",
    label: "Daily Usage Data",
    description: "Per-user daily activity, requests, and lines added/accepted.",
    endpointMatch: ["cursor.admin.daily_usage"],
    mappings: [
      { sourceField: "email",                    targetField: "userRef" },
      { sourceField: "mostUsedModel",           targetField: "model" },
      { sourceField: "acceptedLinesAdded",      targetField: "linesAccepted" },
      { sourceField: "totalLinesAdded",         targetField: "linesSuggested" },
      { sourceField: "subscriptionIncludedReqs",targetField: "requestsCount" },
    ],
  },
  {
    id: "cursor.spend",
    label: "Spend",
    description: "Per-member spend in USD cents.",
    endpointMatch: ["cursor.admin.spend"],
    mappings: [
      { sourceField: "email",                  targetField: "userRef" },
      { sourceField: "spend.spendCents",       targetField: "costUsd" },
      { sourceField: "spend.fastPremiumRequests", targetField: "requestsCount" },
    ],
  },
  {
    id: "cursor.legacy_combined",
    label: "Legacy combined",
    endpointMatch: [],
    mappings: CURSOR_DEFAULTS,
  },
];

const GEMINI_PRESETS: MappingPreset[] = [
  {
    id: "gemini.legacy",
    label: "Default",
    endpointMatch: [],
    mappings: GEMINI_DEFAULTS,
  },
];

const VERTEX_PRESETS: MappingPreset[] = [
  {
    id: "vertex.legacy",
    label: "Default",
    endpointMatch: [],
    mappings: VERTEX_DEFAULTS,
  },
];

export const MAPPING_PRESETS: Record<string, MappingPreset[]> = {
  anthropic:            ANTHROPIC_PRESETS,
  anthropic_compliance: ANTHROPIC_COMPLIANCE_PRESETS,
  anthropic_analytics:  ANTHROPIC_ANALYTICS_PRESETS,
  openai:               OPENAI_PRESETS,
  cursor:               CURSOR_PRESETS,
  gemini:               GEMINI_PRESETS,
  vertex:               VERTEX_PRESETS,
};

export function getPresetsForProvider(provider: string): MappingPreset[] {
  return MAPPING_PRESETS[provider] ?? [];
}

/**
 * Returns the preset that best matches the given Discovery endpoint id.
 * Falls back to the provider's first preset when nothing matches, or null
 * when the provider has no presets at all.
 */
export function getPresetForEndpoint(
  provider: string,
  endpointId: string | undefined
): MappingPreset | null {
  const presets = getPresetsForProvider(provider);
  if (presets.length === 0) return null;
  if (endpointId) {
    const match = presets.find((p) => p.endpointMatch.includes(endpointId));
    if (match) return match;
  }
  return presets[0];
}
