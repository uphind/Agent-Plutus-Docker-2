"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plug, Check, Sparkles, MoreHorizontal } from "lucide-react";

/**
 * One tile per provider the user might have. The wizard runs a per-provider
 * Discovery loop afterwards, filtered to the chosen `discoveryProviderIds`.
 *
 * `internalProvider` is the Prisma `Provider` enum value used when saving
 * the credential. When it is null, the wizard surfaces a "request integration"
 * path instead of save + mapping.
 *
 * The "other" tile triggers an unfiltered Discovery so a key for any other
 * supported endpoint can still be detected.
 */
export interface ProviderSelection {
  id: string;
  label: string;
  hint: string;
  /** Which discovery `provider` ids to filter to. Empty array = no filter. */
  discoveryProviderIds: string[];
  /** Internal Prisma Provider enum value, or null when no adapter exists. */
  internalProvider: string | null;
  /** Mark for the tile (initial in a colored circle). */
  badgeText: string;
  badgeBg: string;
  badgeFg: string;
}

const TILES: ProviderSelection[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "Claude — Admin / Compliance / Analytics APIs",
    discoveryProviderIds: ["anthropic"],
    internalProvider: "anthropic",
    badgeText: "A",
    badgeBg: "bg-orange-100",
    badgeFg: "text-orange-700",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "GPT family — Admin / Usage / Cost APIs",
    discoveryProviderIds: ["openai"],
    internalProvider: "openai",
    badgeText: "O",
    badgeBg: "bg-emerald-100",
    badgeFg: "text-emerald-700",
  },
  {
    id: "cursor",
    label: "Cursor",
    hint: "Cursor team admin + analytics APIs",
    discoveryProviderIds: ["cursor"],
    internalProvider: "cursor",
    badgeText: "C",
    badgeBg: "bg-zinc-100",
    badgeFg: "text-zinc-700",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    hint: "Google AI Studio — Models / Files / Tuning",
    discoveryProviderIds: ["gemini"],
    internalProvider: "gemini",
    badgeText: "G",
    badgeBg: "bg-blue-100",
    badgeFg: "text-blue-700",
  },
  {
    id: "lovable",
    label: "Lovable",
    hint: "Lovable Cloud API — projects and workspace",
    discoveryProviderIds: ["lovable"],
    internalProvider: "lovable",
    badgeText: "L",
    badgeBg: "bg-rose-100",
    badgeFg: "text-rose-700",
  },
  {
    id: "n8n",
    label: "n8n",
    hint: "Self-hosted or n8n Cloud — REST API key + your instance URL",
    discoveryProviderIds: ["n8n"],
    internalProvider: "n8n",
    badgeText: "n",
    badgeBg: "bg-indigo-100",
    badgeFg: "text-indigo-700",
  },
  {
    id: "microsoft_copilot",
    label: "Microsoft Copilot",
    hint: "Microsoft Graph — Entra ID Bearer token (not a static API key). Copilot reports need Reports.Read.All.",
    discoveryProviderIds: ["microsoft_copilot"],
    internalProvider: "microsoft_copilot",
    badgeText: "M",
    badgeBg: "bg-sky-100",
    badgeFg: "text-sky-700",
  },
  {
    id: "other",
    label: "Other / not sure",
    hint: "Probe every supported endpoint to figure it out",
    discoveryProviderIds: [],
    internalProvider: null,
    badgeText: "?",
    badgeBg: "bg-purple-100",
    badgeFg: "text-purple-700",
  },
];

export function StepSelectProviders({
  mode = "onboarding",
  initiallySelected,
  onNext,
  onSkip,
}: {
  mode?: "onboarding" | "add-provider";
  initiallySelected?: string[];
  onNext: (selection: ProviderSelection[]) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initiallySelected ?? []));

  const toggle = (id: string) =>
    setSelected((prev) => {
      if (mode === "add-provider") {
        if (prev.has(id)) return new Set();
        return new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleContinue = () => {
    const picked = TILES.filter((t) => selected.has(t.id));
    if (picked.length === 0) return;
    if (mode === "add-provider" && picked.length !== 1) return;
    onNext(picked);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <CardTitle>
            {mode === "add-provider" ? "Select a provider to add" : "Which providers do you have?"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {mode === "add-provider" ? (
            <>
              Choose one provider. We&apos;ll run filtered Discovery for it, then let you confirm
              field mapping — same flow as onboarding, without repeating the earlier setup steps.
            </>
          ) : (
            <>
              Pick every provider you want to wire up now. We&apos;ll go through them one at a
              time in the next steps — paste a key, run filtered Discovery for that provider, and
              confirm the field mapping.
            </>
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TILES.map((tile) => {
            const isSelected = selected.has(tile.id);
            const isOther = tile.id === "other";
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => toggle(tile.id)}
                aria-pressed={isSelected}
                className={`text-left rounded-lg border p-4 transition-all flex items-start gap-3 ${
                  isSelected
                    ? "border-brand bg-brand/5 ring-1 ring-brand"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <div
                  className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center font-semibold ${tile.badgeBg} ${tile.badgeFg}`}
                  aria-hidden
                >
                  {isOther ? <MoreHorizontal className="h-4 w-4" /> : tile.badgeText}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{tile.label}</p>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-brand" aria-label="Selected" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tile.hint}</p>
                  {!tile.internalProvider && !isOther && (
                    <p className="text-[10px] text-amber-700 mt-1 inline-flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" />
                      No sync adapter yet — we&apos;ll log a request
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {mode === "add-provider"
              ? selected.size === 0
                ? "Pick one provider to continue"
                : "1 selected"
              : `${selected.size} selected · pick at least one to continue`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onSkip}>
              {mode === "add-provider" ? "Cancel" : "Skip for now"}
            </Button>
            <Button
              onClick={handleContinue}
              disabled={mode === "add-provider" ? selected.size !== 1 : selected.size === 0}
            >
              {mode === "add-provider" ? "Continue" : `Continue (${selected.size})`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
