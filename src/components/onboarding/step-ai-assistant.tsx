"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Bot, Eye, EyeOff } from "lucide-react";
import { loadAiConfig, saveAiConfig, type AiAssistantConfig } from "@/app/dashboard/settings/page";

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

export function StepAiAssistant({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [config, setConfig] = useState<AiAssistantConfig>({ provider: "openai", model: "gpt-4o-mini", apiKey: "" });
  const [showKey, setShowKey] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    setConfig(loadAiConfig());
  }, []);

  const handleSaveAndContinue = () => {
    if (!config.apiKey.trim()) return;
    saveAiConfig(config);
    setSavedHint(true);
    setTimeout(() => onNext(), 400);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Configure the chatbot</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The chatbot lives in the bottom-right corner of every page and answers questions
          about your AI usage. The key stays in your browser&apos;s localStorage and is sent
          directly from the browser to the model provider — never stored on our server.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Provider"
            options={PROVIDER_OPTIONS}
            value={config.provider}
            onChange={(e) => {
              const provider = e.target.value;
              setConfig((prev) => ({
                ...prev,
                provider,
                model: DEFAULT_MODELS[provider] ?? prev.model,
              }));
            }}
          />
          <Input
            label="Model"
            placeholder="e.g. gpt-4o-mini"
            value={config.model}
            onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
          />
        </div>

        <div className="relative">
          <Input
            label="API Key"
            type={showKey ? "text" : "password"}
            placeholder="sk-..."
            value={config.apiKey}
            onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {savedHint && (
          <p className="text-sm text-emerald-600 font-medium">Chatbot key saved.</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onSkip}>I&apos;ll do this later</Button>
          <Button onClick={handleSaveAndContinue} disabled={!config.apiKey.trim()}>
            Save &amp; continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
