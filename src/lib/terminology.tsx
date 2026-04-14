"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

const SYSTEM_TERMS: Record<string, string> = {
  department: "Department",
  departments: "Departments",
  team: "Team",
  teams: "Teams",
  user: "User",
  users: "Users",
  seat: "User",
  seats: "Users",
  "seat optimization": "User Analysis",
};

interface TerminologyContextValue {
  overrides: Record<string, string>;
  loading: boolean;
  t: (systemTerm: string) => string;
  reload: () => Promise<void>;
}

const TerminologyContext = createContext<TerminologyContextValue>({
  overrides: {},
  loading: true,
  t: (term) => SYSTEM_TERMS[term] ?? term,
  reload: async () => {},
});

function applyCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function TerminologyProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/settings/terminology");
      if (res.ok) {
        const data = await res.json();
        setOverrides(data.overrides ?? {});
      }
    } catch {
      // Silently fail — use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const t = useCallback(
    (systemTerm: string): string => {
      const lower = systemTerm.toLowerCase();
      if (overrides[lower]) {
        return applyCase(systemTerm, overrides[lower]);
      }
      if (lower.endsWith("s") && overrides[lower.slice(0, -1)]) {
        return applyCase(systemTerm, overrides[lower.slice(0, -1)] + "s");
      }
      return SYSTEM_TERMS[lower] ?? systemTerm;
    },
    [overrides]
  );

  return (
    <TerminologyContext.Provider value={{ overrides, loading, t, reload: load }}>
      {children}
    </TerminologyContext.Provider>
  );
}

export function useTerm(systemTerm: string): string {
  const { t } = useContext(TerminologyContext);
  return t(systemTerm);
}

export function useTerminology() {
  return useContext(TerminologyContext);
}
