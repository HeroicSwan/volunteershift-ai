import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adversarialCases } from "./adversarial/cases";
import { buildCaseReport, evaluateCase, failedCaseResult } from "./adversarial/evaluate";
import { runHostileInputSuite } from "./adversarial/hostile";
import { runMutationSuite } from "./adversarial/mutation";
import {
  PERFORMANCE_SIZES,
  runPerformanceCase,
  type PerformanceResult,
} from "./adversarial/performance";
import { runPropertySuite } from "./adversarial/properties";
import { runRepeatabilitySuite } from "./adversarial/repeatability";
import type { EvaluationCaseResult, EvaluationReport } from "./schema";

const CHILD_RESULT = "__ADVERSARIAL_CHILD__";
const REPORT_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "reports");

type AdversarialReport = {
  schemaVersion: 1;
  generatedAt: string;
  phase: "baseline" | "final";
  schedulerEntryPoint: "src/lib/scheduler.ts#generateOptimizedSchedule";
  caseReport: EvaluationReport;
  properties: ReturnType<typeof runPropertySuite>;
  hostileInputs: ReturnType<typeof runHostileInputSuite>;
  mutations: ReturnType<typeof runMutationSuite>;
  performance: PerformanceResult[];
  repeatability: ReturnType<typeof runRepeatabilitySuite>;
  summary: {
    passed: boolean;
    handAuthoredPassed: number;
    handAuthoredTotal: number;
    propertyPassed: number;
    propertyTotal: number;
    hostilePassed: number;
    hostileTotal: number;
    mutationScore: number;
    performanceTimeouts: number;
    repeatable: boolean;
  };
};

function argumentValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runCaseIsolated(id: string): EvaluationCaseResult {
  const evaluationCase = adversarialCases.find((item) => item.id === id);
  if (!evaluationCase) throw new Error(`Unknown adversarial case ${id}`);
  const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "--child-case", id], {
    encoding: "utf8",
    timeout: evaluationCase.timeoutMs,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (child.error) {
    const timedOut = "code" in child.error && child.error.code === "ETIMEDOUT";
    return failedCaseResult(
      evaluationCase,
      timedOut ? `Case exceeded ${evaluationCase.timeoutMs}ms timeout.` : child.error.message,
      evaluationCase.timeoutMs,
      timedOut,
    );
  }
  const line = child.stdout.split(/\r?\n/).findLast((item) => item.startsWith(CHILD_RESULT));
  if (!line) return failedCaseResult(evaluationCase, child.stderr.trim() || `Child exited ${child.status}.`);
  return JSON.parse(line.slice(CHILD_RESULT.length)) as EvaluationCaseResult;
}

function runPerformanceIsolated(size: (typeof PERFORMANCE_SIZES)[number]): PerformanceResult {
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, fileURLToPath(import.meta.url), "--performance-child", size.id],
    { encoding: "utf8", timeout: size.timeoutMs, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
  );
  if (child.error) {
    const timedOut = "code" in child.error && child.error.code === "ETIMEDOUT";
    return {
      category: "N-performance-and-scale",
      id: size.id,
      workers: size.workers,
      shifts: size.shifts,
      runtimeMs: size.timeoutMs,
      heapDeltaMb: 0,
      assignments: 0,
      hardAssignmentViolations: 0,
      timedOut,
      error: timedOut ? `Exceeded ${size.timeoutMs}ms timeout.` : child.error.message,
    };
  }
  const line = child.stdout.split(/\r?\n/).findLast((item) => item.startsWith(CHILD_RESULT));
  if (!line) {
    return {
      category: "N-performance-and-scale",
      id: size.id,
      workers: size.workers,
      shifts: size.shifts,
      runtimeMs: 0,
      heapDeltaMb: 0,
      assignments: 0,
      hardAssignmentViolations: 0,
      timedOut: false,
      error: child.stderr.trim() || `Child exited ${child.status}.`,
    };
  }
  return JSON.parse(line.slice(CHILD_RESULT.length)) as PerformanceResult;
}

function renderReport(report: AdversarialReport) {
  const failedCases = report.caseReport.cases.filter((item) => !item.passed);
  const lines = [
    `# Adversarial scheduling ${report.phase} report`,
    "",
    `Generated: ${report.generatedAt}`,
    `Production entry point: \`${report.schedulerEntryPoint}\``,
    "",
    "## Summary",
    "",
    `- Overall: ${report.summary.passed ? "PASS" : "FAIL"}`,
    `- Hand-authored scenarios: ${report.summary.handAuthoredPassed}/${report.summary.handAuthoredTotal}`,
    `- Seeded property cases: ${report.summary.propertyPassed}/${report.summary.propertyTotal}`,
    `- Hostile schema checks: ${report.summary.hostilePassed}/${report.summary.hostileTotal}`,
    `- Mutation score: ${report.summary.mutationScore}%`,
    `- Performance timeouts: ${report.summary.performanceTimeouts}`,
    `- Repeatable and idempotent: ${report.summary.repeatable ? "yes" : "no"}`,
    "",
    "## Hand-authored scenario failures",
    "",
    ...(failedCases.length
      ? failedCases.flatMap((item) => [
          `### ${item.id}`,
          "",
          ...item.expectationFailures.map((failure) => `- ${failure}`),
          ...item.issues.filter((issue) => issue.severity === "hard").map((issue) => `- \`${issue.code}\`: ${issue.explanation}`),
          "",
        ])
      : ["None.", ""]),
    "## Performance",
    "",
    "| Size | Workers | Shifts | Runtime | Heap delta | Assignments | Timeout | Unsafe issues |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...report.performance.map((item) => `| ${item.id} | ${item.workers} | ${item.shifts} | ${item.runtimeMs} ms | ${item.heapDeltaMb} MB | ${item.assignments} | ${item.timedOut ? "yes" : "no"} | ${item.hardAssignmentViolations} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderMutation(report: AdversarialReport) {
  return `${[
    "# Mutation results",
    "",
    "These output mutations deliberately corrupt a real production-engine result, then verify that the independent validator detects the exact hard-rule violation.",
    "",
    `Mutation score: ${report.mutations.killed}/${report.mutations.total} (${report.mutations.score}%)`,
    "",
    "| Mutant | Expected code | Result |",
    "| --- | --- | --- |",
    ...report.mutations.mutants.map((item) => `| ${item.id} | \`${item.expectedCode}\` | ${item.killed ? "killed" : "SURVIVED"} |`),
    "",
  ].join("\n")}\n`;
}

function renderPerformance(report: AdversarialReport) {
  return `${[
    "# Performance results",
    "",
    "All profiles invoke the production scheduler in an isolated process with a hard timeout.",
    "",
    "| Profile | Workers | Shifts | Runtime | Heap delta | Assignments | Timeout | Error |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...report.performance.map((item) => `| ${item.id} | ${item.workers} | ${item.shifts} | ${item.runtimeMs} ms | ${item.heapDeltaMb} MB | ${item.assignments} | ${item.timedOut ? "yes" : "no"} | ${item.error ?? ""} |`),
    "",
  ].join("\n")}\n`;
}

function renderFlaky(report: AdversarialReport) {
  return `${[
    "# Flaky and repeatability tests",
    "",
    `- Repeated runs: ${report.repeatability.runs}`,
    `- Unique signatures: ${report.repeatability.uniqueSignatures}`,
    `- Deterministic: ${report.repeatability.deterministic ? "yes" : "no"}`,
    `- Idempotent with existing assignments: ${report.repeatability.idempotentWithExistingAssignments ? "yes" : "no"}`,
    ...report.repeatability.failures.map((failure) => `- Failure: ${failure}`),
    "",
  ].join("\n")}\n`;
}

async function previousBaseline(): Promise<AdversarialReport | undefined> {
  try {
    return JSON.parse(await readFile(join(REPORT_DIRECTORY, "adversarial-baseline.json"), "utf8")) as AdversarialReport;
  } catch {
    return undefined;
  }
}

function renderRegressions(report: AdversarialReport, baseline?: AdversarialReport) {
  if (!baseline || !baseline.caseReport) return "# Regressions\n\nNo compatible adversarial baseline was available.\n";
  const baselineById = new Map(baseline.caseReport.cases.map((item) => [item.id, item]));
  const fixed = report.caseReport.cases.filter((item) => item.passed && baselineById.get(item.id)?.passed === false);
  const regressed = report.caseReport.cases.filter((item) => !item.passed && baselineById.get(item.id)?.passed === true);
  return `${[
    "# Regression comparison",
    "",
    `Baseline: ${baseline.generatedAt}`,
    `Final: ${report.generatedAt}`,
    "",
    "## Fixed",
    "",
    ...(fixed.length ? fixed.map((item) => `- ${item.id}`) : ["None."]),
    "",
    "## Regressed",
    "",
    ...(regressed.length ? regressed.map((item) => `- ${item.id}`) : ["None."]),
    "",
  ].join("\n")}\n`;
}

async function writeReports(report: AdversarialReport, baseline?: AdversarialReport) {
  await mkdir(REPORT_DIRECTORY, { recursive: true });
  const phaseName = `adversarial-${report.phase}`;
  const failures = {
    generatedAt: report.generatedAt,
    scenarios: report.caseReport.cases.filter((item) => !item.passed),
    propertyFailures: report.properties.failures,
    hostileFailures: report.hostileInputs.checks.filter((item) => !item.passed),
    survivedMutations: report.mutations.mutants.filter((item) => !item.killed),
    performanceFailures: report.performance.filter((item) => item.timedOut || item.error || item.hardAssignmentViolations),
    repeatabilityFailures: report.repeatability.failures,
  };
  await Promise.all([
    writeFile(join(REPORT_DIRECTORY, `${phaseName}.json`), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(join(REPORT_DIRECTORY, `${phaseName}.md`), renderReport(report)),
    writeFile(join(REPORT_DIRECTORY, "adversarial-latest.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(join(REPORT_DIRECTORY, "adversarial-latest.md"), renderReport(report)),
    writeFile(join(REPORT_DIRECTORY, "failures.json"), `${JSON.stringify(failures, null, 2)}\n`),
    writeFile(join(REPORT_DIRECTORY, "mutation-results.md"), renderMutation(report)),
    writeFile(join(REPORT_DIRECTORY, "performance-results.md"), renderPerformance(report)),
    writeFile(join(REPORT_DIRECTORY, "flaky-tests.md"), renderFlaky(report)),
    writeFile(join(REPORT_DIRECTORY, "regressions.md"), renderRegressions(report, baseline)),
  ]);
}

async function runFull(phase: "baseline" | "final") {
  console.log(`Running ${adversarialCases.length} hand-authored adversarial scenarios...`);
  const caseResults = adversarialCases.map((item, index) => {
    const result = runCaseIsolated(item.id);
    if ((index + 1) % 20 === 0 || !result.passed) console.log(`${index + 1}/${adversarialCases.length} ${result.passed ? "PASS" : "FAIL"} ${item.id}`);
    return result;
  });
  console.log("Running 1,000 deterministic property cases...");
  const properties = runPropertySuite();
  console.log("Running hostile schema checks and mutation suite...");
  const hostileInputs = runHostileInputSuite();
  const mutations = runMutationSuite();
  console.log("Running isolated performance profiles...");
  const performance = PERFORMANCE_SIZES.map(runPerformanceIsolated);
  console.log("Running repeatability and idempotence checks...");
  const repeatability = runRepeatabilitySuite();
  const caseReport = buildCaseReport(caseResults);
  const passed = caseReport.summary.failed === 0
    && properties.failed === 0
    && hostileInputs.failed === 0
    && mutations.survived === 0
    && performance.every((item) => !item.timedOut && !item.error && item.hardAssignmentViolations === 0)
    && repeatability.failures.length === 0;
  const report: AdversarialReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    phase,
    schedulerEntryPoint: "src/lib/scheduler.ts#generateOptimizedSchedule",
    caseReport,
    properties,
    hostileInputs,
    mutations,
    performance,
    repeatability,
    summary: {
      passed,
      handAuthoredPassed: caseReport.summary.passed,
      handAuthoredTotal: caseReport.summary.total,
      propertyPassed: properties.passed,
      propertyTotal: properties.total,
      hostilePassed: hostileInputs.passed,
      hostileTotal: hostileInputs.total,
      mutationScore: mutations.score,
      performanceTimeouts: performance.filter((item) => item.timedOut).length,
      repeatable: repeatability.failures.length === 0,
    },
  };
  const baseline = phase === "final" ? await previousBaseline() : undefined;
  await writeReports(report, baseline);
  console.log(`\nHand-authored: ${caseReport.summary.passed}/${caseReport.summary.total}`);
  console.log(`Properties: ${properties.passed}/${properties.total}`);
  console.log(`Hostile inputs: ${hostileInputs.passed}/${hostileInputs.total}`);
  console.log(`Mutation score: ${mutations.score}%`);
  console.log(`Performance timeouts: ${report.summary.performanceTimeouts}`);
  console.log(`Repeatable: ${report.summary.repeatable ? "yes" : "no"}`);
  console.log(`Overall: ${passed ? "PASS" : "FAIL"}`);
  process.exitCode = passed ? 0 : 1;
}

async function main() {
  const childCase = argumentValue("--child-case");
  if (childCase) {
    const evaluationCase = adversarialCases.find((item) => item.id === childCase);
    if (!evaluationCase) throw new Error(`Unknown adversarial case ${childCase}`);
    console.log(`${CHILD_RESULT}${JSON.stringify(evaluateCase(evaluationCase))}`);
    return;
  }
  const performanceChild = argumentValue("--performance-child");
  if (performanceChild) {
    const size = PERFORMANCE_SIZES.find((item) => item.id === performanceChild);
    if (!size) throw new Error(`Unknown performance profile ${performanceChild}`);
    console.log(`${CHILD_RESULT}${JSON.stringify(runPerformanceCase(size.id, size.workers, size.shifts))}`);
    return;
  }
  const phase = argumentValue("--phase") === "baseline" ? "baseline" : "final";
  await runFull(phase);
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
