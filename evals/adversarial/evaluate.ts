import type {
  EvaluationCase,
  EvaluationCaseResult,
  EvaluationMetrics,
  EvaluationReport,
} from "../schema";
import {
  activeWorkersForCase,
  calculateMetrics,
  determineStatus,
  expectedHardIssue,
  getUnfilledShiftIds,
  runProductionScheduler,
  validateSchedule,
} from "../validators";

export const ADVERSARIAL_SEED = 20261005;

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

function thresholdFailures(evaluationCase: EvaluationCase, metrics: EvaluationMetrics) {
  const thresholds = evaluationCase.minimumSoftQualityThresholds;
  const failures: string[] = [];
  const minimums: Array<[keyof EvaluationMetrics, number | undefined]> = [
    ["coveragePercentage", thresholds.coveragePercentage],
    ["preferenceSatisfaction", thresholds.preferenceSatisfaction],
    ["fairnessOfAssignedHours", thresholds.fairnessOfAssignedHours],
  ];
  const maximums: Array<[keyof EvaluationMetrics, number | undefined]> = [
    ["overtimeUsageHours", thresholds.maximumOvertimeHours],
    ["undesirableShiftSpread", thresholds.maximumUndesirableShiftSpread],
    ["unfilledShiftCount", thresholds.maximumUnfilledShifts],
    ["schedulingRuntimeMs", thresholds.maximumRuntimeMs],
  ];
  for (const [key, threshold] of minimums) {
    if (threshold !== undefined && metrics[key] < threshold) {
      failures.push(`${key}=${metrics[key]} is below ${threshold}`);
    }
  }
  for (const [key, threshold] of maximums) {
    if (threshold !== undefined && metrics[key] > threshold) {
      failures.push(`${key}=${metrics[key]} exceeds ${threshold}`);
    }
  }
  return failures;
}

export function failedCaseResult(
  evaluationCase: EvaluationCase,
  error: string,
  runtimeMs = 0,
  timedOut = false,
): EvaluationCaseResult {
  return {
    id: evaluationCase.id,
    name: evaluationCase.name,
    category: evaluationCase.category,
    passed: false,
    expectedStatus: evaluationCase.expectedStatus,
    actualStatus: "invalid",
    runtimeMs,
    crashed: !timedOut,
    timedOut,
    error,
    issues: [],
    expectationFailures: [error],
    metrics: emptyMetrics(runtimeMs),
    expected: {
      requiredAssignments: evaluationCase.requiredAssignments,
      forbiddenAssignments: evaluationCase.forbiddenAssignments,
      unfilledShiftIds: evaluationCase.expectedUnfilledShifts,
      warningFragments: evaluationCase.expectedWarnings,
    },
    actual: { assignments: [], unfilledShiftIds: [], warnings: [] },
  };
}

export function evaluateCase(evaluationCase: EvaluationCase): EvaluationCaseResult {
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
      expectationFailures.push(`status=${actualStatus}; expected ${evaluationCase.expectedStatus}`);
    }
    const expectedUnfilled = [...evaluationCase.expectedUnfilledShifts].sort();
    if (JSON.stringify(unfilledShiftIds) !== JSON.stringify(expectedUnfilled)) {
      expectationFailures.push(`unfilled=[${unfilledShiftIds.join(",")}]; expected [${expectedUnfilled.join(",")}]`);
    }
    for (const warning of evaluationCase.expectedWarnings) {
      if (!warnings.some((actual) => actual.includes(warning))) {
        expectationFailures.push(`warning containing "${warning}" was not emitted`);
      }
    }
    for (const code of evaluationCase.expectedHardViolationCodes) {
      if (!issues.some((item) => item.severity === "hard" && item.code === code)) {
        expectationFailures.push(`expected hard issue ${code} was not reported`);
      }
    }
    const unexpectedHardIssues = issues.filter(
      (item) => item.severity === "hard" && !expectedHardIssue(evaluationCase, item),
    );
    if (unexpectedHardIssues.length > evaluationCase.maximumAllowedHardViolations) {
      expectationFailures.push(
        `${unexpectedHardIssues.length} unexpected hard issues exceed ${evaluationCase.maximumAllowedHardViolations}`,
      );
    }
    expectationFailures.push(...thresholdFailures(evaluationCase, metrics));

    return {
      id: evaluationCase.id,
      name: evaluationCase.name,
      category: evaluationCase.category,
      passed: expectationFailures.length === 0,
      expectedStatus: evaluationCase.expectedStatus,
      actualStatus,
      runtimeMs,
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
        assignments: result.assignments.map(({ workerId, shiftId, startTime, endTime, matchScore, warnings: itemWarnings }) => ({
          workerId,
          shiftId,
          startTime,
          endTime,
          matchScore,
          warnings: itemWarnings,
        })),
        unfilledShiftIds,
        warnings,
      },
    };
  } catch (error) {
    return failedCaseResult(
      evaluationCase,
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      performance.now() - started,
    );
  }
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
}

export function buildCaseReport(cases: EvaluationCaseResult[]): EvaluationReport {
  const passed = cases.filter((item) => item.passed).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seed: ADVERSARIAL_SEED,
    schedulerEntryPoint: "src/lib/scheduler.ts#generateOptimizedSchedule",
    filters: {},
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed,
      passRate: cases.length ? Math.round((passed / cases.length) * 10_000) / 100 : 0,
      hardViolations: cases.reduce((sum, item) => sum + item.metrics.hardConstraintViolationCount, 0),
      averageRuntimeMs: average(cases.map((item) => item.runtimeMs)),
      averageCoveragePercentage: average(cases.map((item) => item.metrics.coveragePercentage)),
      averagePreferenceSatisfaction: average(cases.map((item) => item.metrics.preferenceSatisfaction)),
      averageFairnessOfAssignedHours: average(cases.map((item) => item.metrics.fairnessOfAssignedHours)),
    },
    cases,
  };
}
