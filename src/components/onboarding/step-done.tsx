"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CheckCircle, RefreshCw, Plug, BarChart3 } from "lucide-react";
export function StepDone({
  variant = "full",
  onFinish,
}: {
  variant?: "full" | "add-provider";
  onFinish: () => void;
}) {
  const compact = variant === "add-provider";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <CardTitle>{compact ? "Provider added" : "You're set up"}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {compact
            ? "Credential saved and mappings confirmed. You can close this dialog — your providers list will refresh."
            : "Nice — your provider credential is saved and field mappings are confirmed. Usage will start syncing on your configured interval (next run within the hour)."}
        </p>

        {!compact && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Link href="/dashboard" className="block">
              <div className="rounded-md border border-border hover:border-muted-foreground/40 p-3 text-sm transition-colors">
                <BarChart3 className="h-4 w-4 text-muted-foreground mb-1.5" />
                <p className="font-medium">View dashboard</p>
                <p className="text-[11px] text-muted-foreground">See your spend roll up over the next sync.</p>
              </div>
            </Link>
            <Link href="/dashboard/settings" className="block">
              <div className="rounded-md border border-border hover:border-muted-foreground/40 p-3 text-sm transition-colors">
                <Plug className="h-4 w-4 text-muted-foreground mb-1.5" />
                <p className="font-medium">Manage providers</p>
                <p className="text-[11px] text-muted-foreground">Add more provider keys or change sync settings.</p>
              </div>
            </Link>
            <Link href="/dashboard/settings?tab=ai-assistant" className="block">
              <div className="rounded-md border border-border hover:border-muted-foreground/40 p-3 text-sm transition-colors">
                <RefreshCw className="h-4 w-4 text-muted-foreground mb-1.5" />
                <p className="font-medium">Tweak AI Assistant</p>
                <p className="text-[11px] text-muted-foreground">Update the chatbot or AI Tools key whenever.</p>
              </div>
            </Link>
          </div>
        )}

        <div className="flex items-center justify-end pt-2 border-t border-border">
          <Button onClick={onFinish}>{compact ? "Done" : "Finish"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
