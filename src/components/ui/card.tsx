import { cn } from "@/lib/utils";
import { InfoTooltip } from "./info-tooltip";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
}

export function Card({ className, children, hoverable, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-shadow",
        hoverable && "hover:shadow-md cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div className={cn("px-6 py-4 border-b border-border", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  tooltip,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { tooltip?: string }) {
  return (
    <h3 className={cn("text-sm font-semibold text-foreground", className)} {...props}>
      {children}
      {tooltip && <InfoTooltip text={tooltip} className="ml-1.5" />}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div className={cn("px-6 py-4", className)} {...props}>
      {children}
    </div>
  );
}
