"use client";

/**
 * Lightweight, localStorage-backed list of provider integrations the user has
 * asked us to add. Surfaced in the Discovery → "this provider isn't in your
 * account, would you like to add it?" prompt and on the Providers tab under
 * the "Requested integrations" section.
 *
 * The hook is built on `useSyncExternalStore` so reads stay consistent with
 * the localStorage source of truth across tabs and across multiple component
 * instances in the same tab — and so we don't trip the React Compiler's
 * `set-state-in-effect` lint rule.
 *
 * Why localStorage and not the database? Adding a brand-new provider
 * requires shipping a new entry in the Prisma `Provider` enum, an adapter,
 * and field mappings — i.e. a code change. Until that lands, recording
 * interest client-side is the most we can honestly do, and it keeps the
 * credential out of the encrypted-creds table where it would be unusable.
 */

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tokenear:requested-integrations";

export interface RequestedIntegration {
  /** Discovery provider id, e.g. "lovable", "copilot", "n8n", "microsoft_copilot". */
  provider: string;
  providerLabel: string;
  /** The specific API surface that worked, for context. */
  apiName?: string;
  endpointName?: string;
  /** Redacted key hint (never the raw key). */
  keyHint?: string;
  /** ISO timestamp of when the user asked for it. */
  requestedAt: string;
  /** Optional free-form note. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Snapshot caching for useSyncExternalStore. Returning a fresh array reference
// on every read would cause infinite re-renders, so we memoize the parsed
// list against the raw localStorage string.
// ---------------------------------------------------------------------------

const EMPTY_ITEMS: RequestedIntegration[] = [];
let cachedRaw: string | null = "__INIT__";
let cachedItems: RequestedIntegration[] = EMPTY_ITEMS;

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): RequestedIntegration[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  if (!raw) {
    cachedItems = EMPTY_ITEMS;
    return cachedItems;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedItems = Array.isArray(parsed) ? (parsed as RequestedIntegration[]) : EMPTY_ITEMS;
  } catch {
    cachedItems = EMPTY_ITEMS;
  }
  return cachedItems;
}

function getServerSnapshot(): RequestedIntegration[] {
  return EMPTY_ITEMS;
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      // Invalidate cache so the next snapshot is fresh.
      cachedRaw = "__INIT__";
      onChange();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function writeItems(items: RequestedIntegration[]) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(items);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    // Update local cache + notify same-tab listeners (storage event only fires
    // in OTHER tabs).
    cachedRaw = serialized;
    cachedItems = items;
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: serialized }));
  } catch {
    /* ignore */
  }
}

export function addRequestedIntegration(item: RequestedIntegration) {
  const all = getSnapshot();
  // De-dupe by provider — keep the most recent.
  const filtered = all.filter((x) => x.provider !== item.provider);
  writeItems([item, ...filtered]);
}

export function removeRequestedIntegration(provider: string) {
  writeItems(getSnapshot().filter((x) => x.provider !== provider));
}

export function listRequestedIntegrations(): RequestedIntegration[] {
  return getSnapshot();
}

/**
 * React hook that mirrors the localStorage list and stays in sync across
 * tabs (via the standard `storage` event) and within the same tab (via a
 * manually re-broadcast event in `writeItems`).
 */
export function useRequestedIntegrations(): {
  items: RequestedIntegration[];
  add: (item: RequestedIntegration) => void;
  remove: (provider: string) => void;
} {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const add = useCallback((item: RequestedIntegration) => addRequestedIntegration(item), []);
  const remove = useCallback((provider: string) => removeRequestedIntegration(provider), []);
  return { items, add, remove };
}
