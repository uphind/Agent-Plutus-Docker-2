"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/dashboard-api";
import { PROVIDER_LABELS } from "@/lib/utils";
import {
  TEMPLATES,
  generateCsv,
  generatePdf,
  type TemplateId,
  type UsageRow,
  type PdfOrientation,
} from "@/lib/export-templates";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Check,
  Loader2,
  X,
  CalendarDays,
  FileStack,
  DollarSign,
  BarChart3,
  Briefcase,
  Receipt,
} from "lucide-react";

type TimeframeMode = "preset" | "custom";

interface ExportFilters {
  timeframeMode: TimeframeMode;
  days: number;
  startDate: string;
  endDate: string;
  departments: string[];
  teams: string[];
  providers: string[];
  format: "csv" | "pdf";
  template: TemplateId;
  orientation: PdfOrientation;
}

interface DeptOption {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
  department?: { id: string; name: string } | null;
}

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

const TIME_FRAMES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

const TEMPLATE_ICONS: Record<TemplateId, typeof FileStack> = {
  complete: FileStack,
  cost: DollarSign,
  usage: BarChart3,
  executive: Briefcase,
  chargeback: Receipt,
};

const PROVIDER_KEYS = Object.keys(PROVIDER_LABELS);

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ToggleChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        selected
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
      }`}
    >
      {selected && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onChange,
  allLabel = "All",
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
}) {
  const allSelected = selected.length === 0;

  const toggleAll = () => onChange([]);
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip label={allLabel} selected={allSelected} onClick={toggleAll} />
        {options.map((opt) => (
          <ToggleChip
            key={opt.value}
            label={opt.label}
            selected={selected.includes(opt.value)}
            onClick={() => toggle(opt.value)}
          />
        ))}
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportModal({ open, onClose }: ExportModalProps) {
  const [filters, setFilters] = useState<ExportFilters>({
    timeframeMode: "preset",
    days: 30,
    startDate: toISODate(new Date(Date.now() - 30 * 86400000)),
    endDate: toISODate(new Date()),
    departments: [],
    teams: [],
    providers: [],
    format: "csv",
    template: "complete",
    orientation: "landscape",
  });
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    Promise.all([api.getDepartments(), api.getTeams()])
      .then(([deptData, teamData]) => {
        setDepartments(deptData.departments ?? deptData ?? []);
        setAllTeams(teamData.teams ?? teamData ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const hasDeptFilter = filters.departments.length > 0;

  const visibleTeams = useMemo(() => {
    if (!hasDeptFilter) return [];
    return allTeams.filter(
      (t) => t.department && filters.departments.includes(t.department.id)
    );
  }, [allTeams, filters.departments, hasDeptFilter]);

  useEffect(() => {
    if (!hasDeptFilter) {
      setFilters((f) => (f.teams.length ? { ...f, teams: [] } : f));
      return;
    }
    const validIds = new Set(visibleTeams.map((t) => t.id));
    setFilters((f) => {
      const pruned = f.teams.filter((id) => validIds.has(id));
      return pruned.length !== f.teams.length ? { ...f, teams: pruned } : f;
    });
  }, [hasDeptFilter, visibleTeams]);

  const buildExportParams = useCallback(() => {
    const base: {
      days?: number;
      startDate?: string;
      endDate?: string;
      departments?: string[];
      teams?: string[];
      providers?: string[];
    } = {};

    if (filters.timeframeMode === "custom") {
      base.startDate = filters.startDate;
      base.endDate = filters.endDate;
    } else {
      base.days = filters.days;
    }

    if (filters.departments.length) base.departments = filters.departments;
    if (filters.teams.length) base.teams = filters.teams;
    if (filters.providers.length) base.providers = filters.providers;

    return base;
  }, [filters]);

  const periodLabel = useCallback(() => {
    if (filters.timeframeMode === "custom") {
      return `${filters.startDate} to ${filters.endDate}`;
    }
    return `Last ${filters.days} days`;
  }, [filters]);

  const fileLabel = useCallback(() => {
    const tpl = filters.template;
    const time =
      filters.timeframeMode === "custom"
        ? `${filters.startDate}_${filters.endDate}`
        : `${filters.days}d`;
    return `agent-plutus-${tpl}-${time}`;
  }, [filters]);

  const buildFilterParts = useCallback((): string[] => {
    const parts: string[] = [];
    if (filters.departments.length) {
      const names = filters.departments
        .map((id) => departments.find((d) => d.id === id)?.name ?? id)
        .join(", ");
      parts.push(`Departments: ${names}`);
    }
    if (filters.teams.length) {
      const names = filters.teams
        .map((id) => allTeams.find((t) => t.id === id)?.name ?? id)
        .join(", ");
      parts.push(`Teams: ${names}`);
    }
    if (filters.providers.length) {
      const names = filters.providers
        .map((p) => PROVIDER_LABELS[p] ?? p)
        .join(", ");
      parts.push(`Providers: ${names}`);
    }
    return parts;
  }, [filters, departments, allTeams]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);

    try {
      const params = buildExportParams();
      const data = await api.getExportData(params);
      const rows: UsageRow[] = data.rows ?? [];

      if (filters.format === "csv") {
        const csvContent = generateCsv(filters.template, rows);
        const blob = new Blob([csvContent], { type: "text/csv" });
        downloadBlob(blob, `${fileLabel()}.csv`);
      } else {
        const doc = generatePdf(
          filters.template,
          rows,
          periodLabel(),
          buildFilterParts(),
          filters.orientation
        );
        doc.save(`${fileLabel()}.pdf`);
      }

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [filters, onClose, buildExportParams, periodLabel, fileLabel, buildFilterParts]);

  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const teamOptions = visibleTeams.map((t) => ({ value: t.id, label: t.name }));
  const providerOptions = PROVIDER_KEYS.map((k) => ({
    value: k,
    label: PROVIDER_LABELS[k],
  }));

  return (
    <Modal open={open} onClose={onClose} title="Export Report" className="max-w-lg">
      <div className="space-y-5">
        {/* Time frame */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Time frame
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TIME_FRAMES.map((tf) => (
              <ToggleChip
                key={tf.value}
                label={tf.label}
                selected={
                  filters.timeframeMode === "preset" &&
                  filters.days === tf.value
                }
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    timeframeMode: "preset",
                    days: tf.value,
                  }))
                }
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({ ...f, timeframeMode: "custom" }))
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filters.timeframeMode === "custom"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              Custom
            </button>
          </div>

          {filters.timeframeMode === "custom" && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground">
                  From
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  max={filters.endDate}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, startDate: e.target.value }))
                  }
                  className="flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <span className="text-muted-foreground text-xs pt-5">to</span>
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground">To</label>
                <input
                  type="date"
                  value={filters.endDate}
                  min={filters.startDate}
                  max={toISODate(new Date())}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, endDate: e.target.value }))
                  }
                  className="flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>

        {/* Departments */}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading filters...
          </div>
        ) : (
          <>
            {deptOptions.length > 0 && (
              <ChipGroup
                label="Departments"
                options={deptOptions}
                selected={filters.departments}
                onChange={(departments) =>
                  setFilters((f) => ({ ...f, departments }))
                }
              />
            )}

            {hasDeptFilter && teamOptions.length > 0 && (
              <ChipGroup
                label="Teams"
                options={teamOptions}
                selected={filters.teams}
                onChange={(teams) => setFilters((f) => ({ ...f, teams }))}
              />
            )}
          </>
        )}

        {/* Providers */}
        <ChipGroup
          label="Providers"
          options={providerOptions}
          selected={filters.providers}
          onChange={(providers) => setFilters((f) => ({ ...f, providers }))}
        />

        {/* Format */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, format: "csv" }))}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                filters.format === "csv"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <FileSpreadsheet
                className={`h-5 w-5 ${
                  filters.format === "csv"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
              <div>
                <p className="text-sm font-medium">CSV</p>
                <p className="text-[11px] text-muted-foreground">
                  Spreadsheet format
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, format: "pdf" }))}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                filters.format === "pdf"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <FileText
                className={`h-5 w-5 ${
                  filters.format === "pdf"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
              <div>
                <p className="text-sm font-medium">PDF</p>
                <p className="text-[11px] text-muted-foreground">
                  Printable report
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Orientation (PDF only) */}
        {filters.format === "pdf" && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Page layout
            </label>
            <div className="flex gap-1.5">
              <ToggleChip
                label="Landscape"
                selected={filters.orientation === "landscape"}
                onClick={() =>
                  setFilters((f) => ({ ...f, orientation: "landscape" }))
                }
              />
              <ToggleChip
                label="Portrait"
                selected={filters.orientation === "portrait"}
                onClick={() =>
                  setFilters((f) => ({ ...f, orientation: "portrait" }))
                }
              />
            </div>
          </div>
        )}

        {/* Template */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Template
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((tpl) => {
              const Icon = TEMPLATE_ICONS[tpl.id];
              const selected = filters.template === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({ ...f, template: tpl.id }))
                  }
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      selected ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tpl.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {tpl.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">
            <X className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting
              ? "Exporting..."
              : `Export ${filters.format.toUpperCase()}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
