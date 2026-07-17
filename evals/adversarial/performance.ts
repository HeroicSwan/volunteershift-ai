import type { EvaluationCase } from "../schema";
import { runProductionScheduler, validateSchedule } from "../validators";
import { evaluationCase, paid, shift, supervisor, TEST_WEEK, worker } from "./factories";

export const PERFORMANCE_SIZES = [
  { id: "small", workers: 10, shifts: 20, timeoutMs: 5_000 },
  { id: "medium", workers: 50, shifts: 100, timeoutMs: 10_000 },
  { id: "large", workers: 100, shifts: 300, timeoutMs: 20_000 },
  { id: "very-large", workers: 250, shifts: 1_000, timeoutMs: 30_000 },
  { id: "stress", workers: 500, shifts: 2_000, timeoutMs: 45_000 },
] as const;

export type PerformanceResult = {
  category: "N-performance-and-scale";
  id: string;
  workers: number;
  shifts: number;
  runtimeMs: number;
  heapDeltaMb: number;
  assignments: number;
  hardAssignmentViolations: number;
  timedOut: boolean;
  error?: string;
};

function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function generatePerformanceCase(workerCount: number, shiftCount: number): EvaluationCase {
  const roles = ["General Support", "Food Service", "Reception", "Warehouse"];
  const workers = Array.from({ length: workerCount }, (_, index) => {
    const rolesForWorker = [roles[index % roles.length], "General Support"];
    if (index % 12 === 0) return supervisor(`perf-supervisor-${index}`, { roles: [...rolesForWorker, "Manager"] });
    if (index % 3 !== 0) return paid(`perf-paid-${index}`, { roles: rolesForWorker, employmentType: index % 2 ? "full_time" : "part_time" });
    return worker(`perf-volunteer-${index}`, { roles: rolesForWorker, maxHoursPerWeek: 24 });
  });
  const shifts = Array.from({ length: shiftCount }, (_, index) => {
    const start = 9 * 60 + (index % 6) * 60;
    const needsSupervisor = index % 20 === 0;
    return shift(`perf-shift-${index}`, {
      title: `Performance shift ${index}`,
      date: TEST_WEEK[index % TEST_WEEK.length],
      startTime: clock(start),
      endTime: clock(start + 3 * 60),
      requiredRole: roles[index % roles.length],
      requiredWorkers: 1 + (index % 3),
      requiresSupervisor: needsSupervisor,
      requiredSupervisors: needsSupervisor ? 1 : 0,
      priority: index % 19 === 0 ? "Urgent" : index % 7 === 0 ? "High" : "Normal",
    });
  });
  return evaluationCase(
    `performance-${workerCount}-${shiftCount}`,
    "N-performance-and-scale",
    { workers, shifts, existingAssignments: [], cancelledWorkerIds: [] },
    { timeoutMs: 60_000 },
  );
}

const FEASIBILITY_CODES = new Set([
  "MINIMUM_COVERAGE_NOT_MET",
  "MINIMUM_WORKER_HOURS_NOT_MET",
  "REQUIRED_SUPERVISOR_MISSING",
  "MINIMUM_PAID_STAFF_NOT_MET",
]);

export function runPerformanceCase(id: string, workerCount: number, shiftCount: number): PerformanceResult {
  const evaluationCase = generatePerformanceCase(workerCount, shiftCount);
  const beforeHeap = process.memoryUsage().heapUsed;
  const started = performance.now();
  const result = runProductionScheduler(evaluationCase);
  const runtimeMs = performance.now() - started;
  const afterHeap = process.memoryUsage().heapUsed;
  const issues = validateSchedule(evaluationCase, result);
  return {
    category: "N-performance-and-scale",
    id,
    workers: workerCount,
    shifts: shiftCount,
    runtimeMs: Math.round(runtimeMs * 100) / 100,
    heapDeltaMb: Math.round(((afterHeap - beforeHeap) / 1024 / 1024) * 100) / 100,
    assignments: result.assignments.length,
    hardAssignmentViolations: issues.filter((item) => item.severity === "hard" && !FEASIBILITY_CODES.has(item.code)).length,
    timedOut: false,
  };
}
