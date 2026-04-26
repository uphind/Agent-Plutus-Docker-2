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
  { key: "starting_at",                              label: "starting_at",                               description: "Start of the usage bucket (ISO 8601). Used as the record date." },
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
  { sourceField: "starting_at",                              targetField: "date" },
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
// Anthropic Compliance source fields (audit-event based, no token/cost data)
// ---------------------------------------------------------------------------

export const ANTHROPIC_COMPLIANCE_SOURCE_FIELDS: FieldDef[] = [
  { key: "id",                                    label: "id",                                    description: "Activity event identifier" },
  { key: "created_at",                            label: "created_at",                            description: "Event timestamp (RFC 3339)" },
  { key: "type",                                  label: "type",                                  description: "Activity type (e.g. claude_chat_created)" },
  { key: "actor.type",                            label: "actor.type",                            description: "Actor variant (user_actor, api_actor, admin_api_key_actor, unauthenticated_user_actor, anthropic_actor, scim_directory_sync_actor)" },
  { key: "actor.email_address",                   label: "actor.email_address",                   description: "Email of the actor (user_actor)" },
  { key: "actor.user_id",                         label: "actor.user_id",                         description: "Anthropic user identifier (user_actor)" },
  { key: "actor.api_key_id",                      label: "actor.api_key_id",                      description: "API key identifier (api_actor)" },
  { key: "actor.admin_api_key_id",                label: "actor.admin_api_key_id",                description: "Admin key identifier (admin_api_key_actor)" },
  { key: "actor.unauthenticated_email_address",   label: "actor.unauthenticated_email_address",   description: "Email provided by an unauthenticated user" },
  { key: "actor.directory_id",                    label: "actor.directory_id",                    description: "Directory sync connection ID (scim_directory_sync_actor)" },
  { key: "actor.ip_address",                      label: "actor.ip_address",                      description: "Source IP address" },
  { key: "actor.user_agent",                      label: "actor.user_agent",                      description: "User agent string" },
  { key: "claude_chat_id",                        label: "claude_chat_id",                        description: "Associated chat identifier (chat events)" },
  { key: "claude_project_id",                     label: "claude_project_id",                     description: "Associated project identifier (chat/project events)" },
  { key: "organization_id",                       label: "organization_id",                       description: "Anthropic organization ID (tagged)" },
  { key: "organization_uuid",                     label: "organization_uuid",                     description: "Anthropic organization UUID" },
];

export const ANTHROPIC_COMPLIANCE_DEFAULTS: DefaultMapping[] = [
  { sourceField: "actor.email_address", targetField: "userRef" },
];

// ---------------------------------------------------------------------------
// Anthropic Analytics source fields (Claude Enterprise Analytics API —
// per-user daily engagement, no token/cost data).
// ---------------------------------------------------------------------------

export const ANTHROPIC_ANALYTICS_SOURCE_FIELDS: FieldDef[] = [
  // Identity
  { key: "user.id",                                                              label: "user.id",                                                              description: "Anthropic user identifier" },
  { key: "user.email_address",                                                   label: "user.email_address",                                                   description: "User email address" },
  // Claude.ai chat
  { key: "chat_metrics.distinct_conversation_count",                             label: "chat_metrics.distinct_conversation_count",                             description: "Distinct chat conversations that day" },
  { key: "chat_metrics.message_count",                                           label: "chat_metrics.message_count",                                           description: "Chat messages sent" },
  { key: "chat_metrics.distinct_projects_created_count",                         label: "chat_metrics.distinct_projects_created_count",                         description: "Projects created in chat" },
  { key: "chat_metrics.distinct_projects_used_count",                            label: "chat_metrics.distinct_projects_used_count",                            description: "Distinct projects used in chat" },
  { key: "chat_metrics.distinct_files_uploaded_count",                           label: "chat_metrics.distinct_files_uploaded_count",                           description: "Files uploaded in chat" },
  { key: "chat_metrics.distinct_artifacts_created_count",                        label: "chat_metrics.distinct_artifacts_created_count",                        description: "Artifacts created in chat" },
  { key: "chat_metrics.thinking_message_count",                                  label: "chat_metrics.thinking_message_count",                                  description: "Extended thinking messages" },
  { key: "chat_metrics.distinct_skills_used_count",                              label: "chat_metrics.distinct_skills_used_count",                              description: "Distinct skills used in chat" },
  { key: "chat_metrics.connectors_used_count",                                   label: "chat_metrics.connectors_used_count",                                   description: "Connector invocations in chat" },
  // Claude Code
  { key: "claude_code_metrics.core_metrics.commit_count",                        label: "claude_code_metrics.core_metrics.commit_count",                        description: "Git commits via Claude Code" },
  { key: "claude_code_metrics.core_metrics.pull_request_count",                  label: "claude_code_metrics.core_metrics.pull_request_count",                  description: "PRs opened via Claude Code" },
  { key: "claude_code_metrics.core_metrics.lines_of_code.added_count",           label: "claude_code_metrics.core_metrics.lines_of_code.added_count",           description: "Lines of code added" },
  { key: "claude_code_metrics.core_metrics.lines_of_code.removed_count",         label: "claude_code_metrics.core_metrics.lines_of_code.removed_count",         description: "Lines of code removed" },
  { key: "claude_code_metrics.core_metrics.distinct_session_count",              label: "claude_code_metrics.core_metrics.distinct_session_count",              description: "Distinct Claude Code sessions" },
  { key: "claude_code_metrics.tool_actions.total_accepted",                      label: "claude_code_metrics.tool_actions.total_accepted",                      description: "Tool edits accepted (sum across all tools)" },
  { key: "claude_code_metrics.tool_actions.total_rejected",                      label: "claude_code_metrics.tool_actions.total_rejected",                      description: "Tool edits rejected (sum across all tools)" },
  { key: "claude_code_metrics.tool_actions.total_actions",                       label: "claude_code_metrics.tool_actions.total_actions",                       description: "Total tool edit actions" },
  // Office Agent — Excel
  { key: "office_metrics.excel.distinct_session_count",                          label: "office_metrics.excel.distinct_session_count",                          description: "Distinct Office Agent sessions in Excel" },
  { key: "office_metrics.excel.message_count",                                   label: "office_metrics.excel.message_count",                                   description: "Office Agent messages in Excel" },
  { key: "office_metrics.excel.skills_used_count",                               label: "office_metrics.excel.skills_used_count",                               description: "Skill invocations in Excel" },
  { key: "office_metrics.excel.distinct_skills_used_count",                      label: "office_metrics.excel.distinct_skills_used_count",                      description: "Distinct skills used in Excel" },
  { key: "office_metrics.excel.connectors_used_count",                           label: "office_metrics.excel.connectors_used_count",                           description: "Connector invocations in Excel" },
  { key: "office_metrics.excel.distinct_connectors_used_count",                  label: "office_metrics.excel.distinct_connectors_used_count",                  description: "Distinct connectors used in Excel" },
  // Office Agent — PowerPoint
  { key: "office_metrics.powerpoint.distinct_session_count",                     label: "office_metrics.powerpoint.distinct_session_count",                     description: "Distinct Office Agent sessions in PowerPoint" },
  { key: "office_metrics.powerpoint.message_count",                              label: "office_metrics.powerpoint.message_count",                              description: "Office Agent messages in PowerPoint" },
  { key: "office_metrics.powerpoint.skills_used_count",                          label: "office_metrics.powerpoint.skills_used_count",                          description: "Skill invocations in PowerPoint" },
  { key: "office_metrics.powerpoint.distinct_skills_used_count",                 label: "office_metrics.powerpoint.distinct_skills_used_count",                 description: "Distinct skills used in PowerPoint" },
  { key: "office_metrics.powerpoint.connectors_used_count",                      label: "office_metrics.powerpoint.connectors_used_count",                      description: "Connector invocations in PowerPoint" },
  { key: "office_metrics.powerpoint.distinct_connectors_used_count",             label: "office_metrics.powerpoint.distinct_connectors_used_count",             description: "Distinct connectors used in PowerPoint" },
  // Cowork
  { key: "cowork_metrics.distinct_session_count",                                label: "cowork_metrics.distinct_session_count",                                description: "Distinct Cowork sessions" },
  { key: "cowork_metrics.message_count",                                         label: "cowork_metrics.message_count",                                         description: "Cowork messages sent" },
  { key: "cowork_metrics.action_count",                                          label: "cowork_metrics.action_count",                                          description: "Successful Cowork tool calls" },
  { key: "cowork_metrics.dispatch_turn_count",                                   label: "cowork_metrics.dispatch_turn_count",                                   description: "Completed dispatch agent turns" },
  { key: "cowork_metrics.skills_used_count",                                     label: "cowork_metrics.skills_used_count",                                     description: "Skill invocations in Cowork" },
  { key: "cowork_metrics.distinct_skills_used_count",                            label: "cowork_metrics.distinct_skills_used_count",                            description: "Distinct skills used in Cowork" },
  { key: "cowork_metrics.connectors_used_count",                                 label: "cowork_metrics.connectors_used_count",                                 description: "Connector invocations in Cowork" },
  { key: "cowork_metrics.distinct_connectors_used_count",                        label: "cowork_metrics.distinct_connectors_used_count",                        description: "Distinct connectors used in Cowork" },
  // Misc
  { key: "web_search_count",                                                     label: "web_search_count",                                                     description: "Web search tool invocations (chat + Claude Code)" },
];

export const ANTHROPIC_ANALYTICS_DEFAULTS: DefaultMapping[] = [
  { sourceField: "user.email_address",                                       targetField: "userRef" },
  { sourceField: "chat_metrics.message_count",                               targetField: "requestsCount" },
  { sourceField: "claude_code_metrics.tool_actions.total_accepted",          targetField: "linesAccepted" },
  { sourceField: "claude_code_metrics.tool_actions.total_actions",           targetField: "linesSuggested" },
];

// ---------------------------------------------------------------------------
// OpenAI source fields
// ---------------------------------------------------------------------------

// OpenAI's Usage Admin API returns *bucketed* data — each bucket has a
// `start_time` / `end_time` (Unix seconds) and an inner `results[]` array of
// per-key metrics. The metrics carry no per-event timestamp; the bucket
// boundary IS the date. The adapter in `providers/openai.ts` flattens
// `start_time` onto every row before yielding it, which is why we expose
// it here as a top-level mappable source field — this is the field that
// gets mapped to `date` in the normalized record.
export const OPENAI_SOURCE_FIELDS: FieldDef[] = [
  { key: "start_time",           label: "start_time",           description: "Hourly bucket start (Unix seconds). Map this to `date` — every record gets stamped to the start of its hour, independent of sync interval." },
  { key: "end_time",             label: "end_time",             description: "Hourly bucket end (Unix seconds)." },
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
  { sourceField: "start_time",          targetField: "date" },
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
    case "anthropic":            return ANTHROPIC_SOURCE_FIELDS;
    case "anthropic_compliance": return ANTHROPIC_COMPLIANCE_SOURCE_FIELDS;
    case "anthropic_analytics":  return ANTHROPIC_ANALYTICS_SOURCE_FIELDS;
    case "openai":               return OPENAI_SOURCE_FIELDS;
    case "cursor":               return CURSOR_SOURCE_FIELDS;
    case "gemini":               return GEMINI_SOURCE_FIELDS;
    case "vertex":               return VERTEX_SOURCE_FIELDS;
    default:                     return [];
  }
}

export function getDefaultMappings(provider: string): DefaultMapping[] {
  switch (provider) {
    case "anthropic":            return ANTHROPIC_DEFAULTS;
    case "anthropic_compliance": return ANTHROPIC_COMPLIANCE_DEFAULTS;
    case "anthropic_analytics":  return ANTHROPIC_ANALYTICS_DEFAULTS;
    case "openai":               return OPENAI_DEFAULTS;
    case "cursor":               return CURSOR_DEFAULTS;
    case "gemini":               return GEMINI_DEFAULTS;
    case "vertex":               return VERTEX_DEFAULTS;
    default:                     return [];
  }
}
