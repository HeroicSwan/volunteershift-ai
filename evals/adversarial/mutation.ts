import type { OptimizedScheduleResult } from "../../src/types";
import type { EvaluationCase } from "../schema";
import { runProductionScheduler, validateSchedule } from "../validators";
import { evaluationCase, paid, shift, worker } from "./factories";

type Mutation = {
  id: string;
  expectedCode: string;
  apply: (evaluationCase: EvaluationCase, result: OptimizedScheduleResult) => void;
};

export type MutationResult = {
  category: "M-validator-mutation-testing";
  total: number;
  killed: number;
  survived: number;
  score: number;
  mutants: Array<{ id: string; expectedCode: string; killed: boolean; observedCodes: string[] }>;
};

function baseCase() {
  return evaluationCase(
    "mutation-base",
    "M-validator-mutation-testing",
    {
      workers: [
        worker("mutation-volunteer-1"),
        worker("mutation-volunteer-2"),
        paid("mutation-paid-1"),
      ],
      shifts: [
        shift("mutation-shift-1", { startTime: "09:00", endTime: "17:00" }),
        shift("mutation-shift-2", { startTime: "10:00", endTime: "14:00" }),
      ],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  );
}

function firstAssignment(result: OptimizedScheduleResult) {
  const assignment = result.assignments[0];
  if (!assignment) throw new Error("Mutation fixture did not produce an assignment.");
  return assignment;
}

const mutations: Mutation[] = [
  {
    id: "duplicate-assignment",
    expectedCode: "DUPLICATE_ASSIGNMENT",
    apply: (_case, result) => result.assignments.push(structuredClone(firstAssignment(result))),
  },
  {
    id: "missing-worker-reference",
    expectedCode: "MISSING_WORKER_REFERENCE",
    apply: (_case, result) => { firstAssignment(result).workerId = "missing-worker"; },
  },
  {
    id: "missing-shift-reference",
    expectedCode: "MISSING_SHIFT_REFERENCE",
    apply: (_case, result) => { firstAssignment(result).shiftId = "missing-shift"; },
  },
  {
    id: "assignment-before-opening",
    expectedCode: "ASSIGNMENT_OUTSIDE_SHIFT",
    apply: (_case, result) => { firstAssignment(result).startTime = "08:00"; },
  },
  {
    id: "invalid-assignment-range",
    expectedCode: "INVALID_ASSIGNMENT_TIME",
    apply: (_case, result) => {
      firstAssignment(result).startTime = "12:00";
      firstAssignment(result).endTime = "11:00";
    },
  },
  {
    id: "unavailable-worker",
    expectedCode: "WORKER_UNAVAILABLE",
    apply: (evaluationCase, result) => {
      const assignment = firstAssignment(result);
      const canonical = evaluationCase.input.workers.find((item) => item.id === assignment.workerId);
      if (canonical) canonical.availability = {};
    },
  },
  {
    id: "missing-role",
    expectedCode: "REQUIRED_ROLE_MISSING",
    apply: (evaluationCase, result) => {
      const assignment = firstAssignment(result);
      const canonical = evaluationCase.input.workers.find((item) => item.id === assignment.workerId);
      if (canonical) canonical.roles = [];
      assignment.worker.roles = [];
    },
  },
  {
    id: "volunteer-shift-over-six-hours",
    expectedCode: "VOLUNTEER_SHIFT_LIMIT_EXCEEDED",
    apply: (evaluationCase, result) => {
      const assignment = result.assignments.find((item) => item.workerType === "volunteer") ?? firstAssignment(result);
      const canonical = evaluationCase.input.workers.find((item) => item.id === assignment.workerId);
      if (canonical) canonical.workerType = "volunteer";
      assignment.workerType = "volunteer";
      assignment.worker.workerType = "volunteer";
      assignment.startTime = "09:00";
      assignment.endTime = "16:00";
    },
  },
  {
    id: "employee-shift-over-eight-hours",
    expectedCode: "EMPLOYEE_SHIFT_LIMIT_EXCEEDED",
    apply: (evaluationCase, result) => {
      const assignment = firstAssignment(result);
      const canonicalWorker = evaluationCase.input.workers.find((item) => item.id === assignment.workerId);
      const canonicalShift = evaluationCase.input.shifts.find((item) => item.id === assignment.shiftId);
      if (canonicalWorker) canonicalWorker.workerType = "paid_employee";
      if (canonicalShift) canonicalShift.endTime = "18:00";
      assignment.workerType = "paid_employee";
      assignment.worker.workerType = "paid_employee";
      assignment.shift.endTime = "18:00";
      assignment.startTime = "09:00";
      assignment.endTime = "18:00";
    },
  },
  {
    id: "weekly-hours-over-limit",
    expectedCode: "MAX_WEEKLY_HOURS_EXCEEDED",
    apply: (evaluationCase, result) => {
      const assignment = firstAssignment(result);
      const canonical = evaluationCase.input.workers.find((item) => item.id === assignment.workerId);
      if (canonical) canonical.maxHoursPerWeek = 1;
    },
  },
  {
    id: "overlapping-assignments",
    expectedCode: "OVERLAPPING_ASSIGNMENTS",
    apply: (evaluationCase, result) => {
      const first = firstAssignment(result);
      const otherShift = evaluationCase.input.shifts.find((item) => item.id !== first.shiftId);
      if (!otherShift) throw new Error("Mutation fixture needs a second shift.");
      result.assignments.push({
        ...structuredClone(first),
        shiftId: otherShift.id,
        shift: structuredClone(otherShift),
        startTime: otherShift.startTime,
        endTime: otherShift.endTime,
      });
    },
  },
  {
    id: "worker-type-snapshot-mismatch",
    expectedCode: "WORKER_TYPE_REFERENCE_MISMATCH",
    apply: (_case, result) => { firstAssignment(result).workerType = "supervisor"; },
  },
  {
    id: "overstaffed-shift",
    expectedCode: "SHIFT_OVERSTAFFED",
    apply: (evaluationCase, result) => {
      const first = firstAssignment(result);
      const alternate = evaluationCase.input.workers.find((item) => item.id !== first.workerId);
      if (!alternate) throw new Error("Mutation fixture needs another worker.");
      result.assignments.push({
        ...structuredClone(first),
        workerId: alternate.id,
        worker: structuredClone(alternate),
        workerType: alternate.workerType,
      });
    },
  },
  {
    id: "missing-required-supervisor",
    expectedCode: "REQUIRED_SUPERVISOR_MISSING",
    apply: (evaluationCase) => {
      evaluationCase.input.shifts[0].requiresSupervisor = true;
      evaluationCase.input.shifts[0].requiredSupervisors = 1;
    },
  },
  {
    id: "minimum-paid-staff",
    expectedCode: "MINIMUM_PAID_STAFF_NOT_MET",
    apply: (evaluationCase, result) => {
      const first = firstAssignment(result);
      const target = evaluationCase.input.shifts.find((item) => item.id === first.shiftId);
      if (target) target.minPaidStaff = 1;
      const canonical = evaluationCase.input.workers.find((item) => item.id === first.workerId);
      if (canonical) canonical.workerType = "volunteer";
      first.workerType = "volunteer";
      first.worker.workerType = "volunteer";
    },
  },
  {
    id: "maximum-paid-staff",
    expectedCode: "MAXIMUM_PAID_STAFF_EXCEEDED",
    apply: (evaluationCase, result) => {
      const first = firstAssignment(result);
      const target = evaluationCase.input.shifts.find((item) => item.id === first.shiftId);
      if (target) target.maxPaidStaff = 0;
      const canonical = evaluationCase.input.workers.find((item) => item.id === first.workerId);
      if (canonical) canonical.workerType = "paid_employee";
      first.workerType = "paid_employee";
      first.worker.workerType = "paid_employee";
    },
  },
  {
    id: "required-assignment-removed",
    expectedCode: "REQUIRED_ASSIGNMENT_MISSING",
    apply: (evaluationCase) => {
      evaluationCase.requiredAssignments = [{ workerId: "not-assigned", shiftId: evaluationCase.input.shifts[0].id }];
    },
  },
  {
    id: "forbidden-assignment-added",
    expectedCode: "FORBIDDEN_ASSIGNMENT_PRESENT",
    apply: (evaluationCase, result) => {
      const first = firstAssignment(result);
      evaluationCase.forbiddenAssignments = [{ workerId: first.workerId, shiftId: first.shiftId }];
    },
  },
  {
    id: "invalid-shift-time",
    expectedCode: "INVALID_SHIFT_TIME",
    apply: (evaluationCase) => {
      evaluationCase.input.shifts[0].endTime = evaluationCase.input.shifts[0].startTime;
    },
  },
  {
    id: "duplicate-shift-id",
    expectedCode: "DUPLICATE_SHIFT_ID",
    apply: (evaluationCase) => {
      evaluationCase.input.shifts[1].id = evaluationCase.input.shifts[0].id;
    },
  },
];

export function runMutationSuite(): MutationResult {
  const originalCase = baseCase();
  const originalResult = runProductionScheduler(originalCase);
  const mutants = mutations.map((mutation) => {
    const evaluationCase = structuredClone(originalCase);
    const result = structuredClone(originalResult);
    mutation.apply(evaluationCase, result);
    const observedCodes = [...new Set(validateSchedule(evaluationCase, result).map((item) => item.code))].sort();
    return {
      id: mutation.id,
      expectedCode: mutation.expectedCode,
      killed: observedCodes.includes(mutation.expectedCode),
      observedCodes,
    };
  });
  const killed = mutants.filter((item) => item.killed).length;
  return {
    category: "M-validator-mutation-testing",
    total: mutants.length,
    killed,
    survived: mutants.length - killed,
    score: Math.round((killed / mutants.length) * 10_000) / 100,
    mutants,
  };
}
