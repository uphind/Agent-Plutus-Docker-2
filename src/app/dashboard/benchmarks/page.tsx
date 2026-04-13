"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Lock } from "lucide-react";

export default function BenchmarksPage() {
  return (
    <div>
      <Header
        title="Benchmarks"
        description="Compare your AI usage against industry peers"
      />

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">Coming Soon</h2>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Industry benchmarks will be available once we have enough anonymized data from
            participating organizations to provide meaningful comparisons for your company size.
          </p>
          <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Cost per developer, acceptance rates, provider mix, and more</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
