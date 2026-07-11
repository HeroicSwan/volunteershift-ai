"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
    title: "Fill priority shifts first",
    description: "Urgent and high-priority shifts are staffed before normal and low-priority work.",
  },
  {
    title: "Honor staffing rules",
    description: "Required supervisors and minimum paid staffing are assigned before the remaining spots.",
  },
  {
    title: "Score every match",
    description: "Availability, role fit, preferences, reliability, and current workload feed a 0–100 score.",
  },
  {
    title: "Balance people and cost",
    description: "Desired hours guide fairness, maximum hours prevent overtime, and volunteers receive shorter blocks.",
  },
];

export default function GeneratePage() {
  const router = useRouter();
  const { workers, shifts, assignments, scheduleGeneratedAt, hydrated, generateSchedule } = useVolunteerMatcherData();
  const hasData = workers.length > 0 && shifts.length > 0;
  const requiredWorkerHours = getCoverageMetrics(shifts, []).requiredWorkerHours;

  if (!hydrated) {
    return <PageLoading label="Loading schedule generator" />;
  }

  function handleGenerate() {
    generateSchedule();
    router.push("/results");
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Generate Schedule"
        description="Build a deterministic staffing plan from availability, qualifications, preferences, and weekly limits."
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
                <Badge tone="oat">Deterministic matching</Badge>
              </div>
              <h2 className="mt-7 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-4xl">
                Turn availability into a balanced staffing plan.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft sm:text-base">
                The solver creates staggered start and end times, keeps paid shifts at eight hours or less, and treats weekly maximums as hard limits.
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
                <Button onClick={handleGenerate}>
                  {scheduleGeneratedAt ? <RefreshCw size={17} /> : <Sparkles size={17} />}
                  {scheduleGeneratedAt ? "Regenerate schedule" : "Generate schedule"}
                </Button>
                {scheduleGeneratedAt && (
                  <Link href="/results" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-moss hover:text-terracotta">
                    View {assignments.length} assignments <ArrowRight size={15} />
                  </Link>
                )}
              </div>
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
                <Check size={16} /> Same inputs, same schedule
              </div>
              <p className="mt-2 text-xs leading-5 text-sand/80">
                Stable tie-breakers keep every run reproducible and easy to audit.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
