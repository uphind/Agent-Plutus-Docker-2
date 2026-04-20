"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Languages, AlertTriangle } from "lucide-react";

const TERMINOLOGY_DEFAULTS: Array<{ systemTerm: string; label: string; description: string }> = [
  { systemTerm: "department",        label: "Department",     description: "Organizational unit grouping teams" },
  { systemTerm: "team",              label: "Team",           description: "Sub-unit within a department" },
  { systemTerm: "user",              label: "User",           description: "Individual person in the system" },
  { systemTerm: "seat",              label: "User",           description: "Licensed position / active account" },
  { systemTerm: "seat optimization", label: "User Analysis",  description: "Feature for analyzing user utilization" },
];

export function StepTerminology({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate any existing overrides so a re-run of the wizard is safe.
  useEffect(() => {
    fetch("/api/v1/settings/terminology")
      .then((r) => (r.ok ? r.json() : { overrides: {} }))
      .then((data: { overrides?: Record<string, string> }) => {
        const next: Record<string, string> = {};
        for (const t of TERMINOLOGY_DEFAULTS) {
          next[t.systemTerm] = data.overrides?.[t.systemTerm] ?? "";
        }
        setDrafts(next);
      })
      .catch(() => {});
  }, []);

  const handleSaveAndContinue = async () => {
    const overrides = Object.entries(drafts)
      .filter(([, v]) => v.trim().length > 0)
      .map(([systemTerm, customTerm]) => ({ systemTerm, customTerm: customTerm.trim() }));

    if (overrides.length === 0) {
      onNext();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/settings/terminology", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to save terminology (HTTP ${res.status})`);
      }
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save terminology");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Confirm terminology</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Tweak how Agent-Plutus refers to your org. Leave blank to use the defaults — you
          can always come back to this in Settings → Terminology.
        </p>

        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Default term</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Your term (optional)</th>
              </tr>
            </thead>
            <tbody>
              {TERMINOLOGY_DEFAULTS.map((t) => (
                <tr key={t.systemTerm} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground">{t.description}</p>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      placeholder={t.label}
                      value={drafts[t.systemTerm] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [t.systemTerm]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onSkip}>Use defaults & continue</Button>
          <Button onClick={handleSaveAndContinue} disabled={saving}>
            {saving ? "Saving..." : "Save & continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
