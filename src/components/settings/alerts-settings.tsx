"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, Mail, Slack, Plus, Trash2, Send, Power, Check, AlertCircle, Settings, ExternalLink, MessageSquare, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";

type AlertChannelKind = "email_smtp" | "slack_webhook" | "slack_bot" | "teams_webhook" | "teams_bot";

type AlertTriggerKind =
  | "over_budget"
  | "budget_warning"
  | "anomaly"
  | "inactive_user"
  | "cost_spike"
  | "no_budget"
  | "high_cost_model"
  | "underutilized";

interface ChannelRow {
  id: string;
  kind: AlertChannelKind;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface RecipientSpec {
  kind:
    | "static_emails"
    | "ad_users"
    | "ad_department"
    | "ad_team"
    | "entity_owner"
    | "slack_channel"
    | "slack_user_email";
  value?: string;
}

interface RuleRow {
  id: string;
  name: string;
  trigger: AlertTriggerKind;
  filter: { departmentIds?: string[]; teamIds?: string[]; thresholdPct?: number };
  channelIds: string[];
  recipients: RecipientSpec[];
  throttleHours: number;
  muteUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DeliveryRow {
  id: string;
  ruleId: string | null;
  channelId: string | null;
  trigger: AlertTriggerKind;
  entityType: string | null;
  entityId: string | null;
  recipient: string;
  status: "sent" | "failed" | "suppressed";
  error: string | null;
  createdAt: string;
}

interface SlackInstallStatus {
  connected: boolean;
  install: { teamName: string; teamId: string; installedAt: string } | null;
  oauthConfigured: boolean;
  oauthSource: "db" | "env" | null;
}

interface SlackOAuthConfigStatus {
  configured: boolean;
  clientId: string | null;
  redirectUri: string | null;
  envFallbackAvailable: boolean;
}

interface TeamsStatus {
  configured: boolean;
  settings: {
    microsoftAppId: string;
    tenantId: string | null;
    publicBaseUrl: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  conversationCount: number;
}

interface TeamsConversation {
  id: string;
  conversationId: string;
  conversationType: "channel" | "personal" | "groupChat";
  displayName: string | null;
  teamName: string | null;
  lastSeenAt: string;
  createdAt: string;
}

interface DepartmentLite { id: string; name: string }
interface TeamLite { id: string; name: string; departmentId: string }

const TRIGGER_OPTIONS: Array<{ value: AlertTriggerKind; label: string }> = [
  { value: "over_budget", label: "Budget exceeded (over 100%)" },
  { value: "budget_warning", label: "Approaching budget" },
  { value: "anomaly", label: "Spend anomaly (user vs dept)" },
  { value: "cost_spike", label: "Department cost spike" },
  { value: "high_cost_model", label: "High-cost models per user" },
  { value: "no_budget", label: "Department spending without a budget" },
  { value: "inactive_user", label: "Inactive user (no usage 30d)" },
  { value: "underutilized", label: "Underutilized department" },
];

const RECIPIENT_KIND_OPTIONS: Array<{ value: RecipientSpec["kind"]; label: string }> = [
  { value: "static_emails", label: "Static email list" },
  { value: "ad_department", label: "AD: everyone in a department" },
  { value: "ad_team", label: "AD: everyone in a team" },
  { value: "ad_users", label: "AD: specific user ids" },
  { value: "entity_owner", label: "Owner of the alert entity (the user it's about)" },
  { value: "slack_channel", label: "Slack: channel id (overrides channel default)" },
  { value: "slack_user_email", label: "Slack: DM by email" },
];

export function AlertsSettings() {
  const search = useSearchParams();
  const slackParam = search.get("slack");
  const slackError = search.get("slack_error");

  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [slackStatus, setSlackStatus] = useState<SlackInstallStatus | null>(null);
  const [oauthConfig, setOauthConfig] = useState<SlackOAuthConfigStatus | null>(null);
  const [teamsStatus, setTeamsStatus] = useState<TeamsStatus | null>(null);
  const [depts, setDepts] = useState<DepartmentLite[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [setupEmailOpen, setSetupEmailOpen] = useState(false);
  const [setupSlackOpen, setSetupSlackOpen] = useState(false);
  const [setupTeamsOpen, setSetupTeamsOpen] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [loading, setLoading] = useState(true);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, d, s, oc, ts, dep, tm] = await Promise.all([
        fetch("/api/v1/alerts/channels").then((r) => r.json()),
        fetch("/api/v1/alerts/rules").then((r) => r.json()),
        fetch("/api/v1/alerts/deliveries?limit=50").then((r) => r.json()),
        fetch("/api/v1/integrations/slack").then((r) => r.json()),
        fetch("/api/v1/integrations/slack/oauth/config").then((r) => r.json()),
        fetch("/api/v1/integrations/teams").then((r) => r.json()),
        fetch("/api/v1/departments").then((r) => r.json()).catch(() => ({ departments: [] })),
        fetch("/api/v1/teams").then((r) => r.json()).catch(() => ({ teams: [] })),
      ]);
      setChannels(c.channels ?? []);
      setRules(r.rules ?? []);
      setDeliveries(d.deliveries ?? []);
      setSlackStatus(s);
      setOauthConfig(oc);
      setTeamsStatus(ts);
      setDepts((dep.departments ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      setTeams((tm.teams ?? []).map((x: { id: string; name: string; departmentId: string }) => ({ id: x.id, name: x.name, departmentId: x.departmentId })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  return (
    <div className="space-y-6">
      {slackParam === "connected" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 flex items-center gap-2">
          <Check className="h-4 w-4" /> Slack connected successfully.
        </div>
      )}
      {slackParam === "error" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-900 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> Slack connection failed{slackError ? `: ${slackError}` : ""}.
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Channels</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSetupEmailOpen(true)}>
                <Mail className="h-3.5 w-3.5" /> Setup Email
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSetupSlackOpen(true)}>
                <Slack className="h-3.5 w-3.5" /> Setup Slack
              </Button>
              <Button size="sm" onClick={() => setSetupTeamsOpen(true)}>
                <MessageSquare className="h-3.5 w-3.5" /> Setup Teams
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Where alerts get sent. Each rule routes to one or more channels.
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No channels yet. Click <strong>Setup Email</strong>, <strong>Setup Slack</strong>, or <strong>Setup Teams</strong> above to add one.
            </p>
          ) : (
            <ChannelsTable channels={channels} onChange={reloadAll} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Rules</CardTitle>
            </div>
            <Button size="sm" onClick={() => setShowAddRule(true)} disabled={channels.length === 0}>
              <Plus className="h-3.5 w-3.5" /> New rule
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Trigger + filter + channels + recipients. Throttling prevents repeat sends within the
            window.
          </p>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No rules yet. Add one to start receiving alerts.
            </p>
          ) : (
            <RulesTable rules={rules} channels={channels} onChange={reloadAll} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Recent deliveries</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No deliveries yet.</p>
          ) : (
            <DeliveriesTable deliveries={deliveries} channels={channels} rules={rules} />
          )}
        </CardContent>
      </Card>

      {setupEmailOpen && (
        <SetupEmailModal
          open={setupEmailOpen}
          onClose={() => setSetupEmailOpen(false)}
          onCreated={async () => { setSetupEmailOpen(false); await reloadAll(); }}
        />
      )}
      {setupSlackOpen && (
        <SetupSlackModal
          open={setupSlackOpen}
          onClose={() => setSetupSlackOpen(false)}
          onCreated={async () => { await reloadAll(); }}
          onClosed={() => setSetupSlackOpen(false)}
          oauthConfig={oauthConfig}
          slackStatus={slackStatus}
          reloadAll={reloadAll}
        />
      )}
      {setupTeamsOpen && (
        <SetupTeamsModal
          open={setupTeamsOpen}
          onClose={() => setSetupTeamsOpen(false)}
          onCreated={async () => { await reloadAll(); }}
          onClosed={() => setSetupTeamsOpen(false)}
          teamsStatus={teamsStatus}
          reloadAll={reloadAll}
        />
      )}
      {showAddRule && (
        <AddRuleModal
          open={showAddRule}
          onClose={() => setShowAddRule(false)}
          onCreated={async () => { setShowAddRule(false); await reloadAll(); }}
          channels={channels}
          departments={depts}
          teams={teams}
        />
      )}
    </div>
  );
}


function ChannelKindIcon({ kind }: { kind: AlertChannelKind }) {
  if (kind === "email_smtp") return <Mail className="h-4 w-4 text-muted-foreground" />;
  if (kind === "teams_webhook" || kind === "teams_bot") {
    return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
  }
  return <Slack className="h-4 w-4 text-muted-foreground" />;
}

function ChannelsTable({ channels, onChange }: { channels: ChannelRow[]; onChange: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState<Record<string, string>>({});
  const [resultByChannel, setResultByChannel] = useState<Record<string, { ok: boolean; message: string }>>({});

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this channel? Rules using it will silently skip it.")) return;
    setBusyId(id);
    try {
      await fetch(`/api/v1/alerts/channels/${id}`, { method: "DELETE" });
      await onChange();
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (id: string, kind: AlertChannelKind) => {
    setBusyId(id);
    setResultByChannel((m) => ({ ...m, [id]: { ok: true, message: "Sending…" } }));
    try {
      const body: Record<string, string> = {};
      if (kind === "email_smtp" || kind === "slack_bot") {
        const r = testRecipient[id]?.trim();
        if (r) body.testRecipient = r;
      }
      const res = await fetch(`/api/v1/alerts/channels/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setResultByChannel((m) => ({ ...m, [id]: { ok: true, message: "Sent." } }));
      } else {
        setResultByChannel((m) => ({ ...m, [id]: { ok: false, message: json.error ?? "Failed" } }));
      }
    } catch (err) {
      setResultByChannel((m) => ({
        ...m,
        [id]: { ok: false, message: err instanceof Error ? err.message : "Send failed" },
      }));
    } finally {
      setBusyId(null);
      await onChange();
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kind</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Test</th>
            <th className="px-3 py-2 w-12" />
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 align-top">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <ChannelKindIcon kind={c.kind} />
                  <span className="text-xs font-mono">{c.kind}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 font-medium">{c.name}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                <ChannelDetail config={c.config} kind={c.kind} />
              </td>
              <td className="px-3 py-2.5">
                <div className="space-y-1">
                  {(c.kind === "email_smtp" || c.kind === "slack_bot") && (
                    <Input
                      placeholder={c.kind === "email_smtp" ? "you@example.com" : "user@example.com"}
                      value={testRecipient[c.id] ?? ""}
                      onChange={(e) => setTestRecipient((m) => ({ ...m, [c.id]: e.target.value }))}
                      className="h-7 text-xs"
                    />
                  )}
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={() => handleTest(c.id, c.kind)}>
                      <Send className="h-3 w-3" /> Send test
                    </Button>
                    {resultByChannel[c.id] && (
                      <span className={`text-[11px] ${resultByChannel[c.id].ok ? "text-emerald-700" : "text-destructive"}`}>
                        {resultByChannel[c.id].message}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right">
                <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} disabled={busyId === c.id}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelDetail({ config, kind }: { config: Record<string, unknown>; kind: AlertChannelKind }) {
  if (kind === "email_smtp") {
    return (
      <div className="font-mono">
        {String(config.user ?? "")} @ {String(config.host ?? "")}:{String(config.port ?? "")}
        {config.secure ? " (TLS)" : ""}<br />
        from {String(config.fromAddress ?? "")}
      </div>
    );
  }
  if (kind === "slack_webhook") {
    return <div className="font-mono">{String(config.masked ?? "")}{config.channelLabel ? ` → ${String(config.channelLabel)}` : ""}</div>;
  }
  if (kind === "slack_bot") {
    return (
      <div className="font-mono">
        mode: {String(config.mode ?? "")}
        {config.channelName ? ` → #${String(config.channelName)}` : config.channelId ? ` → ${String(config.channelId)}` : ""}
      </div>
    );
  }
  if (kind === "teams_webhook") {
    return (
      <div className="font-mono">
        {String(config.masked ?? "")}
        {config.channelLabel ? ` → ${String(config.channelLabel)}` : ""}
      </div>
    );
  }
  if (kind === "teams_bot") {
    const t = String(config.conversationType ?? "channel");
    const name = config.conversationName ? String(config.conversationName) : String(config.conversationId ?? "");
    const prefix = t === "channel" ? "#" : t === "groupChat" ? "👥 " : "👤 ";
    return <div className="font-mono">{prefix}{name}</div>;
  }
  return null;
}

function SetupEmailModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [name, setName] = useState("Email alerts");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("Agent Plutus Alerts");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/alerts/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "email_smtp",
          name,
          host,
          port,
          secure,
          user,
          pass,
          fromAddress,
          fromName: fromName || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Setup Email (SMTP)" className="max-w-lg">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Paste your SMTP credentials. Common providers: Gmail (smtp.gmail.com:587 with an App Password),
          Office 365 (smtp.office365.com:587), SendGrid (smtp.sendgrid.net:587, user <code>apikey</code>),
          Amazon SES (email-smtp.&lt;region&gt;.amazonaws.com:587). The password is encrypted at rest.
        </p>
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance email" />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Input label="SMTP host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <Input label="Port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
          Use TLS (port 465). Leave unchecked for STARTTLS on port 587.
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Username" value={user} onChange={(e) => setUser(e.target.value)} placeholder="alerts@company.com" />
          <Input label="Password / App password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="From address" type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="alerts@company.com" />
          <Input label="From name (optional)" value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !host || !user || !pass || !fromAddress}>
            {saving ? "Saving…" : "Save email channel"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type SlackTab = "oauth" | "webhook";

function SetupSlackModal({
  open,
  onClose,
  onCreated,
  onClosed,
  oauthConfig,
  slackStatus,
  reloadAll,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onClosed: () => void;
  oauthConfig: SlackOAuthConfigStatus | null;
  slackStatus: SlackInstallStatus | null;
  reloadAll: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<SlackTab>("oauth");
  return (
    <Modal open={open} onClose={onClose} title="Setup Slack" className="max-w-2xl">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("oauth")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "oauth" ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Slack className="h-3.5 w-3.5 inline mr-1.5" /> Bot (OAuth)
          </button>
          <button
            type="button"
            onClick={() => setTab("webhook")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "webhook" ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Send className="h-3.5 w-3.5 inline mr-1.5" /> Incoming Webhook
          </button>
        </div>

        {tab === "oauth" ? (
          <SlackBotSetupTab
            oauthConfig={oauthConfig}
            slackStatus={slackStatus}
            onCreated={onCreated}
            onClosed={onClosed}
            reloadAll={reloadAll}
          />
        ) : (
          <SlackWebhookSetupTab
            onCreated={async () => {
              await onCreated();
              onClosed();
            }}
            onCancel={onClose}
          />
        )}
      </div>
    </Modal>
  );
}

function SlackBotSetupTab({
  oauthConfig,
  slackStatus,
  onCreated,
  onClosed,
  reloadAll,
}: {
  oauthConfig: SlackOAuthConfigStatus | null;
  slackStatus: SlackInstallStatus | null;
  onCreated: () => Promise<void> | void;
  onClosed: () => void;
  reloadAll: () => Promise<void> | void;
}) {
  const oauthReady = Boolean(oauthConfig?.configured) || Boolean(slackStatus?.oauthConfigured);
  const workspaceConnected = Boolean(slackStatus?.connected);

  const [editRequested, setEditRequested] = useState(false);
  const editingCreds = editRequested || !oauthReady;
  const stopEditing = () => setEditRequested(false);
  const startEditing = () => setEditRequested(true);

  return (
    <div className="space-y-4">
      <SetupStep number={1} title="Slack App credentials" done={oauthReady && !editingCreds}>
        {editingCreds ? (
          <SlackOAuthCredsForm
            initial={oauthConfig}
            onSaved={async () => {
              await reloadAll();
              stopEditing();
            }}
            onCancel={oauthReady ? stopEditing : undefined}
          />
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <div>
              <p>
                Client ID: <span className="font-mono text-xs">{oauthConfig?.clientId ?? "(from env)"}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Redirect URI: <span className="font-mono">{oauthConfig?.redirectUri ?? "(from env)"}</span>
                {oauthConfig?.configured ? null : (
                  <span className="ml-2 italic">— sourced from server env vars</span>
                )}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={startEditing}>
              <Settings className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        )}
      </SetupStep>

      <SetupStep number={2} title="Connect your Slack workspace" done={workspaceConnected} disabled={!oauthReady || editingCreds}>
        {workspaceConnected && slackStatus?.install ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <div>
              <p>
                Connected to <strong>{slackStatus.install.teamName}</strong>
              </p>
              <p className="text-xs text-muted-foreground">Workspace ID: {slackStatus.install.teamId}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!confirm("Disconnect Slack workspace?")) return;
                await fetch("/api/v1/integrations/slack/oauth/disconnect", { method: "POST" });
                await reloadAll();
              }}
            >
              <Power className="h-3.5 w-3.5 text-destructive" /> Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Click below to authorize Agent Plutus in your Slack workspace. Slack will ask you to confirm
              the bot scopes (chat:write, channels:read, users:read.email, im:write…).
            </p>
            <a href="/api/v1/integrations/slack/oauth/start" target="_blank" rel="noreferrer">
              <Button size="sm" disabled={!oauthReady || editingCreds}>
                <Slack className="h-3.5 w-3.5" /> Add to Slack
              </Button>
            </a>
          </div>
        )}
      </SetupStep>

      <SetupStep number={3} title="Pick a channel or DM mode" done={false} disabled={!workspaceConnected}>
        {workspaceConnected ? (
          <SlackBotChannelForm
            onCreated={async () => {
              await onCreated();
              onClosed();
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">Connect a workspace first.</p>
        )}
      </SetupStep>
    </div>
  );
}

function SetupStep({
  number,
  title,
  done,
  disabled,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${done ? "border-emerald-300 bg-emerald-50/40" : "border-border bg-card"} p-3 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-5 w-5 rounded-full text-[11px] font-semibold flex items-center justify-center ${done ? "bg-emerald-600 text-white" : "bg-muted text-foreground"}`}>
          {done ? <Check className="h-3 w-3" /> : number}
        </span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function SlackOAuthCredsForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: SlackOAuthConfigStatus | null;
  onSaved: () => Promise<void> | void;
  onCancel?: () => void;
}) {
  const defaultRedirect =
    initial?.redirectUri ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/integrations/slack/oauth/callback`
      : "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(defaultRedirect);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/integrations/slack/oauth/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, redirectUri }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <p className="font-semibold mb-1">How to get these (one-time, ~2 minutes):</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>Open <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">api.slack.com/apps <ExternalLink className="h-3 w-3" /></a> → <strong>Create New App</strong> → <strong>From an app manifest</strong>.</li>
          <li>Pick any workspace, paste the manifest from <code>docs/slack-app-manifest.yaml</code>, click Next → Create.</li>
          <li>On <strong>OAuth &amp; Permissions</strong>, set the redirect URL below as a Redirect URL on the Slack side too.</li>
          <li>On <strong>Basic Information → App Credentials</strong>, copy Client ID and Client Secret here.</li>
        </ol>
      </div>
      <Input label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890.1234567890123" />
      <Input
        label="Client Secret"
        type="password"
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
        placeholder={initial?.configured ? "•••••••• (paste again to replace)" : ""}
      />
      <Input
        label="Redirect URI"
        value={redirectUri}
        onChange={(e) => setRedirectUri(e.target.value)}
        placeholder="https://your-domain/api/v1/integrations/slack/oauth/callback"
      />
      <p className="text-[11px] text-muted-foreground">
        Must match the URL on the Slack app&apos;s <strong>OAuth &amp; Permissions → Redirect URLs</strong> page exactly.
        Slack rejects HTTP except for <code>localhost</code>.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button size="sm" onClick={handleSave} disabled={saving || !clientId || !clientSecret || !redirectUri}>
          {saving ? "Saving…" : "Save credentials"}
        </Button>
      </div>
    </div>
  );
}

function SlackBotChannelForm({
  onCreated,
}: {
  onCreated: () => Promise<void> | void;
}) {
  const [name, setName] = useState("Slack alerts");
  const [mode, setMode] = useState<"channel" | "dm_by_email">("channel");
  const [channels, setChannels] = useState<Array<{ id: string; name: string; isPrivate: boolean }>>([]);
  const [channelId, setChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/v1/integrations/slack/channels")
      .then((r) => r.json())
      .then((d) => {
        setChannels(d.channels ?? []);
        if (d.channels?.[0]?.id) setChannelId(d.channels[0].id);
      })
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const sel = channels.find((c) => c.id === channelId);
      const res = await fetch("/api/v1/alerts/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "slack_bot",
          name,
          mode,
          channelId: mode === "channel" ? channelId : undefined,
          channelName: mode === "channel" ? sel?.name : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <Select
        label="Mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as "channel" | "dm_by_email")}
        options={[
          { value: "channel", label: "Post to a channel" },
          { value: "dm_by_email", label: "DM by AD email (lookup user via users.lookupByEmail)" },
        ]}
      />
      {mode === "channel" && (
        loading ? (
          <p className="text-xs text-muted-foreground">Loading channels…</p>
        ) : (
          <Select
            label="Channel"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            options={channels.map((c) => ({ value: c.id, label: `${c.isPrivate ? "🔒 " : "# "}${c.name}` }))}
          />
        )
      )}
      <p className="text-[11px] text-muted-foreground">
        {mode === "dm_by_email"
          ? "Rules using this channel must include `entity_owner` or `slack_user_email` in their recipients."
          : "The bot must be a member of private channels. Public channels work via chat:write.public."}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving || !name || (mode === "channel" && !channelId)}>
          {saving ? "Saving…" : "Save Slack channel"}
        </Button>
      </div>
    </div>
  );
}

function SlackWebhookSetupTab({
  onCreated,
  onCancel,
}: {
  onCreated: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("Slack webhook");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/alerts/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "slack_webhook",
          name,
          url,
          channelLabel: label || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The fastest way to get alerts into Slack — no app install required. Generate a webhook in
        Slack → Apps → Incoming Webhooks → pick a channel → copy the URL and paste it below.
      </p>
      <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        label="Incoming webhook URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://hooks.slack.com/services/T…/B…/…"
      />
      <Input
        label="Channel label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="#cost-alerts"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !name || !url}>
          {saving ? "Saving…" : "Save webhook channel"}
        </Button>
      </div>
    </div>
  );
}

// ─── Microsoft Teams setup ───────────────────────────────────────────────────

type TeamsTab = "bot" | "webhook";

function SetupTeamsModal({
  open,
  onClose,
  onCreated,
  onClosed,
  teamsStatus,
  reloadAll,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onClosed: () => void;
  teamsStatus: TeamsStatus | null;
  reloadAll: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<TeamsTab>("bot");
  return (
    <Modal open={open} onClose={onClose} title="Setup Microsoft Teams" className="max-w-2xl">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("bot")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "bot" ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 inline mr-1.5" /> Bot (channels, chats, group chats)
          </button>
          <button
            type="button"
            onClick={() => setTab("webhook")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "webhook" ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Send className="h-3.5 w-3.5 inline mr-1.5" /> Workflow webhook
          </button>
        </div>

        {tab === "bot" ? (
          <TeamsBotSetupTab
            teamsStatus={teamsStatus}
            onCreated={onCreated}
            onClosed={onClosed}
            reloadAll={reloadAll}
          />
        ) : (
          <TeamsWebhookSetupTab
            onCreated={async () => {
              await onCreated();
              onClosed();
            }}
            onCancel={onClose}
          />
        )}
      </div>
    </Modal>
  );
}

function TeamsBotSetupTab({
  teamsStatus,
  onCreated,
  onClosed,
  reloadAll,
}: {
  teamsStatus: TeamsStatus | null;
  onCreated: () => Promise<void> | void;
  onClosed: () => void;
  reloadAll: () => Promise<void> | void;
}) {
  const credsReady = Boolean(teamsStatus?.configured);
  const hasConversations = (teamsStatus?.conversationCount ?? 0) > 0;
  const [editRequested, setEditRequested] = useState(false);
  const editingCreds = editRequested || !credsReady;

  return (
    <div className="space-y-4">
      <SetupStep number={1} title="Microsoft App credentials" done={credsReady && !editingCreds}>
        {editingCreds ? (
          <TeamsCredsForm
            initial={teamsStatus?.settings ?? null}
            onSaved={async () => {
              await reloadAll();
              setEditRequested(false);
            }}
            onCancel={credsReady ? () => setEditRequested(false) : undefined}
          />
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <div>
              <p>
                Microsoft App ID: <span className="font-mono text-xs">{teamsStatus?.settings?.microsoftAppId}</span>
              </p>
              {teamsStatus?.settings?.tenantId && (
                <p className="text-xs text-muted-foreground">
                  Tenant: <span className="font-mono">{teamsStatus.settings.tenantId}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Public base URL: <span className="font-mono">{teamsStatus?.settings?.publicBaseUrl ?? "(from server env)"}</span>
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditRequested(true)}>
              <Settings className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        )}
      </SetupStep>

      <SetupStep number={2} title="Install the Agent Plutus app in Teams" done={hasConversations} disabled={!credsReady || editingCreds}>
        {!credsReady ? (
          <p className="text-xs text-muted-foreground italic">Save credentials first.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Download the Teams app package below and upload it to <strong>Teams Admin Center → Manage apps → Upload new app</strong>{" "}
              (or sideload it for a single team via <strong>Apps → Manage your apps → Upload an app</strong>). Once
              installed, add the bot to any channel, chat, or group chat where you want alerts.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <a href="/api/v1/integrations/teams/manifest" download>
                <Button size="sm">
                  <Download className="h-3.5 w-3.5" /> Download Teams app (.zip)
                </Button>
              </a>
              <a
                href="https://admin.teams.microsoft.com/policies/manage-apps"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
              >
                Open Teams Admin Center <ExternalLink className="h-3 w-3" />
              </a>
              <Button size="sm" variant="ghost" onClick={() => reloadAll()}>
                Refresh status
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              The bot reports back to this server when added — that&apos;s why we need a public URL Microsoft can reach.
              {teamsStatus?.conversationCount ? ` Detected ${teamsStatus.conversationCount} conversation(s) so far.` : " No conversations registered yet."}
            </p>
          </div>
        )}
      </SetupStep>

      <SetupStep number={3} title="Pick a destination" done={false} disabled={!hasConversations}>
        {hasConversations ? (
          <TeamsBotChannelForm
            onCreated={async () => {
              await onCreated();
              onClosed();
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Add the bot to at least one Teams channel, chat, or group chat first, then click <strong>Refresh status</strong>.
          </p>
        )}
      </SetupStep>

      {credsReady && (
        <div className="pt-2 border-t border-border flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!confirm("Disconnect Teams? This deletes saved credentials and forgets all known conversations.")) return;
              await fetch("/api/v1/integrations/teams/settings", { method: "DELETE" });
              await reloadAll();
            }}
          >
            <Power className="h-3.5 w-3.5 text-destructive" /> Disconnect Teams
          </Button>
        </div>
      )}
    </div>
  );
}

function TeamsCredsForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: TeamsStatus["settings"];
  onSaved: () => Promise<void> | void;
  onCancel?: () => void;
}) {
  const defaultBase =
    initial?.publicBaseUrl ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const [microsoftAppId, setMicrosoftAppId] = useState(initial?.microsoftAppId ?? "");
  const [microsoftAppPassword, setMicrosoftAppPassword] = useState("");
  const [tenantId, setTenantId] = useState(initial?.tenantId ?? "");
  const [publicBaseUrl, setPublicBaseUrl] = useState(defaultBase);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/integrations/teams/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          microsoftAppId,
          microsoftAppPassword,
          tenantId: tenantId || null,
          publicBaseUrl: publicBaseUrl || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const messagingEndpoint = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, "")}/api/v1/integrations/teams/messages`
    : "";

  return (
    <div className="space-y-2">
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <p className="font-semibold mb-1">How to get these (one-time, ~5 minutes):</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>
            Open{" "}
            <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
              Azure → App registrations <ExternalLink className="h-3 w-3" />
            </a>
            {" "}→ <strong>New registration</strong>. Pick <em>Multitenant</em> (or <em>Single tenant</em> if you only want your own org). No redirect URI needed.
          </li>
          <li>
            On the new app: <strong>Certificates &amp; secrets → New client secret</strong>. Copy the <em>Value</em> immediately.
          </li>
          <li>
            <strong>Overview</strong> page: copy the <em>Application (client) ID</em>.
          </li>
          <li>
            Now create the bot resource:{" "}
            <a href="https://portal.azure.com/#create/Microsoft.AzureBot" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
              Create an Azure Bot <ExternalLink className="h-3 w-3" />
            </a>
            . Pick <em>Use existing app registration</em>, paste the App ID. After creation, on the bot&apos;s <strong>Configuration</strong> page set <em>Messaging endpoint</em> to:
            {messagingEndpoint && (
              <span className="block mt-0.5 font-mono break-all bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">{messagingEndpoint}</span>
            )}
          </li>
          <li>
            On the bot, <strong>Channels → Microsoft Teams</strong> → enable.
          </li>
        </ol>
      </div>
      <Input
        label="Microsoft App ID (Application (client) ID)"
        value={microsoftAppId}
        onChange={(e) => setMicrosoftAppId(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
      />
      <Input
        label="Microsoft App password (client secret value)"
        type="password"
        value={microsoftAppPassword}
        onChange={(e) => setMicrosoftAppPassword(e.target.value)}
        placeholder={initial ? "•••••••• (paste again to replace)" : ""}
      />
      <Input
        label="Tenant ID (optional, only for single-tenant bots)"
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
      />
      <Input
        label="Public base URL of this Agent Plutus deployment"
        value={publicBaseUrl}
        onChange={(e) => setPublicBaseUrl(e.target.value)}
        placeholder="https://alerts.your-company.com"
      />
      <p className="text-[11px] text-muted-foreground">
        Teams will POST activities to <code>{messagingEndpoint || "<base>/api/v1/integrations/teams/messages"}</code>. Microsoft requires HTTPS (or use <code>http://localhost</code> with the Bot Framework Emulator).
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !microsoftAppId || !microsoftAppPassword || !publicBaseUrl}
        >
          {saving ? "Saving…" : "Save credentials"}
        </Button>
      </div>
    </div>
  );
}

function TeamsBotChannelForm({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [name, setName] = useState("Teams alerts");
  const [conversations, setConversations] = useState<TeamsConversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/v1/integrations/teams/conversations")
      .then((r) => r.json())
      .then((d) => {
        const list: TeamsConversation[] = d.conversations ?? [];
        setConversations(list);
        if (list[0]?.conversationId) setConversationId(list[0].conversationId);
      })
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const sel = conversations.find((c) => c.conversationId === conversationId);
      const res = await fetch("/api/v1/alerts/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "teams_bot",
          name,
          conversationId,
          conversationName: sel?.displayName ?? sel?.teamName ?? undefined,
          conversationType: sel?.conversationType,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const labelFor = (c: TeamsConversation): string => {
    const prefix = c.conversationType === "channel" ? "# " : c.conversationType === "groupChat" ? "👥 " : "👤 ";
    const main = c.displayName ?? c.conversationId;
    const team = c.teamName ? ` (${c.teamName})` : "";
    return `${prefix}${main}${team}`;
  };

  return (
    <div className="space-y-2">
      <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading conversations…</p>
      ) : conversations.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No conversations yet. Add the bot to a Teams channel, chat, or group chat first.
        </p>
      ) : (
        <Select
          label="Destination"
          value={conversationId}
          onChange={(e) => setConversationId(e.target.value)}
          options={conversations.map((c) => ({ value: c.conversationId, label: labelFor(c) }))}
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving || !name || !conversationId}>
          {saving ? "Saving…" : "Save Teams channel"}
        </Button>
      </div>
    </div>
  );
}

function TeamsWebhookSetupTab({
  onCreated,
  onCancel,
}: {
  onCreated: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("Teams webhook");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/alerts/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "teams_webhook",
          name,
          url,
          channelLabel: label || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <p className="font-semibold mb-1">How to get a Workflow webhook URL (~2 minutes, no Azure):</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>
            In Teams, click <strong>⋯</strong> next to the channel you want alerts in → <strong>Workflows</strong>.
          </li>
          <li>
            Search for &quot;<em>Post to a channel when a webhook request is received</em>&quot; → <strong>Add</strong>.
          </li>
          <li>
            Sign in if prompted, click <strong>Next</strong>, then <strong>Add workflow</strong>.
          </li>
          <li>Copy the URL Teams shows you and paste it below.</li>
        </ol>
        <p className="mt-1 italic">
          Workflow webhooks only post to channels — for 1:1 chats and group chats, use the Bot tab.
        </p>
      </div>
      <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        label="Workflow webhook URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://prod-…westus.logic.azure.com/workflows/…/triggers/manual/run?api-version=…"
      />
      <Input
        label="Channel label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="#cost-alerts"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !name || !url}>
          {saving ? "Saving…" : "Save webhook channel"}
        </Button>
      </div>
    </div>
  );
}

function RulesTable({
  rules,
  channels,
  onChange,
}: {
  rules: RuleRow[];
  channels: ChannelRow[];
  onChange: () => void;
}) {
  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewById, setPreviewById] = useState<Record<string, { matched: number; emails: number; slack: number } | null>>({});

  const toggleActive = async (r: RuleRow) => {
    setBusyId(r.id);
    try {
      await fetch(`/api/v1/alerts/rules/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      await onChange();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: RuleRow) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    setBusyId(r.id);
    try {
      await fetch(`/api/v1/alerts/rules/${r.id}`, { method: "DELETE" });
      await onChange();
    } finally {
      setBusyId(null);
    }
  };

  const preview = async (r: RuleRow) => {
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/v1/alerts/rules/${r.id}/preview`, { method: "POST" });
      const j = await res.json();
      setPreviewById((m) => ({
        ...m,
        [r.id]: {
          matched: j.matchedAlerts ?? 0,
          emails: j.totals?.emails ?? 0,
          slack: (j.totals?.slackUserEmails ?? 0) + (j.totals?.slackChannels ?? 0),
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rule</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trigger</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channels</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Throttle</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</th>
            <th className="px-3 py-2 w-32" />
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 align-top">
              <td className="px-3 py-2.5">
                <div className="font-medium">{r.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.recipients.length === 0 ? "no recipients" : r.recipients.map((x) => x.kind).join(", ")}
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs font-mono">{r.trigger}</td>
              <td className="px-3 py-2.5 text-xs">
                {r.channelIds.map((id) => channelMap.get(id)?.name ?? "(deleted)").join(", ")}
              </td>
              <td className="px-3 py-2.5 text-xs">{r.throttleHours}h</td>
              <td className="px-3 py-2.5 text-xs">
                {previewById[r.id] ? (
                  <span>
                    {previewById[r.id]!.matched} alert(s) · {previewById[r.id]!.emails} emails · {previewById[r.id]!.slack} slack
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => preview(r)} disabled={busyId === r.id}>
                    Preview
                  </Button>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Badge variant={r.isActive ? "success" : "outline"}>{r.isActive ? "active" : "paused"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(r)} disabled={busyId === r.id}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r)} disabled={busyId === r.id}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddRuleModal({
  open,
  onClose,
  onCreated,
  channels,
  departments,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  channels: ChannelRow[];
  departments: DepartmentLite[];
  teams: TeamLite[];
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AlertTriggerKind>("budget_warning");
  const [thresholdPct, setThresholdPct] = useState<string>("");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [throttleHours, setThrottleHours] = useState(24);
  const [recipients, setRecipients] = useState<RecipientSpec[]>([{ kind: "static_emails", value: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChannel = (id: string) => {
    setChannelIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const updateRecipient = (idx: number, patch: Partial<RecipientSpec>) => {
    setRecipients((cur) => cur.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const cleanedRecipients = recipients.filter(
        (r) => r.kind === "entity_owner" || (r.value && r.value.trim().length > 0),
      );
      const body: Record<string, unknown> = {
        name,
        trigger,
        filter: thresholdPct ? { thresholdPct: Number(thresholdPct) } : {},
        channelIds,
        recipients: cleanedRecipients,
        throttleHours,
        isActive: true,
      };
      const res = await fetch("/api/v1/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New alert rule" className="max-w-xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <Input label="Rule name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineering budget watch" />
        <Select label="Trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as AlertTriggerKind)} options={TRIGGER_OPTIONS} />

        {(trigger === "over_budget" || trigger === "budget_warning") && (
          <Input
            label="Only fire when value ≥ (%)"
            type="number"
            value={thresholdPct}
            onChange={(e) => setThresholdPct(e.target.value)}
            placeholder="80"
          />
        )}

        <div>
          <p className="text-sm font-medium mb-1.5">Channels</p>
          <div className="space-y-1 rounded border border-border p-2">
            {channels.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={channelIds.includes(c.id)} onChange={() => toggleChannel(c.id)} />
                <ChannelKindIcon kind={c.kind} />
                {c.name} <span className="text-[11px] text-muted-foreground">({c.kind})</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-medium">Recipients</p>
            <Button size="sm" variant="ghost" onClick={() => setRecipients((r) => [...r, { kind: "static_emails", value: "" }])}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {recipients.map((r, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-5">
                  <Select
                    value={r.kind}
                    onChange={(e) => updateRecipient(idx, { kind: e.target.value as RecipientSpec["kind"], value: "" })}
                    options={RECIPIENT_KIND_OPTIONS}
                  />
                </div>
                <div className="col-span-6">
                  {r.kind === "ad_department" ? (
                    <Select
                      value={r.value ?? ""}
                      onChange={(e) => updateRecipient(idx, { value: e.target.value })}
                      options={[{ value: "", label: "Select department…" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                    />
                  ) : r.kind === "ad_team" ? (
                    <Select
                      value={r.value ?? ""}
                      onChange={(e) => updateRecipient(idx, { value: e.target.value })}
                      options={[{ value: "", label: "Select team…" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                    />
                  ) : r.kind === "entity_owner" ? (
                    <p className="text-xs text-muted-foreground py-2">Resolves at runtime to the user the alert is about.</p>
                  ) : (
                    <Input
                      value={r.value ?? ""}
                      onChange={(e) => updateRecipient(idx, { value: e.target.value })}
                      placeholder={
                        r.kind === "static_emails" ? "ops@co.com, cto@co.com" :
                        r.kind === "ad_users" ? "user-id-1, user-id-2" :
                        r.kind === "slack_channel" ? "C0123ABCD" :
                        r.kind === "slack_user_email" ? "user@co.com" :
                        ""
                      }
                    />
                  )}
                </div>
                <div className="col-span-1 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setRecipients((cur) => cur.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Input
          label="Throttle window (hours)"
          type="number"
          value={throttleHours}
          onChange={(e) => setThrottleHours(Number(e.target.value))}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name || channelIds.length === 0}>
            {saving ? "Saving…" : "Create rule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeliveriesTable({
  deliveries,
  channels,
  rules,
}: {
  deliveries: DeliveryRow[];
  channels: ChannelRow[];
  rules: RuleRow[];
}) {
  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const ruleMap = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">When</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Trigger</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Rule</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Channel</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Recipient</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Error</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{new Date(d.createdAt).toLocaleString()}</td>
              <td className="px-3 py-1.5">
                <Badge variant={d.status === "sent" ? "success" : d.status === "failed" ? "error" : "outline"}>{d.status}</Badge>
              </td>
              <td className="px-3 py-1.5 font-mono">{d.trigger}</td>
              <td className="px-3 py-1.5">{d.ruleId ? (ruleMap.get(d.ruleId)?.name ?? "(deleted)") : <span className="italic">test</span>}</td>
              <td className="px-3 py-1.5">{d.channelId ? (channelMap.get(d.channelId)?.name ?? "(deleted)") : "—"}</td>
              <td className="px-3 py-1.5 font-mono">{d.recipient}</td>
              <td className="px-3 py-1.5 text-destructive max-w-xs truncate" title={d.error ?? undefined}>{d.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
