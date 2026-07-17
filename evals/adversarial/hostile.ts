import { evaluationCaseSchema, type EvaluationCase } from "../schema";
import { runProductionScheduler } from "../validators";
import { evaluationCase, shift, worker } from "./factories";

export type HostileInputResult = {
  category: "L-hostile-schema-inputs";
  total: number;
  passed: number;
  failed: number;
  checks: Array<{ id: string; passed: boolean; explanation: string }>;
};

function validCase(): EvaluationCase {
  return evaluationCase(
    "hostile-valid-control",
    "L-hostile-schema-inputs",
    {
      workers: [worker("hostile-worker")],
      shifts: [shift("hostile-shift")],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  );
}

function altered(change: (value: Record<string, unknown>) => void) {
  const value = structuredClone(validCase()) as unknown as Record<string, unknown>;
  change(value);
  return value;
}

export function runHostileInputSuite(): HostileInputResult {
  const invalidInputs: Array<[string, unknown]> = [
    ["null-case", null],
    ["missing-workers", altered((value) => { delete (value.input as Record<string, unknown>).workers; })],
    ["workers-not-array", altered((value) => { (value.input as Record<string, unknown>).workers = {}; })],
    ["shifts-not-array", altered((value) => { (value.input as Record<string, unknown>).shifts = "many"; })],
    ["unknown-top-level-field", altered((value) => { value.execute = "rm -rf"; })],
    ["unknown-input-field", altered((value) => { (value.input as Record<string, unknown>).database = true; })],
    ["unknown-worker-field", altered((value) => { ((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).admin = true; })],
    ["unknown-shift-field", altered((value) => { ((value.input as { shifts: Array<Record<string, unknown>> }).shifts[0]).script = "alert(1)"; })],
    ["nan-worker-hours", altered((value) => { ((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).maxHoursPerWeek = Number.NaN; })],
    ["infinite-worker-hours", altered((value) => { ((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).maxHoursPerWeek = Number.POSITIVE_INFINITY; })],
    ["negative-worker-hours", altered((value) => { ((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).maxHoursPerWeek = -1; })],
    ["fractional-max-shifts", altered((value) => { ((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).maxShiftsPerWeek = 2.5; })],
    ["unknown-worker-type", altered((value) => { ((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).workerType = "contractor"; })],
    ["unknown-priority", altered((value) => { ((value.input as { shifts: Array<Record<string, unknown>> }).shifts[0]).priority = "catastrophic"; })],
    ["negative-required-workers", altered((value) => { ((value.input as { shifts: Array<Record<string, unknown>> }).shifts[0]).requiredWorkers = -1; })],
    ["fractional-required-workers", altered((value) => { ((value.input as { shifts: Array<Record<string, unknown>> }).shifts[0]).requiredWorkers = 1.2; })],
    ["availability-not-array", altered((value) => { (((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).availability as Record<string, unknown>).Monday = "09:00-17:00"; })],
    ["unknown-availability-day", altered((value) => { (((value.input as { workers: Array<Record<string, unknown>> }).workers[0]).availability as Record<string, unknown>).Funday = []; })],
    ["cancelled-workers-not-array", altered((value) => { (value.input as Record<string, unknown>).cancelledWorkerIds = null; })],
    ["invalid-timeout", altered((value) => { value.timeoutMs = 0; })],
    ["invalid-status", altered((value) => { value.expectedStatus = "mostly-fine"; })],
    ["invalid-case-id", altered((value) => { value.id = "Hostile Invalid ID"; })],
  ];
  const checks = invalidInputs.map(([id, input]) => {
    const parsed = evaluationCaseSchema.safeParse(input);
    return {
      id,
      passed: !parsed.success,
      explanation: parsed.success ? "Malformed input was accepted." : parsed.error.issues[0]?.message ?? "Rejected",
    };
  });
  try {
    const valid = evaluationCaseSchema.parse(validCase());
    runProductionScheduler(valid);
    checks.push({ id: "valid-control-reaches-production-engine", passed: true, explanation: "Valid input parsed and ran." });
  } catch (error) {
    checks.push({
      id: "valid-control-reaches-production-engine",
      passed: false,
      explanation: error instanceof Error ? error.message : String(error),
    });
  }
  const passed = checks.filter((item) => item.passed).length;
  return {
    category: "L-hostile-schema-inputs",
    total: checks.length,
    passed,
    failed: checks.length - passed,
    checks,
  };
}
