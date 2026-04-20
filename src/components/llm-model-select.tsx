"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  fetchAvailableLlmModels,
  modelOptionsForProvider,
  type AvailableLlmModelRow,
} from "@/lib/llm-model-options";

const SELECT_CLASS =
  "flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function LlmModelSelect({
  provider,
  value,
  onChange,
  showRefresh = true,
}: {
  provider: string;
  value: string;
  onChange: (modelId: string) => void;
  showRefresh?: boolean;
}) {
  const [availableModels, setAvailableModels] = useState<AvailableLlmModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const loadModels = useCallback(async (refresh = false) => {
    setModelsLoading(true);
    try {
      const rows = await fetchAvailableLlmModels(refresh);
      setAvailableModels(rows);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModels(false);
  }, [loadModels]);

  const options = useMemo(
    () => modelOptionsForProvider(provider, availableModels, value),
    [provider, availableModels, value]
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Model</label>
        {showRefresh ? (
          <button
            type="button"
            onClick={() => void loadModels(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            disabled={modelsLoading}
          >
            <RefreshCw className={`h-3 w-3 ${modelsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        ) : null}
      </div>
      <select
        className={SELECT_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
