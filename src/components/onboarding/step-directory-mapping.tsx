"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, AlertTriangle } from "lucide-react";
import type { DirectoryStepResult } from "./step-directory";

const TARGETS = [
  { key: "email",       label: "Email",        required: true },
  { key: "name",        label: "Full name",    required: true },
  { key: "department",  label: "Department",   required: false },
  { key: "team",        label: "Team",         required: false },
  { key: "job_title",   label: "Job title",    required: false },
  { key: "employee_id", label: "Employee ID",  required: false },
  { key: "status",      label: "Status",       required: false },
];

/** Auto-fill mappings for the standard Microsoft Graph user fields. */
const AUTO_RULES: Record<string, string[]> = {
  email:       ["mail", "userPrincipalName", "email"],
  name:        ["displayName", "name"],
  department:  ["department"],
  team:        ["officeLocation", "team"],
  job_title:   ["jobTitle"],
  employee_id: ["employeeId", "id"],
  status:      ["accountEnabled"],
};

interface Mapping {
  sourceField: string;
  targetField: string;
}

export function StepDirectoryMapping({
  directoryResult,
  onNext,
  onSkip,
}: {
  directoryResult: DirectoryStepResult | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const availableFields = directoryResult?.availableFields ?? [];
  const sampleUser = directoryResult?.sampleUser ?? null;

  const initialMappings = useMemo<Mapping[]>(() => {
    const fieldSet = new Set(availableFields.map((f) => f.toLowerCase()));
    const out: Mapping[] = [];
    for (const target of TARGETS) {
      for (const candidate of AUTO_RULES[target.key] ?? []) {
        if (fieldSet.has(candidate.toLowerCase())) {
          const original = availableFields.find((f) => f.toLowerCase() === candidate.toLowerCase());
          if (original) {
            out.push({ sourceField: original, targetField: target.key });
            break;
          }
        }
      }
    }
    return out;
  }, [availableFields]);

  const [mappings, setMappings] = useState<Mapping[]>(initialMappings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMappings(initialMappings);
  }, [initialMappings]);

  const mappedTargets = useMemo(() => new Set(mappings.map((m) => m.targetField)), [mappings]);
  const missingRequired = TARGETS.filter((t) => t.required && !mappedTargets.has(t.key));

  // Skip the entire step when the previous step was skipped (no Graph
  // connection means nothing to map).
  const noDirectory = !directoryResult?.graphConnected;

  const handleSaveAndContinue = async () => {
    if (noDirectory) {
      onNext();
      return;
    }
    if (missingRequired.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/graph/field-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to save mappings (HTTP ${res.status})`);
      }
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  };

  if (noDirectory) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Directory mapping</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You skipped the directory connection, so there&apos;s nothing to map yet. You can
            wire AD up later from <strong>Settings → Directory Sync</strong> and the mapping
            UI lives there too.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button onClick={onNext}>Continue</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Confirm directory field mapping</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We&apos;ve auto-mapped the obvious Microsoft Graph fields. Review them below — at
          minimum we need <strong>Email</strong> and <strong>Full name</strong> to attribute
          usage records to people.
        </p>

        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Agent-Plutus field</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Microsoft Graph source</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Sample value</th>
              </tr>
            </thead>
            <tbody>
              {TARGETS.map((tf) => {
                const m = mappings.find((x) => x.targetField === tf.key);
                const sample = m && sampleUser ? sampleUser[m.sourceField] : undefined;
                return (
                  <tr key={tf.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{tf.label}</span>
                        {tf.required && (
                          <span className="text-[10px] text-red-500 font-medium">Required</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        className={`w-full h-8 rounded-md border bg-card px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring ${
                          tf.required && !m ? "border-red-300" : "border-border"
                        }`}
                        value={m?.sourceField ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setMappings((prev) => {
                            const filtered = prev.filter((x) => x.targetField !== tf.key);
                            if (!value) return filtered;
                            return [...filtered, { sourceField: value, targetField: tf.key }];
                          });
                        }}
                      >
                        <option value="">— Not mapped —</option>
                        {availableFields.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                      {sample !== undefined && sample !== null ? String(sample) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {missingRequired.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <strong>Missing required:</strong>{" "}
            {missingRequired.map((t) => t.label).join(", ")}. Map these to continue.
          </p>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onSkip}>Skip — I&apos;ll map later</Button>
          <Button
            onClick={handleSaveAndContinue}
            disabled={saving || missingRequired.length > 0}
          >
            {saving ? "Saving..." : "Save mappings & continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
