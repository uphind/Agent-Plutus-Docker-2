"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/dashboard-api";
import { RefreshCw, Users, Code2 } from "lucide-react";

const INTERVAL_OPTIONS = [
  { value: "1", label: "Every 1 hour" },
  { value: "2", label: "Every 2 hours" },
  { value: "4", label: "Every 4 hours" },
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every 24 hours" },
];

interface Settings {
  organization: string;
  syncIntervalHours: number;
  userCount: number;
  providerCount: number;
  lastSync: { at: string; status: string } | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedInterval, setSelectedInterval] = useState("6");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      setSelectedInterval(String(data.syncIntervalHours));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveInterval = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings({ sync_interval_hours: parseInt(selectedInterval, 10) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const intervalChanged = settings
    ? String(settings.syncIntervalHours) !== selectedInterval
    : false;

  return (
    <div className="space-y-6">
      <Header
        title="Settings"
        description="Configure your Tokenear instance"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Sync Schedule</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Usage data is automatically synced from all configured providers on a recurring schedule.
            You can also trigger a manual sync from the Providers page.
          </p>

          <div className="flex items-end gap-3">
            <div className="w-64">
              <Select
                label="Sync interval"
                options={INTERVAL_OPTIONS}
                value={selectedInterval}
                onChange={(e) => setSelectedInterval(e.target.value)}
              />
            </div>
            <Button
              onClick={handleSaveInterval}
              disabled={!intervalChanged || saving}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>

          {saved && (
            <p className="text-sm text-emerald-600 font-medium">
              Sync schedule updated successfully
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          {settings?.lastSync && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Last sync:</span>
              <span>{new Date(settings.lastSync.at).toLocaleString()}</span>
              <Badge variant={settings.lastSync.status === "success" ? "success" : "warning"}>
                {settings.lastSync.status}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Directory Integration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Push your employee directory to Tokenear so usage can be mapped to users, departments, and teams.
            Your system (Active Directory, HR platform, or custom script) should POST to the endpoint below.
          </p>

          {settings && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Current directory:</span>
              <Badge variant="default">
                {settings.userCount} user{settings.userCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">API Endpoint</span>
            </div>
            <code className="block text-sm font-mono bg-card rounded px-3 py-2 border border-border">
              POST /api/v1/directory
            </code>
            <p className="text-xs text-muted-foreground">
              Expected JSON body:
            </p>
            <pre className="text-xs font-mono bg-card rounded px-3 py-2 border border-border overflow-x-auto whitespace-pre">{`{
  "users": [
    {
      "email": "alice@company.com",
      "name": "Alice Chen",
      "department": "Engineering",
      "team": "Platform",
      "job_title": "Staff Engineer",
      "employee_id": "EMP-001",
      "status": "active"
    }
  ]
}`}</pre>
            <p className="text-xs text-muted-foreground">
              Users not included in the payload will be marked as inactive.
              Departments and teams are auto-created from the directory data.
            </p>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
