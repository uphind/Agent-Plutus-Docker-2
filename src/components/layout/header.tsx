"use client";

import { InfoTooltip } from "@/components/ui/info-tooltip";

interface HeaderProps {
  title: string;
  description?: string;
  tooltip?: string;
  action?: React.ReactNode;
}

export function Header({ title, description, tooltip, action }: HeaderProps) {
  return (
    <div className="flex items-start justify-between pb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          {title}
          {tooltip && <InfoTooltip text={tooltip} className="ml-2" iconSize={16} />}
        </h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
