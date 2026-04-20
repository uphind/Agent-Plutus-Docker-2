"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Wrench, Eye, EyeOff, Sparkles } from "lucide-react";
import { api } from "@/lib/dashboard-api";
import { loadAiConfig } from "@/app/dashboard/settings/page";

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
];

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-20250514",
  gemini: "gemini-2.0-flash",
};

export function StepAiTools({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [reuseChatbotKey, setReuseChatbotKey] = useState(false);
  const [chatbotKeyAvailable, setChatbotKeyAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    api
      .getAiToolsConfig()
      .then((data: { configured: boolean; provider?: string | null; model?: string | null }) => {
        setConfigured(data.configured);
        if (data.provider) setProvider(data.provider);
        if (data.model) setModel(data.model);
      })
      .catch(() => {});
    const chatbot = loadAiConfig();
    setChatbotKeyAvailable(!!chatbot.apiKey);
  }, []);

  // When the user toggles "reuse chatbot key", prefill the form.
  useEffect(() => {
    if (!reuseChatbotKey) return;
    const chatbot = loadAiConfig();
    if (!chatbot.apiKey) return;
    setProvider(chatbot.provider);
    setModel(chatbot.model);
    setApiKey(chatbot.apiKey);
  }, [reuseChatbotKey]);

  const handleSaveAndContinue = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveAiToolsConfig({ provider, model, apiKey: apiKey.trim() });
      setConfigured(true);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI Tools key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Configure AI Tools (optional)</CardTitle>
          </div>
          {configured && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <Sparkles className="h-3 w-3" /> Already configured
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A second key, stored encrypted in our database, that powers in-app helpers like
          AI-assisted field mapping suggestions in the next step. Skip this if you don&apos;t
          want server-side AI features — you can always add it later from Settings.
        </p>

        {chatbotKeyAvailable && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={reuseChatbotKey}
              onChange={(e) => setReuseChatbotKey(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-brand focus:ring-brand"
            />
            Reuse the chatbot key I just entered (writes the same key to both stores)
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Provider"
            options={PROVIDER_OPTIONS}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel(DEFAULT_MODELS[e.target.value] ?? model);
            }}
          />
          <Input
            label="Model"
            placeholder="e.g. gpt-4o-mini"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        <div className="relative">
          <Input
            label="API Key"
            type={showKey ? "text" : "password"}
            placeholder={configured ? "•••••••••• (already saved — paste a new one to replace)" : "sk-..."}
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

        {error && <p className="text-sm text-destructive whitespace-pre-line">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onSkip}>
            {configured ? "Skip — already set" : "Skip — I&apos;ll do this later"}
          </Button>
          <Button
            onClick={() => (configured && !apiKey.trim() ? onNext() : handleSaveAndContinue())}
            disabled={saving || (!apiKey.trim() && !configured)}
          >
            {saving ? "Saving..." : configured && !apiKey.trim() ? "Continue" : "Save & continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
