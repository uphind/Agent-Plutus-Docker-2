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
 * the credential; for providers we don't yet sync (Microsoft Copilot today),
 * the wizard surfaces a "request integration" path instead of a save path.
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
    id: "microsoft_copilot",
    label: "Microsoft Copilot",
    hint: "M365 Copilot via Microsoft Graph",
    discoveryProviderIds: ["microsoft_copilot"],
    internalProvider: null,
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
  initiallySelected,
  onNext,
  onSkip,
}: {
  initiallySelected?: string[];
  onNext: (selection: ProviderSelection[]) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initiallySelected ?? []));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleContinue = () => {
    const picked = TILES.filter((t) => selected.has(t.id));
    if (picked.length === 0) return;
    onNext(picked);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Which providers do you have?</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pick every provider you want to wire up now. We&apos;ll go through them one at a
          time in the next steps — paste a key, run filtered Discovery for that provider, and
          confirm the field mapping.
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
            {selected.size} selected · pick at least one to continue
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
            <Button onClick={handleContinue} disabled={selected.size === 0}>
              Continue ({selected.size})
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
