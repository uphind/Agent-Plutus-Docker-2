"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LlmModelSelect } from "@/components/llm-model-select";
import { Bot, Eye, EyeOff, Sparkles, AlertTriangle } from "lucide-react";
import { api } from "@/lib/dashboard-api";
import { loadAiConfig, saveAiConfig } from "@/app/dashboard/settings/page";

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
];

/** A small curated default model per provider — users can edit freely. */
const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-20250514",
  gemini: "gemini-2.0-flash",
};

/**
 * Combined AI step. ONE provider + ONE model + ONE API key, written to BOTH
 * the chatbot's localStorage and the server-encrypted AiToolsConfig so the
 * same key powers in-app chat AND server-side mapping suggestions.
 *
 * Users can still maintain two separate keys after onboarding by editing the
 * two cards independently in Settings → AI Assistant.
 */
export function StepAi({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [chatbotConfigured, setChatbotConfigured] = useState(false);
  const [serverConfigured, setServerConfigured] = useState<{ provider: string | null; model: string | null }>({
    provider: null,
    model: null,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from existing config so the wizard can be re-opened safely.
  useEffect(() => {
    const chat = loadAiConfig();
    if (chat.apiKey) {
      setChatbotConfigured(true);
      setProvider(chat.provider);
      setModel(chat.model);
    }
    api
      .getAiToolsConfig()
      .then((d: { configured: boolean; provider: string | null; model: string | null }) => {
        setServerConfigured({ provider: d.provider, model: d.model });
        // Prefer the server values if the chatbot key wasn't already set.
        if (!chat.apiKey && d.provider && d.model) {
          setProvider(d.provider);
          setModel(d.model);
        }
      })
      .catch(() => {});
  }, []);

  const alreadySetUp = chatbotConfigured && !!serverConfigured.provider;

  const handleSaveAndContinue = async () => {
    if (!apiKey.trim() && alreadySetUp) {
      // Nothing to change — keep moving.
      onNext();
      return;
    }
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Browser-side chatbot store.
      saveAiConfig({ provider, model, apiKey: apiKey.trim() });
      // Server-side AI Tools store.
      await api.saveAiToolsConfig({ provider, model, apiKey: apiKey.trim() });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <CardTitle>AI Assistant</CardTitle>
          </div>
          {alreadySetUp && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <Sparkles className="h-3 w-3" /> Already configured
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pick a provider + model and paste a single API key. We&apos;ll use it for both the
          floating in-app chatbot AND the server-side mapping suggestions in the next steps.
          You can always switch to two separate keys later in Settings → AI Assistant.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Provider"
            options={PROVIDER_OPTIONS}
            value={provider}
            onChange={(e) => {
              const next = e.target.value;
              setProvider(next);
              setModel(DEFAULT_MODELS[next] ?? model);
            }}
          />
          <LlmModelSelect provider={provider} value={model} onChange={setModel} />
        </div>

        <div className="relative">
          <Input
            label="API Key"
            type={showKey ? "text" : "password"}
            placeholder={alreadySetUp ? "•••••••••• (already saved — paste a new one to replace)" : "sk-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 whitespace-pre-line">{error}</p>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          The key is stored in two places: encrypted in the database (for server-side mapping
          suggestions) AND in this browser&apos;s localStorage (for the chatbot to call the
          provider directly without a server hop).
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip — I&apos;ll do this later
          </Button>
          <Button
            onClick={handleSaveAndContinue}
            disabled={saving || (!apiKey.trim() && !alreadySetUp)}
          >
            {saving ? "Saving..." : alreadySetUp && !apiKey.trim() ? "Continue" : "Save & continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
