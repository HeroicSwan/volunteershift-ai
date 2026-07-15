import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluationCases } from "./cases";
import type {
  EvaluationCase,
  EvaluationCaseResult,
  EvaluationMetrics,
  EvaluationReport,
} from "./schema";
import {
  activeWorkersForCase,
  calculateMetrics,
  determineStatus,
  expectedHardIssue,
  getUnfilledShiftIds,
  runProductionScheduler,
  validateSchedule,
} from "./validators";

const FIXED_SEED = 20260914;
const RESULT_PREFIX = "__EVAL_RESULT__";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function emptyMetrics(runtimeMs = 0): EvaluationMetrics {
  return {
    coveragePercentage: 0,
    preferenceSatisfaction: 0,
    fairnessOfAssignedHours: 0,
    overtimeUsageHours: 0,
    undesirableShiftSpread: 0,
    unfilledShiftCount: 0,
    schedulingRuntimeMs: runtimeMs,
    hardConstraintViolationCount: 0,
    averageMatchScore: 0,
  };
}

function failedResult(
  evaluationCase: EvaluationCase,
  options: { runtimeMs?: number; error: string; timedOut?: boolean },
): EvaluationCaseResult {
  return {
    id: evaluationCase.id,
    name: evaluationCase.name,
    category: evaluationCase.category,
    passed: false,
    expectedStatus: evaluationCase.expectedStatus,
    actualStatus: "invalid",
    runtimeMs: options.runtimeMs ?? 0,
    crashed: !options.timedOut,
    timedOut: Boolean(options.timedOut),
    error: options.error,
    issues: [],
    expectationFailures: [options.error],
    metrics: emptyMetrics(options.runtimeMs),
    expected: {
      requiredAssignments: evaluationCase.requiredAssignments,
      forbiddenAssignments: evaluationCase.forbiddenAssignments,
      unfilledShiftIds: evaluationCase.expectedUnfilledShifts,
      warningFragments: evaluationCase.expectedWarnings,
    },
    actual: { assignments: [], unfilledShiftIds: [], warnings: [] },
  };
}

function thresholdFailures(evaluationCase: EvaluationCase, metrics: EvaluationMetrics) {
  const thresholds = evaluationCase.minimumSoftQualityThresholds;
  const failures: string[] = [];
  const minimums: Array<[keyof EvaluationMetrics, number | undefined, string]> = [
    ["coveragePercentage", thresholds.coveragePercentage, "coverage percentage"],
    ["preferenceSatisfaction", thresholds.preferenceSatisfaction, "preference satisfaction"],
    ["fairnessOfAssignedHours", thresholds.fairnessOfAssignedHours, "fairness of assigned hours"],
  ];
  for (const [key, threshold, label] of minimums) {
    if (threshold !== undefined && metrics[key] < threshold) {
      failures.push(`${label} was ${metrics[key]}, below the minimum ${threshold}`);
    }
  }
  const maximums: Array<[keyof EvaluationMetrics, number | undefined, string]> = [
    ["overtimeUsageHours", thresholds.maximumOvertimeHours, "overtime usage"],
    ["undesirableShiftSpread", thresholds.maximumUndesirableShiftSpread, "undesirable-shift spread"],
    ["unfilledShiftCount", thresholds.maximumUnfilledShifts, "unfilled shift count"],
    ["schedulingRuntimeMs", thresholds.maximumRuntimeMs, "scheduling runtime"],
  ];
  for (const [key, threshold, label] of maximums) {
    if (threshold !== undefined && metrics[key] > threshold) {
      failures.push(`${label} was ${metrics[key]}, above the maximum ${threshold}`);
    }
  }
  return failures;
}

function executeCase(evaluationCase: EvaluationCase): EvaluationCaseResult {
  const originalRandom = Math.random;
  Math.random = seededRandom(FIXED_SEED);
  const started = performance.now();
  try {
    const result = runProductionScheduler(evaluationCase);
    const runtimeMs = performance.now() - started;
    const issues = validateSchedule(evaluationCase, result);
    const workers = activeWorkersForCase(evaluationCase);
    const unfilledShiftIds = getUnfilledShiftIds(evaluationCase.input.shifts, result.assignments).sort();
    const warnings = [
      ...result.assignments.flatMap((assignment) => assignment.warnings),
      ...result.shiftResults.flatMap((shiftResult) => shiftResult.uncoveredReasons),
    ];
    const metrics = calculateMetrics(workers, evaluationCase.input.shifts, result.assignments, runtimeMs, issues);
    const actualStatus = determineStatus(evaluationCase.input.shifts, result.assignments, issues);
    const expectationFailures: string[] = [];

    if (actualStatus !== evaluationCase.expectedStatus) {
      expectationFailures.push(`status was ${actualStatus}; expected ${evaluationCase.expectedStatus}`);
    }
    const expectedUnfilled = [...evaluationCase.expectedUnfilledShifts].sort();
    if (JSON.stringify(unfilledShiftIds) !== JSON.stringify(expectedUnfilled)) {
      expectationFailures.push(`unfilled shifts were [${unfilledShiftIds.join(", ")}]; expected [${expectedUnfilled.join(", ")}]`);
    }
    for (const warning of evaluationCase.expectedWarnings) {
      if (!warnings.some((actual) => actual.includes(warning))) {
        expectationFailures.push(`expected warning containing "${warning}" was not emitted`);
      }
    }
    for (const code of evaluationCase.expectedHardViolationCodes) {
      if (!issues.some((validationIssue) => validationIssue.severity === "hard" && validationIssue.code === code)) {
        expectationFailures.push(`expected hard violation ${code} was not reported`);
      }
    }
    const unexpectedHardIssues = issues.filter(
      (validationIssue) => validationIssue.severity === "hard" && !expectedHardIssue(evaluationCase, validationIssue),
    );
    if (unexpectedHardIssues.length > evaluationCase.maximumAllowedHardViolations) {
      expectationFailures.push(`${unexpectedHardIssues.length} unexpected hard violations exceeded the allowed maximum ${evaluationCase.maximumAllowedHardViolations}`);
    }
    expectationFailures.push(...thresholdFailures(evaluationCase, metrics));

    return {
      id: evaluationCase.id,
      name: evaluationCase.name,
      category: evaluationCase.category,
      passed: expectationFailures.length === 0,
      expectedStatus: evaluationCase.expectedStatus,
      actualStatus,
      runtimeMs: metrics.schedulingRuntimeMs,
      crashed: false,
      timedOut: false,
      issues,
      expectationFailures,
      metrics,
      expected: {
        requiredAssignments: evaluationCase.requiredAssignments,
        forbiddenAssignments: evaluationCase.forbiddenAssignments,
        unfilledShiftIds: expectedUnfilled,
        warningFragments: evaluationCase.expectedWarnings,
      },
      actual: {
        assignments: result.assignments.map(({ workerId, shiftId, startTime, endTime, matchScore, warnings: assignmentWarnings }) => ({
          workerId,
          shiftId,
          startTime,
          endTime,
          matchScore,
          warnings: assignmentWarnings,
        })),
        unfilledShiftIds,
        warnings,
      },
    };
  } catch (error) {
    return failedResult(evaluationCase, {
      runtimeMs: Math.round((performance.now() - started) * 100) / 100,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  } finally {
    Math.random = originalRandom;
  }
}

function runIsolated(evaluationCase: EvaluationCase): EvaluationCaseResult {
  const runnerPath = fileURLToPath(import.meta.url);
  const child = spawnSync(process.execPath, [...process.execArgv, runnerPath, "--child-case", evaluationCase.id], {
    encoding: "utf8",
    timeout: evaluationCase.timeoutMs,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.error) {
    const timedOut = "code" in child.error && child.error.code === "ETIMEDOUT";
    return failedResult(evaluationCase, {
      runtimeMs: evaluationCase.timeoutMs,
      timedOut,
      error: timedOut
        ? `evaluation exceeded the ${evaluationCase.timeoutMs}ms timeout`
        : `evaluation process failed: ${child.error.message}`,
    });
  }
  const resultLine = child.stdout.split(/\r?\n/).findLast((line) => line.startsWith(RESULT_PREFIX));
  if (!resultLine) {
    return failedResult(evaluationCase, {
      error: `evaluation child exited ${child.status ?? "without a status"}: ${child.stderr.trim() || "no result payload"}`,
    });
  }
  return JSON.parse(resultLine.slice(RESULT_PREFIX.length)) as EvaluationCaseResult;
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
}

function buildReport(
  cases: EvaluationCaseResult[],
  filters: { caseId?: string; category?: string },
): EvaluationReport {
  const passed = cases.filter((evaluationCase) => evaluationCase.passed).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seed: FIXED_SEED,
    schedulerEntryPoint: "src/lib/scheduler.ts#generateOptimizedSchedule",
    filters,
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed,
      passRate: cases.length ? Math.round((passed / cases.length) * 10_000) / 100 : 0,
      hardViolations: cases.reduce((sum, evaluationCase) => sum + evaluationCase.metrics.hardConstraintViolationCount, 0),
      averageRuntimeMs: average(cases.map((evaluationCase) => evaluationCase.metrics.schedulingRuntimeMs)),
      averageCoveragePercentage: average(cases.map((evaluationCase) => evaluationCase.metrics.coveragePercentage)),
      averagePreferenceSatisfaction: average(cases.map((evaluationCase) => evaluationCase.metrics.preferenceSatisfaction)),
      averageFairnessOfAssignedHours: average(cases.map((evaluationCase) => evaluationCase.metrics.fairnessOfAssignedHours)),
    },
    cases,
  };
}

function markdownCell(value: unknown) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderMarkdown(report: EvaluationReport) {
  const lines = [
    "# Scheduling evaluation report",
    "",
    `Generated: ${report.generatedAt}`,
    `Production entry point: \`${report.schedulerEntryPoint}\``,
    `Fixed seed: \`${report.seed}\``,
    "",
    "## Summary",
    "",
    `- Passed: ${report.summary.passed}/${report.summary.total} (${report.summary.passRate}%)`,
    `- Hard violations reported: ${report.summary.hardViolations}`,
    `- Average scheduler runtime: ${report.summary.averageRuntimeMs} ms`,
    `- Average coverage: ${report.summary.averageCoveragePercentage}%`,
    `- Average preference satisfaction: ${report.summary.averagePreferenceSatisfaction}%`,
    `- Average fairness: ${report.summary.averageFairnessOfAssignedHours}%`,
    "",
    "## Scenarios",
    "",
    "| Result | Scenario | Category | Expected / actual status | Coverage | Hard issues | Runtime |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ...report.cases.map((evaluationCase) =>
      `| ${evaluationCase.passed ? "PASS" : "FAIL"} | ${markdownCell(evaluationCase.name)} | ${markdownCell(evaluationCase.category)} | ${evaluationCase.expectedStatus} / ${evaluationCase.actualStatus} | ${evaluationCase.metrics.coveragePercentage}% | ${evaluationCase.metrics.hardConstraintViolationCount} | ${evaluationCase.runtimeMs} ms |`,
    ),
    "",
  ];
  for (const evaluationCase of report.cases) {
    lines.push(
      `## ${evaluationCase.passed ? "PASS" : "FAIL"}: ${evaluationCase.name}`,
      "",
      `Case ID: \`${evaluationCase.id}\`  `,
      `Expected status: \`${evaluationCase.expectedStatus}\`  `,
      `Actual status: \`${evaluationCase.actualStatus}\``,
      "",
      `Expected unfilled shifts: ${evaluationCase.expected.unfilledShiftIds.length ? evaluationCase.expected.unfilledShiftIds.map((id) => `\`${id}\``).join(", ") : "none"}  `,
      `Actual unfilled shifts: ${evaluationCase.actual.unfilledShiftIds.length ? evaluationCase.actual.unfilledShiftIds.map((id) => `\`${id}\``).join(", ") : "none"}`,
      "",
    );
    if (evaluationCase.expectationFailures.length) {
      lines.push("### Failure reasons", "", ...evaluationCase.expectationFailures.map((failure) => `- ${failure}`), "");
    }
    if (evaluationCase.issues.length) {
      lines.push(
        "### Validation issues",
        "",
        "| Severity | Code | Worker | Shift | Expected | Actual | Explanation |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        ...evaluationCase.issues.map((validationIssue) =>
          `| ${validationIssue.severity} | \`${validationIssue.code}\` | ${validationIssue.workerId ?? "—"} | ${validationIssue.shiftId ?? "—"} | ${markdownCell(JSON.stringify(validationIssue.expected))} | ${markdownCell(JSON.stringify(validationIssue.actual))} | ${markdownCell(validationIssue.explanation)} |`,
        ),
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

async function writeReports(report: EvaluationReport) {
  const reportDirectory = join(dirname(fileURLToPath(import.meta.url)), "reports");
  await mkdir(reportDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(reportDirectory, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(join(reportDirectory, "latest.md"), renderMarkdown(report), "utf8"),
  ]);
}

function argumentValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printSummary(report: EvaluationReport, verbose: boolean) {
  console.log("\nScheduling engine evaluations");
  console.log(`Entry point: ${report.schedulerEntryPoint}`);
  console.log(`Seed: ${report.seed}\n`);
  for (const evaluationCase of report.cases) {
    console.log(`${evaluationCase.passed ? "PASS" : "FAIL"}  ${evaluationCase.id.padEnd(38)} ${evaluationCase.metrics.coveragePercentage.toFixed(2).padStart(7)}%  ${evaluationCase.runtimeMs.toFixed(2).padStart(8)}ms`);
    if (verbose || !evaluationCase.passed) {
      for (const failure of evaluationCase.expectationFailures) console.log(`      - ${failure}`);
      for (const validationIssue of evaluationCase.issues.filter((item) => item.severity === "hard")) {
        console.log(`      - ${validationIssue.code}: ${validationIssue.explanation}`);
      }
    }
  }
  console.log("\nSummary");
  console.log(`  Passed: ${report.summary.passed}/${report.summary.total} (${report.summary.passRate}%)`);
  console.log(`  Hard violations: ${report.summary.hardViolations}`);
  console.log(`  Average runtime: ${report.summary.averageRuntimeMs}ms`);
  console.log(`  Reports: evals/reports/latest.json and evals/reports/latest.md\n`);
}

async function main() {
  const childCaseId = argumentValue("--child-case");
  if (childCaseId) {
    const evaluationCase = evaluationCases.find((item) => item.id === childCaseId);
    if (!evaluationCase) throw new Error(`Unknown evaluation case: ${childCaseId}`);
    console.log(`${RESULT_PREFIX}${JSON.stringify(executeCase(evaluationCase))}`);
    return;
  }

  const caseId = argumentValue("--case");
  const category = argumentValue("--category");
  const verbose = process.argv.includes("--verbose");
  const selected = evaluationCases.filter(
    (evaluationCase) => (!caseId || evaluationCase.id === caseId) && (!category || evaluationCase.category === category),
  );
  if (selected.length === 0) {
    const filter = caseId ? `case "${caseId}"` : `category "${category}"`;
    console.error(`No evaluation cases matched ${filter}.`);
    process.exitCode = 2;
    return;
  }
  const results = selected.map(runIsolated);
  const report = buildReport(results, { caseId, category });
  await writeReports(report);
  printSummary(report, verbose);
  process.exitCode = report.summary.failed > 0 ? 1 : 0;
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
