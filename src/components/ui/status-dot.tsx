import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "healthy" | "caution" | "warning" | "over_budget" | "no_budget";
  className?: string;
  withLabel?: boolean;
}

const STATUS_CONFIG: Record<string, { hex: string; label: string }> = {
  healthy: { hex: "#10b981", label: "On Track" },
  caution: { hex: "#eab308", label: "Halfway Through" },
  warning: { hex: "#f59e0b", label: "Approaching Limit" },
  over_budget: { hex: "#ef4444", label: "Over Budget" },
  no_budget: { hex: "#d1d5db", label: "No Budget Set" },
};

export function StatusDot({ status, className, withLabel }: StatusDotProps) {
  const conf = STATUS_CONFIG[status] ?? STATUS_CONFIG.healthy;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn("h-2 w-2 rounded-full shrink-0", status === "over_budget" && "animate-pulse")}
        style={{ backgroundColor: conf.hex }}
      />
      {withLabel && <span className="text-xs text-muted-foreground">{conf.label}</span>}
    </span>
  );
}
