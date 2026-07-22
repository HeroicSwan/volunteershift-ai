"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleGauge,
  ClipboardCheck,
  Clock3,
  Download,
  HandHeart,
  MapPin,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useVolunteerMatcherData } from "@/components/data-provider";
import { AiAssistantSections } from "@/components/results/ai-assistant-sections";
import { ScheduleCalendar } from "@/components/results/schedule-calendar";
import { WorkerTypeBadge } from "@/components/worker-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { csvExportFilename, downloadCsv, scheduleToCsv } from "@/lib/csv";
import {
  getCoverageRiskLevel,
  getCoverageMetrics,
  getAssignmentDurationHours,
  getFairnessStats,
  getLaborCostStats,
  getShiftMinimumCoverage,
  getUncoveredShifts,
} from "@/lib/scheduler";
import { cn, formatDate, formatTime } from "@/lib/utils";
import type { CoverageRiskLevel } from "@/types";

const RISK_ORDER: Record<CoverageRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const RISK_BADGES: Record<CoverageRiskLevel, { label: string; className: string } | null> = {
  low: null,
  medium: { label: "Watch", className: "bg-ochre/25 text-ink" },
  high: { label: "High risk", className: "bg-terracotta/20 text-terracotta-dark" },
  critical: { label: "Critical", className: "bg-terracotta-dark text-sand" },
};

function RiskBadge({ level }: { level: CoverageRiskLevel }) {
  const config = RISK_BADGES[level];
  if (!config) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        config.className,
      )}
    >
      <AlertTriangle size={12} /> {config.label}
    </span>
  );
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function ResultsPage() {
  const {
    assignments,
    shifts,
    workers,
    scheduleGeneratedAt,
    scheduleGenerationSource,
    scheduleGenerationWarning,
    scheduleProposalCoverage,
    hydrated,
  } = useVolunteerMatcherData();

  if (!hydrated) {
    return <PageLoading label="Loading schedule results" />;
  }

  if (!scheduleGeneratedAt) {
    return (
      <div className="space-y-7">
        <PageHeader
          title="Results"
          description="Review assigned shifts, coverage gaps, labor cost, match quality, and workload distribution."
        />
        <EmptyState
          icon={ClipboardCheck}
          title="No schedule generated yet"
          description="Generate a schedule to see assignments, staffing coverage, estimated labor cost, and fairness statistics."
          action={
            <Link href="/generate" className={buttonStyles("primary")}>
              <Sparkles size={17} /> Generate schedule
            </Link>
          }
        />
      </div>
    );
  }

  const coverageGaps = getUncoveredShifts(shifts, assignments);
  const partiallyCovered = coverageGaps.filter((gap) => gap.status === "partial");
  const uncovered = coverageGaps.filter((gap) => gap.status === "uncovered");
  const fairness = getFairnessStats(workers, assignments);
  const laborCost = getLaborCostStats(shifts, assignments);
  const risks = shifts.map((shift) => getCoverageRiskLevel(shift, assignments));
  const riskByShiftId = new Map(risks.map((risk) => [risk.shift.id, risk]));
  const riskyShifts = risks
    .filter((risk) => risk.level !== "low")
    .sort(
      (a, b) =>
        RISK_ORDER[b.level] - RISK_ORDER[a.level] ||
        a.shift.date.localeCompare(b.shift.date) ||
        a.shift.startTime.localeCompare(b.shift.startTime),
    );

  const coverage = getCoverageMetrics(shifts, assignments);
  const coverageRate = coverage.coverageRate;
  const scheduledHours = assignments.reduce(
    (sum, assignment) => sum + getAssignmentDurationHours(assignment),
    0,
  );
  const fullyCovered = shifts.length - coverageGaps.length;
  const averageScore = assignments.length
    ? Math.round(assignments.reduce((sum, assignment) => sum + assignment.matchScore, 0) / assignments.length)
    : 0;
  const dateGroups = [...new Set(assignments.map((assignment) => assignment.shift.date))].sort();

  const supervisorAssignments = assignments.filter((item) => item.workerType === "supervisor").length;
  const paidEmployeeAssignments = assignments.filter((item) => item.workerType === "paid_employee").length;
  const volunteerAssignments = assignments.filter((item) => item.workerType === "volunteer").length;
  const supervisorShifts = shifts.filter((shift) => shift.requiresSupervisor);
  const supervisorCovered = supervisorShifts.filter(
    (shift) => assignments.filter((item) => item.shiftId === shift.id && item.workerType === "supervisor").length >=
      (shift.requiredSupervisors ?? 1),
  ).length;
  const minPaidShifts = shifts.filter((shift) => shift.minPaidStaff !== undefined);
  const minPaidMet = minPaidShifts.filter(
    (shift) => !riskByShiftId.get(shift.id)?.reasons.some((reason) => reason.includes("minimum paid staff")),
  ).length;
  const volunteerShare = assignments.length
    ? Math.round((volunteerAssignments / assignments.length) * 100)
    : 0;
  const costliestShifts = laborCost.shifts
    .filter((item) => item.paidAssignments > 0)
    .sort((a, b) => b.estimatedCost - a.estimatedCost)
    .slice(0, 4);

  const staffingMixRows = [
    {
      label: "Supervisors",
      icon: ShieldCheck,
      count: supervisorAssignments,
      detail: supervisorShifts.length
        ? `${supervisorCovered} of ${supervisorShifts.length} supervisor-required shifts covered`
        : "No shifts require a supervisor",
      ok: supervisorCovered === supervisorShifts.length,
    },
    {
      label: "Paid employees",
      icon: Wallet,
      count: paidEmployeeAssignments,
      detail: minPaidShifts.length
        ? `${minPaidMet} of ${minPaidShifts.length} paid staffing minimums met`
        : "No paid staffing minimums set",
      ok: minPaidMet === minPaidShifts.length,
    },
    {
      label: "Volunteers",
      icon: HandHeart,
      count: volunteerAssignments,
      detail: `${volunteerShare}% of all coverage`,
      ok: true,
    },
  ];

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        title="Schedule Results"
        description={`Generated ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(scheduleGeneratedAt))} by ${scheduleGenerationSource === "openai" ? "the AI planner" : "the deterministic safety fallback"}. Review every assignment before sharing the schedule.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => downloadCsv(csvExportFilename("schedule"), scheduleToCsv(assignments))}
              disabled={assignments.length === 0}
            >
              <Download size={16} /> Export CSV
            </Button>
            <Link href="/generate" className={buttonStyles("secondary")}>
              <RefreshCw size={16} /> Regenerate
            </Link>
          </div>
        }
      />

      {scheduleGenerationWarning && (
        <Card className="border-ochre/40 bg-ochre/10 p-4 text-sm text-ink">
          <p className="font-semibold">
            {scheduleGenerationSource === "openai" ? "AI proposals completed by safety scheduler" : "Deterministic safety scheduler used"}
          </p>
          <p className="mt-1 text-ink-soft">{scheduleGenerationWarning}</p>
        </Card>
      )}

      {scheduleProposalCoverage && scheduleGenerationSource === "openai" && (
        <Card className="border-sage/40 bg-sage/10 p-4 text-sm text-ink">
          <p className="font-semibold">AI proposal coverage: {scheduleProposalCoverage.coveragePercent}%</p>
          <p className="mt-1 text-ink-soft">
            Ollama proposed {scheduleProposalCoverage.proposed} of {scheduleProposalCoverage.requested} requested positions across {scheduleProposalCoverage.batches} batch{scheduleProposalCoverage.batches === 1 ? "" : "es"}.
            {scheduleProposalCoverage.retries ? " " + scheduleProposalCoverage.retries + " repair " + (scheduleProposalCoverage.retries === 1 ? "attempt was" : "attempts were") + " made." : ""}
            {" "}The deterministic safety layer validated and completed the schedule.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CircleGauge size={20} className="text-moss" />
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Coverage overview</h2>
            </div>
            <p className="mt-2 text-sm text-ink-soft">{coverage.coveredWorkerHours} of {coverage.requiredWorkerHours} worker-hours covered.</p>
          </div>
          <p className="text-5xl font-semibold tracking-[-0.06em] text-ink">{coverageRate}%</p>
        </div>

        <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-terracotta/25" aria-label={`${coverageRate}% of required worker-hours covered`}>
          {coverage.requiredWorkerHours > 0 && (
            <div className="graph-reveal-x flex h-full w-full">
              <span className="bg-moss" style={{ width: `${coverageRate}%` }} />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-soft">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-moss" /> Covered worker-hours</span>
          {coverageRate < 100 ? (
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-terracotta" /> Coverage still needed</span>
          ) : (
            <span className="flex items-center gap-1.5 text-moss"><CheckCircle2 size={13} /> All staffing requirements filled</span>
          )}
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: "Scheduled hours", value: scheduledHours, icon: UserRoundCheck },
            { label: "Fully covered shifts", value: fullyCovered, icon: CheckCircle2 },
            { label: "Coverage gaps", value: coverageGaps.length, icon: AlertTriangle },
            { label: "Average match", value: `${averageScore}%`, icon: Scale },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-3xl bg-sage/15 p-4">
              <Icon size={18} className="text-moss" />
              <p className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-ink">{value}</p>
              <p className="mt-1 text-xs text-ink-soft">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {assignments.length > 0 && <ScheduleCalendar assignments={assignments} />}

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Staffing mix and labor cost">
        <Card className="p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <UsersRound size={19} className="text-moss" />
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Staffing mix</h2>
          </div>
          <p className="mt-2 text-sm text-ink-soft">Who is covering this schedule, and whether staffing rules are met.</p>

          {assignments.length > 0 && (
            <>
              <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-sage/20" aria-label="Assignments by worker type">
                <div className="graph-reveal-x flex h-full w-full">
                  <span className="bg-moss" style={{ width: `${(supervisorAssignments / assignments.length) * 100}%` }} />
                  <span className="bg-ochre" style={{ width: `${(paidEmployeeAssignments / assignments.length) * 100}%` }} />
                  <span className="bg-sage" style={{ width: `${(volunteerAssignments / assignments.length) * 100}%` }} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-soft">
                <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-moss" /> Supervisors</span>
                <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ochre" /> Paid employees</span>
                <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-sage" /> Volunteers</span>
              </div>
            </>
          )}

          <div className="mt-6 space-y-3">
            {staffingMixRows.map(({ label, icon: Icon, count, detail, ok }) => (
              <div key={label} className="flex items-center gap-3.5 rounded-3xl bg-sage/10 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sage/25 text-moss">
                  <Icon size={19} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{label}</p>
                  <p className={cn("mt-0.5 text-xs", ok ? "text-ink-soft" : "font-semibold text-terracotta-dark")}>
                    {detail}
                  </p>
                </div>
                <p className="text-xl font-semibold tracking-[-0.03em] text-ink">{count}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <Wallet size={19} className="text-moss" />
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Estimated labor cost</h2>
          </div>
          <p className="mt-2 text-sm text-ink-soft">Paid hours across this schedule. Volunteers add no cost.</p>

          <p className="mt-6 text-5xl font-semibold tracking-[-0.06em] text-ink">{formatCurrency(laborCost.totalEstimatedCost)}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {laborCost.paidAssignments} paid assignment{laborCost.paidAssignments === 1 ? "" : "s"} · {laborCost.volunteerAssignments} volunteer assignment{laborCost.volunteerAssignments === 1 ? "" : "s"} at no cost
          </p>

          {laborCost.missingRates > 0 && (
            <p className="mt-4 flex gap-2 rounded-2xl bg-ochre/15 px-3.5 py-2.5 text-xs leading-5 text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ochre" />
              {laborCost.missingRates} paid assignment{laborCost.missingRates === 1 ? " has" : "s have"} no hourly rate on file and {laborCost.missingRates === 1 ? "is" : "are"} excluded from this estimate.
            </p>
          )}

          {costliestShifts.length > 0 && (
            <div className="mt-6 space-y-2.5 border-t border-moss/10 pt-5">
              {costliestShifts.map(({ shift, estimatedCost, paidAssignments }) => (
                <div key={shift.id} className="flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{shift.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {formatDate(shift.date, { weekday: "short", year: undefined })} · {paidAssignments} paid
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-ink">{formatCurrency(estimatedCost)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {riskyShifts.length > 0 && (
        <Card className="p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <AlertTriangle size={19} className="text-terracotta-dark" />
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Shifts needing attention</h2>
            <Badge tone="clay" className="ml-auto">{riskyShifts.length}</Badge>
          </div>
          <div className="mt-5 space-y-3">
            {riskyShifts.map(({ shift, level, reasons }) => (
              <div key={shift.id} className="rounded-3xl bg-sand/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge level={level} />
                  <p className="text-sm font-semibold text-ink">{shift.title}</p>
                  <p className="text-xs text-ink-soft">
                    {formatDate(shift.date, { weekday: "short", year: undefined })} · {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
                  </p>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-soft">{reasons.join(" · ")}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <AiAssistantSections
        key={scheduleGeneratedAt}
        input={{ workers, shifts, assignments, scheduleGeneratedAt }}
      />

      <section className="space-y-4" aria-labelledby="assigned-schedule-heading">
        <div>
          <h2 id="assigned-schedule-heading" className="text-xl font-semibold tracking-[-0.03em] text-ink">Assigned schedule</h2>
          <p className="mt-1 text-sm text-ink-soft">Assignments are grouped by date and shift.</p>
        </div>

        {dateGroups.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No eligible assignments"
            description="Every shift remains uncovered because no worker met its availability, role, capacity, and conflict constraints."
          />
        ) : (
          dateGroups.map((date) => {
            const dateAssignments = assignments.filter((assignment) => assignment.shift.date === date);
            const dateShifts = [...new Map(dateAssignments.map((assignment) => [assignment.shiftId, assignment.shift])).values()]
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <Card key={date} className="overflow-hidden">
                <div className="flex items-center gap-3 border-b border-moss/10 bg-moss px-5 py-4 text-sand sm:px-7">
                  <CalendarDays size={19} />
                  <h3 className="font-semibold">{formatDate(date, { weekday: "long" })}</h3>
                  <Badge tone="sage" className="ml-auto">{dateAssignments.length} assigned</Badge>
                </div>
                <div className="divide-y divide-moss/10">
                  {dateShifts.map((shift) => {
                    const shiftAssignments = dateAssignments.filter((assignment) => assignment.shiftId === shift.id);
                    const risk = riskByShiftId.get(shift.id);
                    return (
                      <div key={shift.id} className="p-5 sm:p-7">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-ink">{shift.title}</h4>
                              <Badge tone={getShiftMinimumCoverage(shift, assignments) >= shift.requiredWorkers ? "moss" : "oat"}>
                                {getShiftMinimumCoverage(shift, assignments)}/{shift.requiredWorkers} minimum coverage
                              </Badge>
                              {risk && <RiskBadge level={risk.level} />}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                              <span className="flex items-center gap-1.5"><Clock3 size={13} />{formatTime(shift.startTime)}–{formatTime(shift.endTime)}</span>
                              <span className="flex items-center gap-1.5"><MapPin size={13} />{shift.location}</span>
                            </div>
                          </div>
                          <Badge tone="sage">{shift.requiredRole}</Badge>
                        </div>

                        <div className="mt-5 grid gap-3 lg:grid-cols-2">
                          {shiftAssignments.map((assignment) => (
                            <div key={assignment.workerId} className="rounded-3xl border border-moss/10 bg-sage/10 p-4">
                              <div className="flex items-center gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sage/30 text-[11px] font-bold text-moss">
                                  {assignment.worker.name.split(" ").map((part) => part[0]).join("")}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-ink">{assignment.worker.name}</p>
                                  <p className="mt-0.5 text-xs text-ink-soft">{assignment.worker.email}</p>
                                </div>
                                <Badge tone="moss">{assignment.matchScore}% match</Badge>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <WorkerTypeBadge workerType={assignment.workerType} />
                                <Badge tone="sage">{formatTime(assignment.startTime)}–{formatTime(assignment.endTime)}</Badge>
                                {assignment.estimatedCost !== undefined && (
                                  <Badge tone="oat">est. {formatCurrency(assignment.estimatedCost)}</Badge>
                                )}
                              </div>
                              <ul className="mt-4 space-y-1.5">
                                {assignment.reasons.map((reason) => (
                                  <li key={reason} className="flex gap-2 text-xs leading-5 text-ink-soft">
                                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-moss" /> {reason}
                                  </li>
                                ))}
                              </ul>
                              {assignment.warnings.map((warning) => (
                                <p key={warning} className="mt-3 flex gap-2 rounded-2xl bg-ochre/15 px-3 py-2 text-xs leading-5 text-ink">
                                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ochre" /> {warning}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Coverage gaps">
        <Card className="p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <AlertTriangle size={19} className="text-ochre" />
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Partially covered</h2>
            <Badge tone="oat" className="ml-auto">{partiallyCovered.length}</Badge>
          </div>
          {partiallyCovered.length === 0 ? (
            <p className="mt-5 text-sm text-ink-soft">No shifts are partially covered.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {partiallyCovered.map((gap) => (
                <div key={gap.shift.id} className="rounded-3xl bg-sage/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{gap.shift.title}</p>
                      <p className="mt-1 text-xs text-ink-soft">{formatDate(gap.shift.date, { weekday: "short", year: undefined })} · {gap.shift.requiredRole}</p>
                    </div>
                    <Badge tone="oat">{gap.assignedCount}/{gap.requiredCount} filled</Badge>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-terracotta-dark">Needs {gap.missingWorkers} more worker{gap.missingWorkers === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <AlertTriangle size={19} className="text-terracotta-dark" />
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Uncovered shifts</h2>
            <Badge tone="clay" className="ml-auto">{uncovered.length}</Badge>
          </div>
          {uncovered.length === 0 ? (
            <p className="mt-5 text-sm text-ink-soft">No shifts are fully uncovered.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {uncovered.map((gap) => (
                <div key={gap.shift.id} className="rounded-3xl bg-terracotta/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{gap.shift.title}</p>
                      <p className="mt-1 text-xs text-ink-soft">{formatDate(gap.shift.date, { weekday: "short", year: undefined })} · {gap.shift.requiredRole}</p>
                    </div>
                    <Badge tone="clay">0/{gap.requiredCount} filled</Badge>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-terracotta-dark">Needs {gap.missingWorkers} worker{gap.missingWorkers === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Scale size={19} className="text-moss" />
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Fairness stats</h2>
            </div>
            <p className="mt-2 text-sm text-ink-soft">Assigned workload across the full team roster.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="sage">{fairness.averageAssignments} average</Badge>
            <Badge tone="oat">{fairness.assignmentSpread} shift spread</Badge>
          </div>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {fairness.workers.map((stat, index) => (
            <div key={stat.worker.id} className="rounded-3xl bg-sage/10 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-sage/25 text-[11px] font-bold text-moss">
                  {stat.worker.name.split(" ").map((part) => part[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{stat.worker.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {stat.assignedHours}h assigned · {stat.desiredHoursPerWeek}h desired · {stat.maxHoursPerWeek}h max
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink">{stat.assignedShifts} assigned</p>
              </div>
              <div className="mt-3 h-2 rounded-full bg-sage/20">
                <div
                  className="graph-reveal-x h-full rounded-full bg-moss"
                  style={{ width: `${Math.min(stat.utilizationRate, 100)}%`, animationDelay: `${index * 45}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
