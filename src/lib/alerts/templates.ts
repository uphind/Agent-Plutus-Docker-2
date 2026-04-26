import type { Alert, AlertSeverity } from "./evaluate";

export type TemplateAudience = "admin" | "end_user";

export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
  /** Slack Block Kit blocks suitable for chat.postMessage / incoming webhook. */
  slackBlocks: unknown[];
  /** Microsoft Teams Adaptive Card (schema 1.5) — used by both webhook and bot. */
  teamsCard: Record<string, unknown>;
}

const SEVERITY_HEX: Record<AlertSeverity, string> = {
  critical: "#dc2626",
  warning: "#f59e0b",
  info: "#3b82f6",
};

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: ":rotating_light:",
  warning: ":warning:",
  info: ":information_source:",
};

function dashboardLink(baseUrl: string, alert: Alert): string {
  switch (alert.entityType) {
    case "department":
      return `${baseUrl}/dashboard/departments`;
    case "team":
      return `${baseUrl}/dashboard/teams/${alert.entityId}`;
    case "user":
      return `${baseUrl}/dashboard/users/${alert.entityId}`;
    case "provider":
      return `${baseUrl}/dashboard/providers`;
    default:
      return `${baseUrl}/dashboard`;
  }
}

function adminCopy(alert: Alert) {
  return {
    subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    intro: alert.title,
    body: alert.description,
  };
}

function endUserCopy(alert: Alert) {
  if (alert.type === "over_budget") {
    return {
      subject: `You've crossed your AI budget`,
      intro: `Heads up — you've crossed your monthly AI budget.`,
      body: alert.description,
    };
  }
  if (alert.type === "budget_warning") {
    return {
      subject: `You're approaching your AI budget`,
      intro: `You're getting close to your monthly AI budget.`,
      body: alert.description,
    };
  }
  if (alert.type === "high_cost_model") {
    return {
      subject: `Your AI requests are unusually expensive`,
      intro: `Your average request cost is well above the org average — consider switching to a smaller model when possible.`,
      body: alert.description,
    };
  }
  return adminCopy(alert);
}

export function renderTemplate(
  alert: Alert,
  audience: TemplateAudience,
  baseUrl: string,
): RenderedTemplate {
  const copy = audience === "end_user" ? endUserCopy(alert) : adminCopy(alert);
  const link = dashboardLink(baseUrl, alert);
  const text = `${copy.intro}\n\n${copy.body}\n\nView in dashboard: ${link}`;
  const html = `
    <table style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;width:100%;max-width:560px;border-collapse:collapse;">
      <tr>
        <td style="border-left:4px solid ${SEVERITY_HEX[alert.severity]};padding:16px 20px;background:#f8fafc;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;">${alert.severity}</div>
          <div style="font-size:18px;font-weight:600;color:#0f172a;margin-top:4px;">${escapeHtml(copy.intro)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px;font-size:14px;line-height:1.5;color:#1e293b;">
          <p style="margin:0 0 16px 0;">${escapeHtml(copy.body)}</p>
          <a href="${link}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:500;">View in dashboard</a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
          Sent by Agent Plutus — ${escapeHtml(alert.entityType)} ${escapeHtml(alert.entityName)}
        </td>
      </tr>
    </table>
  `.trim();

  const slackBlocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `${SEVERITY_EMOJI[alert.severity]} ${truncate(copy.intro, 140)}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: copy.body },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${alert.entityType}*: ${alert.entityName}  •  *severity*: ${alert.severity}` },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View in dashboard", emoji: true },
          url: link,
          style: alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "primary" : undefined,
        },
      ],
    },
  ];

  const teamsCard: Record<string, unknown> = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    msteams: { width: "Full" },
    body: [
      {
        type: "TextBlock",
        text: alert.severity.toUpperCase(),
        size: "Small",
        weight: "Bolder",
        color: alert.severity === "critical" ? "Attention" : alert.severity === "warning" ? "Warning" : "Accent",
        spacing: "None",
      },
      {
        type: "TextBlock",
        text: copy.intro,
        size: "Large",
        weight: "Bolder",
        wrap: true,
        spacing: "Small",
      },
      {
        type: "TextBlock",
        text: copy.body,
        wrap: true,
        spacing: "Small",
      },
      {
        type: "FactSet",
        facts: [
          { title: alert.entityType.charAt(0).toUpperCase() + alert.entityType.slice(1), value: alert.entityName },
          { title: "Severity", value: alert.severity },
        ],
      },
    ],
    actions: [
      {
        type: "Action.OpenUrl",
        title: "View in dashboard",
        url: link,
      },
    ],
  };

  return { subject: copy.subject, text, html, slackBlocks, teamsCard };
}

export function severityHex(s: AlertSeverity): string {
  return SEVERITY_HEX[s];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
