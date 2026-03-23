import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SuggestionsPage() {
  return (
    <div className="space-y-6">
      <Header
        title="Suggestions"
        description="AI-powered cost optimization recommendations"
        action={<Badge variant="secondary">Coming Soon</Badge>}
      />

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6">
            <Lightbulb className="h-8 w-8 text-indigo-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Smart Suggestions are on the way
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            We&apos;re building intelligent recommendations to help you optimize token usage,
            reduce costs, and pick the best models for your workloads. Stay tuned.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
