import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleGauge,
  Clock3,
  FlaskConical,
  Scale,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import type { EvaluationReport, ValidationIssue } from "../../../../evals/schema";

type AdversarialDashboardReport = {
  generatedAt: string;
  phase: "baseline" | "final";
  caseReport: EvaluationReport;
  properties: { passed: number; total: number; failed: number; seedRange: [number, number] };
  hostileInputs: { passed: number; total: number; failed: number };
  mutations: { killed: number; total: number; survived: number; score: number };
  performance: Array<{ id: string; workers: number; shifts: number; runtimeMs: number; heapDeltaMb: number; timedOut: boolean; error?: string }>;
  repeatability: { runs: number; deterministic: boolean; idempotentWithExistingAssignments: boolean; uniqueSignatures: number };
  summary: { passed: boolean; performanceTimeouts: number };
};

async function readLatestReport() {
  try {
    const source = await readFile(join(process.cwd(), "evals", "reports", "latest.json"), "utf8");
    return JSON.parse(source) as EvaluationReport;
  } catch {
    return undefined;
  }
}

async function readAdversarialReport() {
  try {
    const source = await readFile(join(process.cwd(), "evals", "reports", "adversarial-latest.json"), "utf8");
    return JSON.parse(source) as AdversarialDashboardReport;
  } catch {
    return undefined;
  }
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "sage",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CircleGauge;
  tone?: "sage" | "clay";
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-ink-soft">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-ink">{value}</p>
          <p className="mt-2 text-xs leading-5 text-ink-soft">{detail}</p>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", tone === "clay" ? "bg-terracotta/15 text-terracotta-dark" : "bg-sage/25 text-moss")}>
          <Icon size={19} strokeWidth={1.8} />
        </span>
      </div>
    </Card>
  );
}

function QualityBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs font-semibold">
        <span>{label}</span>
        <span className="tabular-nums text-ink-soft">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-oat/70" aria-hidden="true">
        <div className="graph-reveal-x h-full rounded-full bg-moss" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function IssueDetail({ issue }: { issue: ValidationIssue }) {
  return (
    <li className="rounded-2xl border border-moss/10 bg-oat/35 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={issue.severity === "hard" ? "clay" : "oat"}>{issue.severity}</Badge>
        <code className="text-xs font-semibold text-ink">{issue.code}</code>
        {issue.workerId && <span className="text-xs text-ink-soft">Worker: {issue.workerId}</span>}
        {issue.shiftId && <span className="text-xs text-ink-soft">Shift: {issue.shiftId}</span>}
      </div>
      <p className="mt-3 text-sm leading-6 text-ink">{issue.explanation}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-ink-soft">Expected</dt>
          <dd className="mt-1 break-words text-ink">{JSON.stringify(issue.expected)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-soft">Actual</dt>
          <dd className="mt-1 break-words text-ink">{JSON.stringify(issue.actual)}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function EvaluationsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const adversarial = await readAdversarialReport();
  const report = adversarial?.caseReport ?? await readLatestReport();

  if (!report) {
    return (
      <div className="space-y-7">
        <PageHeader
          title="Scheduler Evaluations"
          description="Development-only quality checks for the deterministic scheduling engine."
        />
        <EmptyState
          icon={FlaskConical}
          title="No evaluation report yet"
          description="Run npm run eval, then refresh this page to inspect the generated report."
        />
      </div>
    );
  }

  const generated = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(report.generatedAt));

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        title="Scheduler Evaluations"
        description="Constraint safety, expected outcomes, and schedule-quality metrics from the latest deterministic evaluation run."
      />

      <Card className="border-terracotta/25 bg-terracotta/10 p-5 sm:p-6" role="note">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-terracotta-dark" size={20} />
          <div>
            <h2 className="text-sm font-semibold text-ink">Evaluation data only</h2>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              These results come from synthetic test scenarios, not live organizational data. This page reads the latest generated report and cannot execute the evaluation runner.
            </p>
          </div>
        </div>
      </Card>

      <section aria-labelledby="evaluation-overview">
        <h2 id="evaluation-overview" className="sr-only">Evaluation overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Overall pass rate" value={`${report.summary.passRate}%`} detail={`${report.summary.passed} of ${report.summary.total} scenarios passed`} icon={CircleGauge} />
          <MetricCard label="Hard violations" value={String(report.summary.hardViolations)} detail="Reported across expected and unexpected cases" icon={ShieldAlert} tone={report.summary.hardViolations > 0 ? "clay" : "sage"} />
          <MetricCard label="Average runtime" value={`${report.summary.averageRuntimeMs} ms`} detail="Production scheduler execution time per case" icon={Clock3} />
          <MetricCard label="Last evaluated" value={generated.split(",")[0]} detail={generated} icon={FlaskConical} />
        </div>
      </section>

      {adversarial && (
        <section aria-labelledby="adversarial-overview" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="adversarial-overview" className="text-xl font-semibold tracking-[-0.03em]">Adversarial reliability suite</h2>
              <p className="mt-1 text-sm text-ink-soft">Randomized invariants, hostile inputs, validator mutations, scale profiles, and repeatability.</p>
            </div>
            <Badge tone={adversarial.summary.passed ? "sage" : "clay"}>{adversarial.phase} · {adversarial.summary.passed ? "Passed" : "Failed"}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Property schedules" value={`${adversarial.properties.passed}/${adversarial.properties.total}`} detail={`Seeds ${adversarial.properties.seedRange[0]}–${adversarial.properties.seedRange[1]}`} icon={FlaskConical} tone={adversarial.properties.failed ? "clay" : "sage"} />
            <MetricCard label="Hostile inputs" value={`${adversarial.hostileInputs.passed}/${adversarial.hostileInputs.total}`} detail="Malformed and unknown-field checks" icon={ShieldAlert} tone={adversarial.hostileInputs.failed ? "clay" : "sage"} />
            <MetricCard label="Mutation score" value={`${adversarial.mutations.score}%`} detail={`${adversarial.mutations.killed} of ${adversarial.mutations.total} corruptions detected`} icon={Scale} tone={adversarial.mutations.survived ? "clay" : "sage"} />
            <MetricCard label="Repeatability" value={adversarial.repeatability.deterministic && adversarial.repeatability.idempotentWithExistingAssignments ? "Stable" : "Unstable"} detail={`${adversarial.repeatability.runs} runs · ${adversarial.repeatability.uniqueSignatures} signature`} icon={Clock3} tone={adversarial.repeatability.deterministic && adversarial.repeatability.idempotentWithExistingAssignments ? "sage" : "clay"} />
          </div>
          <Card className="overflow-hidden">
            <div className="border-b border-moss/10 p-5 sm:p-6">
              <h3 className="font-semibold tracking-[-0.015em]">Scale profiles</h3>
              <p className="mt-1 text-xs leading-5 text-ink-soft">Each profile runs in an isolated process with a hard timeout.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-oat/45 text-xs text-ink-soft">
                  <tr><th className="px-5 py-3 font-semibold">Profile</th><th className="px-5 py-3 font-semibold">Workers</th><th className="px-5 py-3 font-semibold">Shifts</th><th className="px-5 py-3 font-semibold">Runtime</th><th className="px-5 py-3 font-semibold">Heap delta</th><th className="px-5 py-3 font-semibold">Result</th></tr>
                </thead>
                <tbody className="divide-y divide-moss/10">
                  {adversarial.performance.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4 font-semibold text-ink">{item.id}</td><td className="px-5 py-4 tabular-nums">{item.workers}</td><td className="px-5 py-4 tabular-nums">{item.shifts}</td><td className="px-5 py-4 tabular-nums">{item.runtimeMs} ms</td><td className="px-5 py-4 tabular-nums">{item.heapDeltaMb} MB</td><td className="px-5 py-4"><Badge tone={item.timedOut || item.error ? "clay" : "sage"}>{item.timedOut ? "Timed out" : item.error ? "Error" : "Completed"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.025em]">Soft-quality metrics</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-ink-soft">
              Quality is reported separately from hard constraints. A strong average cannot cancel a safety violation.
            </p>
          </div>
          <Badge tone="moss">Fixed seed {report.seed}</Badge>
        </div>
        <div className="mt-7 grid gap-6 lg:grid-cols-3">
          <QualityBar label="Coverage" value={report.summary.averageCoveragePercentage} />
          <QualityBar label="Preference satisfaction" value={report.summary.averagePreferenceSatisfaction} />
          <QualityBar label="Fairness of assigned hours" value={report.summary.averageFairnessOfAssignedHours} />
        </div>
      </Card>

      <section aria-labelledby="scenario-results" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="scenario-results" className="text-xl font-semibold tracking-[-0.03em]">Scenario results</h2>
            <p className="mt-1 text-sm text-ink-soft">Expand a scenario to inspect failures, expected outcomes, assignments, and validator evidence.</p>
          </div>
          <p className="text-xs text-ink-soft">Production entry: {report.schedulerEntryPoint}</p>
        </div>

        <div className="space-y-3">
          {report.cases.map((evaluationCase) => (
            <details key={evaluationCase.id} className="group rounded-3xl border border-moss/15 bg-sand/75 shadow-[0_16px_40px_rgba(96,108,56,0.08)] open:bg-sand">
              <summary className="flex cursor-pointer list-none flex-col gap-3 p-5 marker:hidden sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex min-w-0 items-start gap-3">
                  {evaluationCase.passed ? <CheckCircle2 className="mt-0.5 shrink-0 text-moss" size={20} /> : <XCircle className="mt-0.5 shrink-0 text-terracotta-dark" size={20} />}
                  <div className="min-w-0">
                    <h3 className="font-semibold tracking-[-0.015em] text-ink">{evaluationCase.name}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                      <Badge tone={evaluationCase.passed ? "sage" : "clay"}>{evaluationCase.passed ? "Passed" : "Failed"}</Badge>
                      <span>{evaluationCase.category}</span>
                      <span>{evaluationCase.metrics.coveragePercentage}% coverage</span>
                      <span>{evaluationCase.runtimeMs} ms</span>
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-moss group-open:hidden">Show details</span>
                <span className="hidden text-xs font-semibold text-moss group-open:inline">Hide details</span>
              </summary>

              <div className="border-t border-moss/10 px-5 py-6 sm:px-6">
                {evaluationCase.expectationFailures.length > 0 && (
                  <div className="rounded-2xl bg-terracotta/10 p-4">
                    <h4 className="text-sm font-semibold text-terracotta-dark">Failure reasons</h4>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-ink">
                      {evaluationCase.expectationFailures.map((failure) => <li key={failure}>{failure}</li>)}
                    </ul>
                  </div>
                )}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl bg-sage/15 p-4">
                    <h4 className="text-sm font-semibold">Expected</h4>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Status</dt><dd className="font-semibold">{evaluationCase.expectedStatus}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Unfilled shifts</dt><dd className="text-right font-semibold">{evaluationCase.expected.unfilledShiftIds.join(", ") || "None"}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Required assignments</dt><dd className="text-right font-semibold">{evaluationCase.expected.requiredAssignments.length}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Forbidden assignments</dt><dd className="text-right font-semibold">{evaluationCase.expected.forbiddenAssignments.length}</dd></div>
                    </dl>
                  </div>
                  <div className="rounded-2xl bg-oat/45 p-4">
                    <h4 className="text-sm font-semibold">Actual</h4>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Status</dt><dd className="font-semibold">{evaluationCase.actualStatus}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Unfilled shifts</dt><dd className="text-right font-semibold">{evaluationCase.actual.unfilledShiftIds.join(", ") || "None"}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Assignments</dt><dd className="font-semibold">{evaluationCase.actual.assignments.length}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-ink-soft">Hard issues</dt><dd className="font-semibold">{evaluationCase.metrics.hardConstraintViolationCount}</dd></div>
                    </dl>
                  </div>
                </div>

                {evaluationCase.issues.length > 0 && (
                  <div className="mt-6">
                    <h4 className="flex items-center gap-2 text-sm font-semibold"><Scale size={16} /> Validator evidence</h4>
                    <ul className="mt-3 space-y-2">
                      {evaluationCase.issues.map((validationIssue, index) => <IssueDetail key={`${validationIssue.code}-${validationIssue.workerId}-${validationIssue.shiftId}-${index}`} issue={validationIssue} />)}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
