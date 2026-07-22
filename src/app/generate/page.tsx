"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CalendarCheck, Check, RefreshCw, Sparkles, UsersRound } from "lucide-react";
import { useVolunteerMatcherData } from "@/components/data-provider";
import { SeedDataButton } from "@/components/seed-data-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getCoverageMetrics } from "@/lib/scheduler";

const steps = [
  {
    title: "AI plans the week",
    description: "The model considers priority, availability, preferences, roles, hours, and fairness together.",
  },
  {
    title: "Validate hard rules",
    description: "Every proposed assignment is checked for availability, overlap, role, worker type, and hour limits.",
  },
  {
    title: "Repair safe gaps",
    description: "The production safety engine fills valid gaps and marks anything that cannot be safely covered.",
  },
  {
    title: "Review before sharing",
    description: "Results show the source, warnings, match reasons, and uncovered positions for coordinator approval.",
  },
];

export default function GeneratePage() {
  const router = useRouter();
  const {
    workers,
    shifts,
    assignments,
    scheduleGeneratedAt,
    scheduleGenerationSource,
    scheduleGenerationWarning,
    scheduleProgress,
    hydrated,
    generateSchedule,
    cancelSchedule,
  } = useVolunteerMatcherData();
  const [isGenerating, setIsGenerating] = useState(false);
  const hasData = workers.length > 0 && shifts.length > 0;
  const requiredWorkerHours = getCoverageMetrics(shifts, []).requiredWorkerHours;

  if (!hydrated) {
    return <PageLoading label="Loading schedule generator" />;
  }

  async function handleGenerate() {
    setIsGenerating(true);
    await generateSchedule();
    router.push("/results");
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Generate Schedule"
        description="Ask the AI planner to build a staffing plan, then validate every assignment against availability, roles, hours, and coverage rules."
      />

      {!hasData ? (
        <EmptyState
          icon={Sparkles}
          title="Worker and shift data needed"
          description="Add at least one worker and one shift before generating a schedule."
          action={<SeedDataButton />}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Card className="relative overflow-hidden p-6 sm:p-8">
            <div className="absolute -right-12 -top-14 size-48 rounded-full bg-sage/20" />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="moss">Ready to generate</Badge>
                <Badge tone="oat">AI-assisted planning</Badge>
              </div>
              <h2 className="mt-7 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-4xl">
                Turn availability into a balanced staffing plan.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft sm:text-base">
                The AI planner balances priorities, preferences, hours, and coverage. A deterministic safety pass rejects invalid assignments and fills safe gaps when needed.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl bg-sage/15 p-4">
                  <UsersRound size={19} className="text-moss" />
                  <p className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{workers.length}</p>
                  <p className="mt-1 text-xs text-ink-soft">Workers</p>
                </div>
                <div className="rounded-3xl bg-sage/15 p-4">
                  <CalendarCheck size={19} className="text-moss" />
                  <p className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{shifts.length}</p>
                  <p className="mt-1 text-xs text-ink-soft">Shifts</p>
                </div>
                <div className="rounded-3xl bg-sage/15 p-4">
                  <Sparkles size={19} className="text-moss" />
                  <p className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{requiredWorkerHours}</p>
                  <p className="mt-1 text-xs text-ink-soft">Worker-hours needed</p>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? <RefreshCw className="animate-spin" size={17} /> : scheduleGeneratedAt ? <RefreshCw size={17} /> : <Sparkles size={17} />}
                  {isGenerating ? "Planning schedule…" : scheduleGeneratedAt ? "Regenerate schedule" : "Generate with AI"}
                </Button>
                {isGenerating && (
                  <Button variant="secondary" onClick={() => void cancelSchedule()}>
                    Cancel planning
                  </Button>
                )}
                {scheduleGeneratedAt && (
                  <Link href="/results" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-moss hover:text-terracotta">
                    View {assignments.length} assignments <ArrowRight size={15} />
                  </Link>
                )}
              </div>
              {isGenerating && (
                <p className="mt-3 text-xs text-ink-soft" role="status" aria-live="polite">
                  {scheduleProgress
                    ? "Planning batch " + scheduleProgress.current + " of " + scheduleProgress.total + "…"
                    : "Starting Ollama… This can take several minutes on local hardware."}
                </p>
              )}
              {scheduleGenerationSource && (
                <p className="mt-4 text-xs text-ink-soft">
                  Last run: {scheduleGenerationSource === "openai" ? "AI planner with safety validation" : "deterministic safety fallback"}.
                  {scheduleGenerationWarning ? ` ${scheduleGenerationWarning}` : ""}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-6 sm:p-7">
            <h2 className="text-lg font-semibold tracking-[-0.025em]">How matching works</h2>
            <div className="mt-7 space-y-6">
              {steps.map((step, index) => (
                <div key={step.title} className="flex gap-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sage/25 text-xs font-bold text-moss">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-ink-soft">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-7 rounded-3xl bg-moss p-5 text-sand">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Check size={16} /> AI proposes, rules verify
              </div>
              <p className="mt-2 text-xs leading-5 text-sand/80">
                The model chooses the plan; hard constraints prevent unavailable, overlapping, unqualified, or overtime assignments from being saved.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
