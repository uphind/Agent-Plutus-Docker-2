import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  cursor: "Cursor",
  vertex: "Vertex AI",
};

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#D4A574",
  openai: "#10A37F",
  gemini: "#8E75B2",
  cursor: "#6366F1",
  vertex: "#4285F4",
};

const MODEL_LABELS: Record<string, string> = {
  "cursor-agent": "Cursor Agent",
  "cursor-included": "Cursor (Included)",
  "cursor-usage-based": "Cursor (Usage-Based)",
};

export function formatModelName(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

export function isOverageModel(model: string): boolean {
  return model === "cursor-usage-based";
}
