"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plug, Bot, Wrench } from "lucide-react";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Let&apos;s get you set up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          A few steps to wire Agent-Plutus into your AI providers and turn on the in-app
          assistant. Most steps are optional — you can always come back to this wizard from
          Settings → AI Assistant.
        </p>

        <ul className="space-y-3 text-sm">
          <Bullet
            Icon={Bot}
            title="Configure the chatbot (optional)"
            body="Pick a model and paste a key. Powers the floating assistant in the bottom-right corner."
          />
          <Bullet
            Icon={Wrench}
            title="Configure AI Tools (optional)"
            body="A separately-stored, server-encrypted key that powers in-app helpers like AI-assisted field mapping."
          />
          <Bullet
            Icon={Plug}
            title="Connect your first provider"
            body="Paste any provider API key and Discovery will figure out which one it is and what data is reachable."
          />
          <Bullet
            Icon={Sparkles}
            title="Confirm field mapping"
            body="Review the auto-applied preset (and AI suggestions if AI Tools is set) so usage syncs into Agent-Plutus's schema."
          />
        </ul>

        <div className="flex justify-end pt-2">
          <Button onClick={onNext}>Get started</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Bullet({
  Icon,
  title,
  body,
}: {
  Icon: typeof Sparkles;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-1.5 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}
