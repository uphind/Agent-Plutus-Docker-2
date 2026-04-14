/**
 * Static definitions of source fields exposed by each provider's API
 * and the target fields they map to in NormalizedUsageRecord.
 *
 * Used by the field-mapping UI so users can visually configure
 * which raw provider fields feed into which internal columns.
 */

export interface FieldDef {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
}

export interface DefaultMapping {
  sourceField: string;
  targetField: string;
}

// ---------------------------------------------------------------------------
// Target fields (NormalizedUsageRecord columns)
// ---------------------------------------------------------------------------

export const TARGET_FIELDS: FieldDef[] = [
  { key: "userRef",           label: "User Reference",     required: true,  description: "Identifier used to link usage to a directory user (email, user_id, etc.)" },
  { key: "model",             label: "Model",              required: true,  description: "Name of the AI model used" },
  { key: "date",              label: "Date",               required: true,  description: "Day the usage occurred" },
  { key: "inputTokens",       label: "Input Tokens",       required: false, description: "Number of input (prompt) tokens" },
  { key: "outputTokens",      label: "Output Tokens",      required: false, description: "Number of output (completion) tokens" },
  { key: "cachedTokens",      label: "Cached Tokens",      required: false, description: "Tokens served from cache" },
  { key: "requestsCount",     label: "Request Count",      required: false, description: "Number of API requests" },
  { key: "costUsd",           label: "Cost (USD)",         required: false, description: "Dollar cost for the period" },
  { key: "apiKeyId",          label: "API Key ID",         required: false, description: "Identifier of the API key used" },
  { key: "inputAudioTokens",  label: "Input Audio Tokens", required: false, description: "Audio input tokens (speech-to-text)" },
  { key: "outputAudioTokens", label: "Output Audio Tokens",required: false, description: "Audio output tokens (text-to-speech)" },
  { key: "isBatch",           label: "Is Batch",           required: false, description: "Whether the request was a batch job" },
  { key: "linesAccepted",     label: "Lines Accepted",     required: false, description: "Code lines accepted by the user" },
  { key: "linesSuggested",    label: "Lines Suggested",    required: false, description: "Code lines suggested by the model" },
  { key: "acceptRate",        label: "Accept Rate",        required: false, description: "Ratio of accepted to suggested lines" },
];

// ---------------------------------------------------------------------------
// Anthropic source fields
// ---------------------------------------------------------------------------

export const ANTHROPIC_SOURCE_FIELDS: FieldDef[] = [
  // Messages API
  { key: "model",                                    label: "model",                                     description: "Model name (e.g. claude-sonnet-4-20250514)" },
  { key: "api_key_id",                               label: "api_key_id",                                description: "API key identifier" },
  { key: "uncached_input_tokens",                     label: "uncached_input_tokens",                     description: "Non-cached input tokens" },
  { key: "output_tokens",                             label: "output_tokens",                             description: "Output tokens" },
  { key: "cache_read_input_tokens",                   label: "cache_read_input_tokens",                   description: "Tokens read from prompt cache" },
  { key: "cache_creation.ephemeral_1h_input_tokens",  label: "cache_creation.ephemeral_1h_input_tokens",  description: "1-hour ephemeral cache creation tokens" },
  { key: "cache_creation.ephemeral_5m_input_tokens",  label: "cache_creation.ephemeral_5m_input_tokens",  description: "5-minute ephemeral cache creation tokens" },
  { key: "workspace_id",                              label: "workspace_id",                              description: "Anthropic workspace ID" },
  { key: "service_tier",                              label: "service_tier",                              description: "Service tier (standard, scale, etc.)" },
  { key: "context_window",                            label: "context_window",                            description: "Context window size used" },
  // Claude Code analytics
  { key: "actor.email_address",                       label: "actor.email_address",                       description: "Email of the Claude Code user" },
  { key: "actor.api_key_name",                        label: "actor.api_key_name",                        description: "API key name for non-user actors" },
  { key: "model_breakdown.tokens.input",              label: "model_breakdown.tokens.input",              description: "Input tokens per model (Claude Code)" },
  { key: "model_breakdown.tokens.output",             label: "model_breakdown.tokens.output",             description: "Output tokens per model (Claude Code)" },
  { key: "model_breakdown.tokens.cache_read",         label: "model_breakdown.tokens.cache_read",         description: "Cache read tokens (Claude Code)" },
  { key: "model_breakdown.tokens.cache_creation",     label: "model_breakdown.tokens.cache_creation",     description: "Cache creation tokens (Claude Code)" },
  { key: "model_breakdown.estimated_cost.amount",     label: "model_breakdown.estimated_cost.amount",     description: "Cost in cents per model (Claude Code)" },
  { key: "core_metrics.num_sessions",                 label: "core_metrics.num_sessions",                 description: "Number of coding sessions" },
  { key: "tool_actions.total_accepted",               label: "tool_actions.total_accepted",               description: "Total tool edits accepted" },
  { key: "tool_actions.total_actions",                label: "tool_actions.total_actions",                description: "Total tool edit actions" },
  // Cost report
  { key: "cost_report.amount",                        label: "cost_report.amount",                        description: "Cost report amount in cents" },
];

export const ANTHROPIC_DEFAULTS: DefaultMapping[] = [
  { sourceField: "api_key_id",                               targetField: "userRef" },
  { sourceField: "model",                                    targetField: "model" },
  { sourceField: "uncached_input_tokens",                    targetField: "inputTokens" },
  { sourceField: "output_tokens",                            targetField: "outputTokens" },
  { sourceField: "cache_read_input_tokens",                  targetField: "cachedTokens" },
  { sourceField: "cost_report.amount",                       targetField: "costUsd" },
  { sourceField: "core_metrics.num_sessions",                targetField: "requestsCount" },
  { sourceField: "tool_actions.total_accepted",              targetField: "linesAccepted" },
  { sourceField: "tool_actions.total_actions",               targetField: "linesSuggested" },
];

// ---------------------------------------------------------------------------
// OpenAI source fields
// ---------------------------------------------------------------------------

export const OPENAI_SOURCE_FIELDS: FieldDef[] = [
  { key: "model",                label: "model",                description: "Model name (e.g. gpt-4o)" },
  { key: "user_id",              label: "user_id",              description: "OpenAI user identifier" },
  { key: "api_key_id",           label: "api_key_id",           description: "API key identifier" },
  { key: "input_tokens",         label: "input_tokens",         description: "Input (prompt) tokens" },
  { key: "output_tokens",        label: "output_tokens",        description: "Output (completion) tokens" },
  { key: "input_cached_tokens",  label: "input_cached_tokens",  description: "Cached input tokens" },
  { key: "input_audio_tokens",   label: "input_audio_tokens",   description: "Audio input tokens" },
  { key: "output_audio_tokens",  label: "output_audio_tokens",  description: "Audio output tokens" },
  { key: "num_model_requests",   label: "num_model_requests",   description: "Number of API requests" },
  { key: "batch",                label: "batch",                description: "Whether this was a batch request" },
  { key: "service_tier",         label: "service_tier",         description: "Service tier" },
  { key: "project_id",           label: "project_id",           description: "OpenAI project identifier" },
  { key: "cost_report.amount",   label: "cost_report.amount",   description: "Cost from the costs endpoint" },
];

export const OPENAI_DEFAULTS: DefaultMapping[] = [
  { sourceField: "user_id",             targetField: "userRef" },
  { sourceField: "model",               targetField: "model" },
  { sourceField: "input_tokens",        targetField: "inputTokens" },
  { sourceField: "output_tokens",       targetField: "outputTokens" },
  { sourceField: "input_cached_tokens", targetField: "cachedTokens" },
  { sourceField: "num_model_requests",  targetField: "requestsCount" },
  { sourceField: "cost_report.amount",  targetField: "costUsd" },
  { sourceField: "api_key_id",          targetField: "apiKeyId" },
  { sourceField: "input_audio_tokens",  targetField: "inputAudioTokens" },
  { sourceField: "output_audio_tokens", targetField: "outputAudioTokens" },
  { sourceField: "batch",               targetField: "isBatch" },
];

// ---------------------------------------------------------------------------
// Cursor source fields
// ---------------------------------------------------------------------------

export const CURSOR_SOURCE_FIELDS: FieldDef[] = [
  // Per-user daily usage
  { key: "email",                    label: "email",                    description: "Team member email address" },
  { key: "mostUsedModel",           label: "mostUsedModel",           description: "Most frequently used model that day" },
  { key: "composerRequests",        label: "composerRequests",        description: "Composer mode requests" },
  { key: "chatRequests",            label: "chatRequests",            description: "Chat mode requests" },
  { key: "agentRequests",           label: "agentRequests",           description: "Agent mode requests" },
  { key: "subscriptionIncludedReqs",label: "subscriptionIncludedReqs",description: "Requests included in subscription" },
  { key: "usageBasedReqs",          label: "usageBasedReqs",          description: "Usage-based (overage) requests" },
  { key: "totalLinesAdded",         label: "totalLinesAdded",         description: "Total lines of code added" },
  { key: "totalLinesDeleted",       label: "totalLinesDeleted",       description: "Total lines of code deleted" },
  { key: "acceptedLinesAdded",      label: "acceptedLinesAdded",      description: "Accepted lines added" },
  { key: "acceptedLinesDeleted",    label: "acceptedLinesDeleted",    description: "Accepted lines deleted" },
  { key: "totalTabsShown",          label: "totalTabsShown",          description: "Tab completions shown" },
  { key: "totalTabsAccepted",       label: "totalTabsAccepted",       description: "Tab completions accepted" },
  { key: "cmdkUsages",              label: "cmdkUsages",              description: "Cmd+K usages" },
  { key: "clientVersion",           label: "clientVersion",           description: "Cursor client version" },
  // Spend
  { key: "spend.spendCents",        label: "spend.spendCents",        description: "Total overage spend in cents" },
  { key: "spend.fastPremiumRequests",label: "spend.fastPremiumRequests",description: "Fast premium request count" },
  { key: "spend.monthlyLimitDollars",label: "spend.monthlyLimitDollars",description: "Monthly spend limit" },
  // Agent edits (team-level)
  { key: "agent_edits.total_lines_suggested", label: "agent_edits.total_lines_suggested", description: "Agent total lines suggested" },
  { key: "agent_edits.total_lines_accepted",  label: "agent_edits.total_lines_accepted",  description: "Agent total lines accepted" },
  // DAU
  { key: "dau.date",                label: "dau.date",                description: "Date for the DAU entry" },
  { key: "dau.dau",                 label: "dau.dau",                 description: "Daily active users count" },
];

export const CURSOR_DEFAULTS: DefaultMapping[] = [
  { sourceField: "email",                    targetField: "userRef" },
  { sourceField: "mostUsedModel",           targetField: "model" },
  { sourceField: "acceptedLinesAdded",      targetField: "linesAccepted" },
  { sourceField: "totalLinesAdded",         targetField: "linesSuggested" },
  { sourceField: "spend.spendCents",        targetField: "costUsd" },
  { sourceField: "subscriptionIncludedReqs",targetField: "requestsCount" },
];

// ---------------------------------------------------------------------------
// Gemini source fields (stub — no usage API yet)
// ---------------------------------------------------------------------------

export const GEMINI_SOURCE_FIELDS: FieldDef[] = [
  { key: "model",   label: "model",   description: "Model name" },
  { key: "api_key", label: "api_key", description: "API key used" },
];

export const GEMINI_DEFAULTS: DefaultMapping[] = [];

// ---------------------------------------------------------------------------
// Vertex AI source fields (stub — no usage API yet)
// ---------------------------------------------------------------------------

export const VERTEX_SOURCE_FIELDS: FieldDef[] = [
  { key: "project_id",   label: "project_id",   description: "GCP project ID" },
  { key: "client_email",label: "client_email", description: "Service account email" },
  { key: "model",        label: "model",        description: "Model name" },
];

export const VERTEX_DEFAULTS: DefaultMapping[] = [];

// ---------------------------------------------------------------------------
// Registry — look up by provider name
// ---------------------------------------------------------------------------

export function getSourceFields(provider: string): FieldDef[] {
  switch (provider) {
    case "anthropic": return ANTHROPIC_SOURCE_FIELDS;
    case "openai":    return OPENAI_SOURCE_FIELDS;
    case "cursor":    return CURSOR_SOURCE_FIELDS;
    case "gemini":    return GEMINI_SOURCE_FIELDS;
    case "vertex":    return VERTEX_SOURCE_FIELDS;
    default:          return [];
  }
}

export function getDefaultMappings(provider: string): DefaultMapping[] {
  switch (provider) {
    case "anthropic": return ANTHROPIC_DEFAULTS;
    case "openai":    return OPENAI_DEFAULTS;
    case "cursor":    return CURSOR_DEFAULTS;
    case "gemini":    return GEMINI_DEFAULTS;
    case "vertex":    return VERTEX_DEFAULTS;
    default:          return [];
  }
}
