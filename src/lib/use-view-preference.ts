"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Persists a UI view preference (table vs. cards, pie vs. bar, expanded vs.
 * collapsed, etc.) to localStorage so it sticks across reloads and across
 * tabs in the same browser.
 *
 * Implemented on top of `useSyncExternalStore` — the React-recommended hook
 * for reading from external stores like localStorage. This keeps it free of
 * the `react-hooks/set-state-in-effect` lint rule and means the value is
 * always consistent between two components reading the same key.
 */

const PREFIX = "tokenear:view:";

/**
 * Snapshot cache keyed by storage key. We MUST return the same reference for
 * the same underlying raw string so React doesn't infinite-loop in
 * `useSyncExternalStore`. The cache flushes naturally when the raw string
 * changes (which only happens on a localStorage write or storage event).
 */
const snapshotCache = new Map<string, { raw: string | null; parsed: unknown }>();

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function getSnapshot<T>(key: string, defaultValue: T): T {
  const raw = readRaw(key);
  if (raw === null) return defaultValue;
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.parsed as T;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Legacy values stored as plain strings.
    parsed = raw;
  }
  snapshotCache.set(key, { raw, parsed });
  return parsed as T;
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(PREFIX + key, serialized);
    // Bust the snapshot cache eagerly so the next getSnapshot call returns
    // the new value (the storage event below would also do this, but that
    // event doesn't fire in the tab that did the write).
    snapshotCache.set(key, { raw: serialized, parsed: value });
    // Notify same-tab listeners — the standard storage event only fires in
    // OTHER tabs, so we manually re-broadcast so any other instances of this
    // hook in the current tab also re-render.
    window.dispatchEvent(new StorageEvent("storage", { key: PREFIX + key, newValue: serialized }));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

function makeSubscribe(key: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const handler = (e: StorageEvent) => {
      if (e.key !== PREFIX + key) return;
      // Invalidate cache for this key so the next snapshot reads fresh.
      snapshotCache.delete(key);
      onChange();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  };
}

export function useViewPreference<T>(
  key: string,
  defaultValue: T
): [T, (next: T) => void] {
  // Memoize the subscriber so its identity is stable between renders for the
  // same key — required by useSyncExternalStore.
  const subscribe = useMemo(() => makeSubscribe(key), [key]);
  const value = useSyncExternalStore<T>(
    subscribe,
    () => getSnapshot<T>(key, defaultValue),
    // Server snapshot — always the default during SSR.
    () => defaultValue
  );
  const setValue = useCallback((next: T) => writeStorage(key, next), [key]);
  return [value, setValue];
}
