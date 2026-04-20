"use client";

/**
 * Persists completed Discovery sessions in localStorage so the user can:
 *
 *   - leave the page and come back to find their results still there
 *     (auto-restore most recent session on mount), and
 *
 *   - browse a "Recent searches" sidebar of past discoveries, click any
 *     entry to load it back into the main view, or delete it.
 *
 * IMPORTANT — what we DO NOT store:
 *
 *   - The raw API key. Only a redacted hint (`sk-a…wAA`) ever lands in
 *     localStorage. If the user wants to re-run discovery with that key,
 *     they have to paste it again.
 *
 *   - Provider field mappings. Those live in the database (per saved
 *     provider credential) and are completely independent of this history.
 *     Deleting a history entry only removes the cached search results — any
 *     mappings the user already saved against the actual provider stay
 *     intact until they map something new and overwrite them.
 *
 * Storage budget management:
 *
 *   - We cap the number of stored sessions to MAX_SESSIONS (most-recent
 *     first; older sessions are dropped automatically).
 *
 *   - For non-success probes we strip the body before saving (errors and
 *     skips don't need their full payload kept around) which keeps total
 *     session size in the tens of KB rather than megabytes.
 *
 *   - On QuotaExceededError we drop the oldest session and try again until
 *     the write succeeds (or there's nothing left to drop).
 */

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tokenear:discovery:history";
const MAX_SESSIONS = 12;

export interface SessionResult {
  id: string;
  provider: string;
  providerLabel: string;
  apiName: string;
  endpointName: string;
  description: string;
  docsUrl?: string;
  authHint: string;
  internalProvider?: string;
  status:
    | "ok"
    | "no_data"
    | "auth_failed"
    | "not_found"
    | "rate_limited"
    | "skipped"
    | "error";
  httpStatus?: number;
  elapsedMs?: number;
  url?: string;
  method?: string;
  body?: unknown;
  fields?: string[];
  rowCount?: number;
  message?: string;
  skipReason?: string;
  needs?: string[];
}

export interface SessionContext {
  githubOrg?: string;
  githubEnterprise?: string;
  n8nBaseUrl?: string;
  vertexProjectId?: string;
  vertexLocation?: string;
}

export interface DiscoverySession {
  id: string;
  /** Redacted key hint — never the raw key. */
  keyHint: string;
  detectionHint: string;
  context: SessionContext;
  summary: {
    attempted: number;
    ok: number;
    noData: number;
    authFailed: number;
    notFound: number;
    rateLimited: number;
    skipped: number;
    errored: number;
  };
  results: SessionResult[];
  totalCount: number;
  completedCount: number;
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Snapshot caching for useSyncExternalStore — avoids returning fresh array
// references for unchanged storage state, which would otherwise cause an
// infinite render loop.
// ---------------------------------------------------------------------------

const EMPTY: DiscoverySession[] = [];
let cachedRaw: string | null = "__INIT__";
let cachedSessions: DiscoverySession[] = EMPTY;

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): DiscoverySession[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedSessions;
  cachedRaw = raw;
  if (!raw) {
    cachedSessions = EMPTY;
    return cachedSessions;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedSessions = Array.isArray(parsed) ? (parsed as DiscoverySession[]) : EMPTY;
  } catch {
    cachedSessions = EMPTY;
  }
  return cachedSessions;
}

function getServerSnapshot(): DiscoverySession[] {
  return EMPTY;
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cachedRaw = "__INIT__";
      onChange();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function broadcast(serialized: string) {
  if (typeof window === "undefined") return;
  cachedRaw = serialized;
  try {
    cachedSessions = JSON.parse(serialized) as DiscoverySession[];
  } catch {
    cachedSessions = EMPTY;
  }
  // The standard "storage" event only fires in OTHER tabs. Manually re-broadcast
  // so any other instances of the hook in this tab also re-render.
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: serialized }));
}

function writeSessions(sessions: DiscoverySession[]) {
  if (typeof window === "undefined") return;
  let toWrite = sessions.slice(0, MAX_SESSIONS);
  while (toWrite.length > 0) {
    try {
      const serialized = JSON.stringify(toWrite);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      broadcast(serialized);
      return;
    } catch {
      // Most likely a QuotaExceededError. Drop the oldest entry and retry.
      toWrite = toWrite.slice(0, toWrite.length - 1);
    }
  }
  // Unable to store anything — clear the slot so we don't leave stale data.
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    broadcast("[]");
  } catch {
    /* ignore */
  }
}

/**
 * Strip heavy-weight fields from non-success results so a saved session stays
 * within a sensible storage budget. Successful results keep their full body
 * because that's what powers the mapping modal's per-field sample values.
 */
function trimForStorage(result: SessionResult): SessionResult {
  if (result.status === "ok" || result.status === "no_data") return result;
  return { ...result, body: undefined };
}

export function saveDiscoverySession(session: DiscoverySession) {
  const trimmed: DiscoverySession = {
    ...session,
    results: session.results.map(trimForStorage),
  };
  const all = getSnapshot();
  // De-dupe by id — replace if it already exists.
  const filtered = all.filter((s) => s.id !== trimmed.id);
  writeSessions([trimmed, ...filtered]);
}

export function deleteDiscoverySession(id: string) {
  writeSessions(getSnapshot().filter((s) => s.id !== id));
}

export function clearDiscoveryHistory() {
  writeSessions([]);
}

export function listDiscoverySessions(): DiscoverySession[] {
  return getSnapshot();
}

export function useDiscoveryHistory(): {
  sessions: DiscoverySession[];
  save: (session: DiscoverySession) => void;
  remove: (id: string) => void;
  clearAll: () => void;
} {
  const sessions = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const save = useCallback((session: DiscoverySession) => saveDiscoverySession(session), []);
  const remove = useCallback((id: string) => deleteDiscoverySession(id), []);
  const clearAll = useCallback(() => clearDiscoveryHistory(), []);
  return { sessions, save, remove, clearAll };
}

/**
 * Build a "first 4 / last 4 with stars in between" hint, e.g. `sk-a****wAA`.
 * Used by the Recent searches sidebar.
 */
export function formatKeyHint(rawKey: string, frontN = 4, backN = 4): string {
  const k = rawKey.trim();
  if (!k) return "";
  if (k.length <= frontN + backN) return k;
  return `${k.slice(0, frontN)}****${k.slice(-backN)}`;
}

/**
 * Pick the most informative subtitle for a session: the first (or two-most-
 * representative) successful endpoint(s), formatted as "<provider> · <api>".
 */
export function describeSessionSuccess(session: DiscoverySession): string {
  const successes = session.results.filter(
    (r) => r.status === "ok" || r.status === "no_data"
  );
  if (successes.length === 0) return "No endpoints responded";
  const primary = successes[0];
  if (successes.length === 1) {
    return `${primary.providerLabel} · ${primary.apiName}`;
  }
  const provider = primary.providerLabel;
  return `${provider} · ${primary.apiName} +${successes.length - 1} more`;
}
