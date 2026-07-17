"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleGauge,
  ClipboardCheck,
  HandHeart,
  MapPin,
  Scale,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useVolunteerMatcherData } from "@/components/data-provider";
import { SeedDataButton } from "@/components/seed-data-button";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { getCoverageMetrics, getShiftMinimumCoverage, getUncoveredShifts } from "@/lib/scheduler";
import { cn, formatDate, formatTime, toLocalIsoDate } from "@/lib/utils";
import { DAYS } from "@/types";

const priorityTone = {
  Urgent: "clay",
  High: "clay",
  Normal: "sage",
  Low: "oat",
} as const;

const howItWorks = [
  {
    title: "Add your team",
    description: "Record roles, availability, preferred days, and a fair weekly shift limit.",
  },
  {
    title: "Define each shift",
    description: "Set the time, location, required role, staffing target, and priority.",
  },
  {
    title: "Generate a plan",
    description: "The scheduler fills urgent work first, then scores every eligible match.",
  },
  {
    title: "Review and coordinate",
    description: "Resolve coverage gaps, export the schedule, and copy reminder drafts.",
  },
];

export default function DashboardPage() {
  const { workers, shifts, assignments, scheduleGeneratedAt, hydrated } = useVolunteerMatcherData();

  if (!hydrated) return <PageLoading label="Loading dashboard" />;

  const hasData = workers.length > 0 || shifts.length > 0;
  const hasSchedule = Boolean(scheduleGeneratedAt);
  const today = toLocalIsoDate(new Date());
  const assignedCount = (shiftId: string) => {
    const shift = shifts.find((item) => item.id === shiftId);
    return shift ? getShiftMinimumCoverage(shift, assignments) : 0;
  };
  const coverage = getCoverageMetrics(shifts, assignments);
  const coveragePercentage = coverage.coverageRate;
  const coverageGaps = hasSchedule ? getUncoveredShifts(shifts, assignments) : [];
  const uncoveredCount = coverageGaps.filter((gap) => gap.status === "uncovered").length;
  const averageScore = assignments.length
    ? Math.round(assignments.reduce((sum, assignment) => sum + assignment.matchScore, 0) / assignments.length)
    : 0;
  const volunteerCount = workers.filter((worker) => worker.workerType === "volunteer").length;
  const upcomingShifts = [...shifts]
    .filter((shift) => shift.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const uniqueRoles = [...new Set(shifts.map((shift) => shift.requiredRole))].sort();
  const demandByDay = DAYS.map((day) => {
    const dayShifts = shifts.filter(
      (shift) =>
        new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
          new Date(`${shift.date}T12:00:00`),
        ) === day,
    );
    const required = dayShifts.reduce((sum, shift) => sum + shift.requiredWorkers, 0);
    const filled = hasSchedule
      ? dayShifts.reduce(
          (sum, shift) => sum + Math.min(getShiftMinimumCoverage(shift, assignments), shift.requiredWorkers),
          0,
        )
      : 0;
    return { day, required, filled };
  });
  const maxDemand = Math.max(...demandByDay.map(({ required }) => required), 1);
  const requiredPositions = demandByDay.reduce((sum, day) => sum + day.required, 0);
  const filledPositions = demandByDay.reduce((sum, day) => sum + day.filled, 0);
  const stats = [
    {
      label: "Total volunteers",
      value: volunteerCount,
      note: workers.length === volunteerCount ? "community team members" : `${workers.length - volunteerCount} paid staff or leads`,
      icon: HandHeart,
    },
    { label: "Total shifts", value: shifts.length, note: `${coverage.requiredWorkerHours} worker-hours required`, icon: CalendarDays },
    {
      label: "Coverage",
      value: hasSchedule ? `${coveragePercentage}%` : "—",
      note: hasSchedule ? `${coverage.coveredWorkerHours} of ${coverage.requiredWorkerHours} worker-hours covered` : "generate a schedule to measure",
      icon: CircleGauge,
    },
    {
      label: "Uncovered shifts",
      value: hasSchedule ? uncoveredCount : "—",
      note: hasSchedule ? `${coverageGaps.length} total coverage gaps` : "not evaluated yet",
      icon: ClipboardCheck,
    },
    {
      label: "Average match",
      value: hasSchedule ? `${averageScore}%` : "—",
      note: hasSchedule ? "across assigned workers" : "not scored yet",
      icon: Scale,
    },
  ];

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        title="Dashboard"
        description="Plan reliable nonprofit coverage, understand staffing gaps, and keep workloads fair."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            {hasData && <SeedDataButton variant="secondary" />}
            <Link href="/generate" className={buttonStyles("primary")}>
              <Sparkles size={17} /> Generate schedule
            </Link>
          </div>
        }
      />

      <Card className="overflow-hidden border-moss/25 !bg-moss text-sand">
        <div className="grid lg:grid-cols-[1.4fr_0.6fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sand/80">Volunteer coordination, made practical</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">
              Build a schedule your team can trust.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-sand/80 sm:text-base">
              Match people to the work they can do, protect weekly limits, and see every uncovered spot before the week begins.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {hasData ? (
                <Link href="/generate" className={buttonStyles("primary")}>
                  <Sparkles size={17} /> {hasSchedule ? "Refresh schedule" : "Create this week’s schedule"}
                </Link>
              ) : (
                <SeedDataButton />
              )}
              <Link
                href="/workers"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-sand/25 px-4 text-sm font-semibold text-sand hover:bg-sand/10"
              >
                Manage team <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="border-t border-sand/15 bg-sand/10 p-6 sm:p-8 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sand/80">Workspace status</p>
            <dl className="mt-6 space-y-5">
              <div className="flex items-end justify-between gap-4 border-b border-sand/15 pb-4">
                <dt className="text-sm text-sand/80">Team profiles</dt>
                <dd className="text-2xl font-semibold">{workers.length}</dd>
              </div>
              <div className="flex items-end justify-between gap-4 border-b border-sand/15 pb-4">
                <dt className="text-sm text-sand/80">{hasSchedule ? "Worker-hours covered" : "Worker-hours required"}</dt>
                <dd className="text-2xl font-semibold">
                  {hasSchedule ? `${coverage.coveredWorkerHours}/${coverage.requiredWorkerHours}` : coverage.requiredWorkerHours}
                </dd>
              </div>
              <div className="flex items-end justify-between gap-4">
                <dt className="text-sm text-sand/80">Schedule status</dt>
                <dd className="text-right text-sm font-semibold">{hasSchedule ? `${coveragePercentage}% covered` : "Ready when you are"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <section aria-labelledby="impact-heading">
        <div className="mb-4">
          <h2 id="impact-heading" className="text-xl font-semibold tracking-[-0.03em] text-ink">Impact at a glance</h2>
          <p className="mt-1 text-sm text-ink-soft">The numbers coordinators need before confirming a schedule.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {stats.map(({ label, value, icon: Icon, note }) => (
            <Card key={label} className="p-4 last:col-span-2 sm:p-5 xl:last:col-span-1">
              <span className="grid size-10 place-items-center rounded-2xl bg-sage/20 text-moss">
                <Icon size={19} strokeWidth={1.8} />
              </span>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-ink">{value}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{label}</p>
              <p className="mt-1 text-xs leading-5 text-ink-soft">{note}</p>
            </Card>
          ))}
        </div>
      </section>

      {!hasData ? (
        <EmptyState
          icon={UsersRound}
          title="Start with your team and first shift"
          description="Use demo mode to explore a complete sample nonprofit, or build your own workspace one profile at a time."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <SeedDataButton />
              <Link href="/workers" className={buttonStyles("secondary")}>Add your team</Link>
              <Link href="/shifts" className={buttonStyles("secondary")}>Add a shift</Link>
            </div>
          }
        />
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Your team is ready for shifts"
          description="Add the dates, times, locations, and roles you need covered before generating a schedule."
          action={<Link href="/shifts" className={buttonStyles("primary")}>Add a shift</Link>}
        />
      ) : (
        <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]" aria-label="Staffing readiness">
          <Card className="overflow-hidden p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.025em]">{hasSchedule ? "Weekly staffing coverage" : "Weekly staffing demand"}</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {hasSchedule ? "Minimum positions filled by day." : "Required worker positions by day."}
                </p>
              </div>
              <Badge tone={hasSchedule && filledPositions < requiredPositions ? "oat" : "moss"}>
                {hasSchedule ? `${filledPositions}/${requiredPositions} filled` : `${requiredPositions} positions`}
              </Badge>
            </div>
            <div className="mt-8 flex h-48 items-end gap-2 sm:gap-4" aria-label={hasSchedule ? "Worker positions filled by day" : "Worker positions required by day"}>
              {demandByDay.map(({ day, required, filled }, index) => (
                <div key={day} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                  <span className="mb-2 text-xs font-semibold text-ink">
                    {required ? (hasSchedule ? `${filled}/${required}` : required) : "—"}
                  </span>
                  <div className="flex h-32 items-end rounded-2xl bg-sage/15 p-1.5">
                    <div
                      className="graph-reveal-y w-full rounded-xl bg-moss"
                      style={{
                        height: required
                          ? `${Math.max((hasSchedule ? filled / required : required / maxDemand) * 100, 18)}%`
                          : "8%",
                        opacity: required ? 1 : 0.2,
                        animationDelay: `${index * 45}ms`,
                      }}
                    />
                  </div>
                  <span className="mt-2 truncate text-[10px] font-medium text-ink-soft sm:text-xs">{day.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.025em]">Role readiness</h2>
                <p className="mt-1 text-sm text-ink-soft">Qualified people for each required role.</p>
              </div>
              <UsersRound size={20} className="text-moss" />
            </div>
            <div className="mt-7 space-y-5">
              {uniqueRoles.map((role, index) => {
                const eligible = workers.filter((worker) => worker.roles.includes(role)).length;
                const percentage = Math.min((eligible / Math.max(workers.length, 1)) * 100, 100);
                return (
                  <div key={role}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium text-ink">{role}</span>
                      <span className={cn("text-xs font-semibold", eligible > 0 ? "text-ink-soft" : "text-terracotta-dark")}>
                        {eligible} qualified
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-sage/20" aria-label={`${eligible} workers qualified for ${role}`}>
                      <div
                        className={cn("graph-reveal-x h-full rounded-full", eligible > 0 ? "bg-terracotta" : "bg-terracotta-dark")}
                        style={{ width: `${percentage}%`, animationDelay: `${index * 45}ms` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      )}

      {upcomingShifts.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-moss/10 px-5 py-5 sm:px-7">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em]">Upcoming shifts</h2>
              <p className="mt-1 text-sm text-ink-soft">The next commitments on your calendar.</p>
            </div>
            <Link href="/shifts" className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss hover:text-terracotta">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <div className="divide-y divide-moss/10">
            {upcomingShifts.slice(0, 4).map((shift) => (
              <article key={shift.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center sm:px-7">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{shift.title}</h3>
                    <Badge tone={priorityTone[shift.priority]}>{shift.priority}</Badge>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-soft"><MapPin size={13} /> {shift.location}</p>
                </div>
                <div className="text-sm text-ink-soft">
                  <p className="font-medium text-ink">{formatDate(shift.date, { weekday: "short", year: undefined })}</p>
                  <p className="mt-1 text-xs">{formatTime(shift.startTime)}–{formatTime(shift.endTime)}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm font-semibold text-ink">{assignedCount(shift.id)}/{shift.requiredWorkers} assigned</p>
                  <p className="mt-1 text-xs text-ink-soft">{shift.requiredRole}</p>
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}

      <section aria-labelledby="how-it-works-heading">
        <div className="mb-4">
          <h2 id="how-it-works-heading" className="text-xl font-semibold tracking-[-0.03em] text-ink">How it works</h2>
          <p className="mt-1 text-sm text-ink-soft">A transparent workflow from availability to a coordinator-ready plan.</p>
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <Card className="grid gap-px overflow-hidden bg-moss/10 sm:grid-cols-2">
            {howItWorks.map((step, index) => (
              <article key={step.title} className="bg-sand/80 p-5 sm:p-6">
                <span className="grid size-8 place-items-center rounded-full bg-sage/25 text-xs font-bold text-moss">{index + 1}</span>
                <h3 className="mt-4 text-sm font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-ink-soft">{step.description}</p>
              </article>
            ))}
          </Card>
          <Card className="p-5 sm:p-6">
            <Sparkles size={20} className="text-moss" />
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.025em] text-ink">Transparent matching</h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              The deterministic scheduler checks availability, role fit, preferences, weekly limits, and overlapping shifts. It fills urgent and high-priority work first, then balances assignments so one person is not overused.
            </p>
            <p className="mt-4 rounded-2xl bg-sage/15 px-4 py-3 text-xs font-semibold leading-5 text-moss">
              Same inputs, same result. Every match includes a score and plain-language reasons.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
