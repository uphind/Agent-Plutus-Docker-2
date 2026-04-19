"use client";

import { Bell, AlertTriangle, Check, CheckCheck, ChevronRight, Settings2 } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/dashboard-api";
import Link from "next/link";
import { SETUP_SKIPPED_KEY, SETUP_SKIPPED_EVENT, type SetupStep } from "@/lib/setup-constants";

interface AlertSummary {
  critical: number;
  warning: number;
  info: number;
}

interface NotificationItem {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="h-8 w-8 rounded-full bg-white/15 text-gray-200 text-xs font-semibold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function notificationLink(n: NotificationItem): string | undefined {
  if (!n.entityType || !n.entityId) return undefined;
  switch (n.entityType) {
    case "department": return `/dashboard/departments/${n.entityId}`;
    case "team": return `/dashboard/teams/${n.entityId}`;
    case "user": return `/dashboard/users/${n.entityId}`;
    default: return undefined;
  }
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-orange-500",
  warning: "bg-amber-400",
  info: "bg-blue-400",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Needs attention",
  warning: "Heads up",
  info: "FYI",
};

interface TopBarProps {
  user?: { name: string | null; email: string | null } | null;
}

export function TopBar({ user }: TopBarProps) {
  const [alerts, setAlerts] = useState<AlertSummary | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [incompleteSteps, setIncompleteSteps] = useState<SetupStep[]>([]);
  const [showSetupPanel, setShowSetupPanel] = useState(false);

  const checkSetupStatus = useCallback(async () => {
    const skipped = localStorage.getItem(SETUP_SKIPPED_KEY) === "true";
    if (!skipped) {
      setSetupIncomplete(false);
      return;
    }
    try {
      const [overview, deptsData, settingsData] = await Promise.all([
        api.getOverview(30),
        api.getDepartments().catch(() => ({ departments: [] })),
        api.getSettings().catch(() => ({ userCount: 0, providerCount: 0 })),
      ]);
      const deps = deptsData.departments ?? [];
      const isEmpty = overview.activeProviders === 0 && overview.topUsers.length === 0 && overview.totals.costUsd === 0;
      if (!isEmpty) {
        localStorage.removeItem(SETUP_SKIPPED_KEY);
        setSetupIncomplete(false);
        return;
      }
      const hasDirectory = (settingsData.userCount ?? 0) > 0;
      const hasProviders = (settingsData.providerCount ?? 0) > 0;
      const steps: SetupStep[] = [
        { label: "Push your employee directory", href: "/dashboard/settings?tab=directory-sync", done: hasDirectory },
        { label: "Connect an AI provider", href: "/dashboard/settings", done: hasProviders },
        { label: "Set department budgets", href: "/dashboard/departments", done: deps.length > 0 },
      ];
      const pending = steps.filter((s) => !s.done);
      setIncompleteSteps(pending);
      setSetupIncomplete(pending.length > 0);
    } catch {
      // ignore
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    api.getAlerts()
      .then((d) => setAlerts(d.summary))
      .catch(() => {});
    fetchNotifications();
    checkSetupStatus();

    const interval = setInterval(fetchNotifications, 60000);

    const handleSetupSkipped = () => checkSetupStatus();
    window.addEventListener(SETUP_SKIPPED_EVENT, handleSetupSkipped);

    return () => {
      clearInterval(interval);
      window.removeEventListener(SETUP_SKIPPED_EVENT, handleSetupSkipped);
    };
  }, [fetchNotifications, checkSetupStatus]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const totalAlerts = alerts ? alerts.critical + alerts.warning : 0;
  const badgeCount = unreadCount + totalAlerts + (setupIncomplete ? 1 : 0);

  return (
    <header className="h-14 bg-sidebar flex items-center justify-between px-6 sticky top-0 z-40">
      <div />
      <div className="flex items-center gap-3">
        {/* Notification bell with dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="relative p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200"
            onClick={() => setOpen(!open)}
          >
            <Bell className="h-4.5 w-4.5" />
            {badgeCount > 0 && (
              <span className={`absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
                (alerts?.critical ?? 0) > 0 ? "bg-orange-500" : totalAlerts > 0 ? "bg-amber-500" : "bg-brand"
              }`}>
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-brand hover:underline flex items-center gap-1"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* Setup incomplete banner */}
              {setupIncomplete && (
                <div className="border-b border-brand/15">
                  <button
                    onClick={() => setShowSetupPanel(!showSetupPanel)}
                    className="flex items-center gap-2.5 px-4 py-2.5 w-full bg-brand/[0.06] hover:bg-brand/[0.10] transition-colors text-left"
                  >
                    <div className="h-7 w-7 rounded-lg bg-brand/15 flex items-center justify-center shrink-0">
                      <Settings2 className="h-3.5 w-3.5 text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-brand">
                        Complete setup
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {incompleteSteps.length} step{incompleteSteps.length !== 1 ? "s" : ""} remaining
                      </p>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${showSetupPanel ? "rotate-90" : ""}`} />
                  </button>
                  {showSetupPanel && (
                    <div className="px-4 pb-3 pt-1 space-y-2">
                      {incompleteSteps.map((step) => (
                        <Link
                          key={step.label}
                          href={step.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors group"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                          <span className="text-xs flex-1">{step.label}</span>
                          <span className="text-[10px] text-brand opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                            Set up &rarr;
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Alert summary banner */}
              {alerts && totalAlerts > 0 && (
                <Link
                  href="/dashboard/reports?tab=alerts"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-500/8 border-b border-amber-500/15 hover:bg-amber-500/12 transition-colors"
                >
                  <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {alerts.critical > 0 && `${alerts.critical} need${alerts.critical === 1 ? "s" : ""} attention`}
                      {alerts.critical > 0 && alerts.warning > 0 && " · "}
                      {alerts.warning > 0 && `${alerts.warning} heads-up${alerts.warning > 1 ? "s" : ""}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">View attention items</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}

              {/* List */}
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length === 0 && totalAlerts === 0 && !setupIncomplete ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No notifications yet
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No other notifications
                  </div>
                ) : (
                  notifications.map((n) => {
                    const link = notificationLink(n);
                    const className = `flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${
                      !n.isRead ? "bg-brand/[0.03]" : ""
                    }`;
                    const handleClick = () => {
                      if (!n.isRead) handleMarkRead(n.id);
                      setOpen(false);
                    };

                    const content = (
                      <>
                        <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[n.severity] ?? "bg-gray-400"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm leading-tight ${!n.isRead ? "font-medium" : ""}`}>
                              {n.title}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                            <span className="text-[10px] text-muted-foreground/60">{SEVERITY_LABEL[n.severity] ?? n.severity}</span>
                          </div>
                        </div>
                        {!n.isRead && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleMarkRead(n.id);
                            }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    );

                    return link ? (
                      <Link key={n.id} href={link} className={className} onClick={handleClick}>
                        {content}
                      </Link>
                    ) : (
                      <div key={n.id} className={className} onClick={handleClick}>
                        {content}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
            <UserAvatar name={user.name || user.email || "U"} />
            <div className="hidden md:block">
              <p className="text-xs font-medium leading-tight text-gray-200">{user.name || "User"}</p>
              {user.email && <p className="text-[10px] text-gray-400 leading-tight">{user.email}</p>}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
