import { describe, expect, it } from "vitest";
import {
  generateOptimizedSchedule,
  getAssignmentDurationHours,
  getCoverageMetrics,
  repairUncoveredShifts,
} from "./scheduler";
import { DAYS, type DayOfWeek, type ScheduleAssignment, type Shift, type Worker } from "../types";

function availability(days: readonly DayOfWeek[] = DAYS, start = "08:00", end = "18:00") {
  return Object.fromEntries(days.map((day) => [day, [{ start, end }]])) as Worker["availability"];
}

function worker(id: string, overrides: Partial<Worker> = {}): Worker {
  return {
    id,
    name: id,
    email: `${id}@example.org`,
    workerType: "volunteer",
    roles: ["General"],
    availability: availability(),
    preferredDays: [],
    preferredRoles: [],
    maxShiftsPerWeek: 4,
    desiredHoursPerWeek: 12,
    maxHoursPerWeek: 16,
    notes: "",
    ...overrides,
  };
}

function shift(id: string, date: string, overrides: Partial<Shift> = {}): Shift {
  return {
    id,
    title: id,
    date,
    startTime: "09:00",
    endTime: "13:00",
    location: "Community Center",
    requiredRole: "General",
    requiredWorkers: 1,
    requiresSupervisor: false,
    priority: "Normal",
    notes: "",
    ...overrides,
  };
}

function assignment(assignedWorker: Worker, assignedShift: Shift): ScheduleAssignment {
  return {
    shiftId: assignedShift.id,
    workerId: assignedWorker.id,
    worker: assignedWorker,
    shift: assignedShift,
    startTime: assignedShift.startTime,
    endTime: assignedShift.endTime,
    workerType: assignedWorker.workerType,
    matchScore: 80,
    scoreBreakdown: {
      base: 80,
      preferredDay: 0,
      preferredRole: 0,
      reliability: 0,
      workerTypeFit: 0,
      employmentFit: 0,
      fairnessPenalty: 0,
      consecutiveDayPenalty: 0,
      laborCostPenalty: 0,
      roleMismatchPenalty: 0,
      total: 80,
    },
    estimatedCost: 0,
    reasons: ["Test assignment"],
    warnings: [],
  };
}

describe("deterministic scheduler repair scenarios", () => {
  it("1. covers and balances a basic seven-day week", () => {
    const workers = Array.from({ length: 10 }, (_, index) => worker(`volunteer-${index}`, { maxShiftsPerWeek: 3 }));
    const shifts = Array.from({ length: 7 }, (_, index) =>
      shift(`day-${index}`, `2026-07-${String(13 + index).padStart(2, "0")}`, { requiredWorkers: 3 }),
    );
    const result = generateOptimizedSchedule({ workers, shifts });
    const repeated = generateOptimizedSchedule({ workers, shifts });
    const counts = workers.map((item) => result.assignments.filter((assignment) => assignment.workerId === item.id).length);

    expect(result.shiftResults.every((item) => item.coverageStatus === "covered")).toBe(true);
    expect(result.shiftResults.every((item) => item.assignedWorkers.length === 3)).toBe(true);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(result.validation.valid).toBe(true);
    expect(repeated.assignments.map((item) => [item.shiftId, item.workerId, item.startTime, item.endTime])).toEqual(
      result.assignments.map((item) => [item.shiftId, item.workerId, item.startTime, item.endTime]),
    );
  });

  it("2. uses early-week volunteers and later-week paid staff", () => {
    const volunteers = Array.from({ length: 6 }, (_, index) => worker(`early-volunteer-${index}`, {
      availability: availability(["Monday", "Tuesday", "Wednesday"]),
      maxShiftsPerWeek: 2,
    }));
    const paid = Array.from({ length: 4 }, (_, index) => worker(`paid-${index}`, {
      workerType: "paid_employee",
      employmentType: "part_time",
      availability: availability(["Thursday", "Friday", "Saturday", "Sunday"]),
      maxShiftsPerWeek: 4,
      desiredHoursPerWeek: 16,
      maxHoursPerWeek: 20,
      hourlyRate: 18,
    }));
    const shifts = Array.from({ length: 7 }, (_, index) =>
      shift(`coverage-${index}`, `2026-07-${String(13 + index).padStart(2, "0")}`, { requiredWorkers: 2 }),
    );
    const result = generateOptimizedSchedule([...volunteers, ...paid], shifts);

    expect(result.shiftResults.every((item) => item.coverageStatus === "covered")).toBe(true);
    expect(result.assignments.filter((item) => item.shift.date <= "2026-07-15").some((item) => item.workerType === "volunteer")).toBe(true);
    expect(result.assignments.filter((item) => item.shift.date >= "2026-07-16").every((item) => item.workerType === "paid_employee")).toBe(true);
  });

  it("3. prioritizes supervisors and flags the shift that cannot get one", () => {
    const supervisors = ["lead-a", "lead-b"].map((id) => worker(id, {
      workerType: "supervisor",
      employmentType: "full_time",
      maxShiftsPerWeek: 1,
      desiredHoursPerWeek: 4,
      maxHoursPerWeek: 8,
      hourlyRate: 25,
    }));
    const backup = worker("backup", { workerType: "paid_employee", employmentType: "part_time", hourlyRate: 18 });
    const shifts = [
      shift("lead-1", "2026-07-13", { startTime: "09:00", endTime: "11:00", requiresSupervisor: true }),
      shift("lead-2", "2026-07-13", { startTime: "11:00", endTime: "13:00", requiresSupervisor: true }),
      shift("lead-3", "2026-07-13", { startTime: "13:00", endTime: "15:00", requiresSupervisor: true }),
    ];
    const result = generateOptimizedSchedule([...supervisors, backup], shifts);
    const missing = result.shiftResults.filter((item) => item.supervisorStatus === "missing");

    expect(result.assignments.filter((item) => item.workerType === "supervisor")).toHaveLength(2);
    expect(missing).toHaveLength(1);
    expect(missing[0].riskLevel === "high" || missing[0].riskLevel === "critical").toBe(true);
  });

  it("4. respects max shifts for a high-scoring worker", () => {
    const star = worker("star", { reliabilityScore: 5, preferredDays: [...DAYS], maxShiftsPerWeek: 2 });
    const alternatives = Array.from({ length: 3 }, (_, index) => worker(`alternative-${index}`));
    const shifts = Array.from({ length: 5 }, (_, index) =>
      shift(`max-${index}`, `2026-07-${String(13 + index).padStart(2, "0")}`),
    );
    const result = generateOptimizedSchedule([star, ...alternatives], shifts);

    expect(result.assignments.filter((item) => item.workerId === star.id).length).toBeLessThanOrEqual(2);
    expect(new Set(result.assignments.map((item) => item.workerId)).size).toBeGreaterThan(1);
  });

  it("5. prevents one worker from taking overlapping shifts", () => {
    const onlyWorker = worker("overlap-worker");
    const shifts = [
      shift("overlap-a", "2026-07-13", { startTime: "09:00", endTime: "12:00" }),
      shift("overlap-b", "2026-07-13", { startTime: "10:00", endTime: "13:00" }),
    ];
    const result = generateOptimizedSchedule([onlyWorker], shifts);

    expect(result.assignments).toHaveLength(1);
    expect(result.shiftResults.filter((item) => item.coverageStatus !== "covered")).toHaveLength(1);
  });

  it("6. saves the scarce worker for the rare-role shift", () => {
    const rare = worker("rare-worker", { roles: ["General", "Nurse"], maxShiftsPerWeek: 1 });
    const general = [worker("general-a"), worker("general-b")];
    const shifts = [
      shift("generic", "2026-07-13", { startTime: "09:00", endTime: "11:00" }),
      shift("medical", "2026-07-13", { startTime: "12:00", endTime: "14:00", requiredRole: "Nurse" }),
    ];
    const result = generateOptimizedSchedule([rare, ...general], shifts);

    expect(result.assignments.find((item) => item.shiftId === "medical")?.workerId).toBe("rare-worker");
    expect(result.shiftResults.every((item) => item.coverageStatus === "covered")).toBe(true);

    const fallback = generateOptimizedSchedule([general[0]], [
      shift("emergency-role", "2026-07-14", { requiredRole: "Driver" }),
    ]);
    expect(fallback.assignments[0].warnings.some((warning) => warning.includes("Emergency role mismatch"))).toBe(true);
  });

  it("7. uses reliable paid coverage for a scarce urgent shift and explains cost", () => {
    const volunteer = worker("urgent-volunteer", { reliabilityScore: 3 });
    const paid = worker("urgent-paid", {
      workerType: "paid_employee",
      employmentType: "full_time",
      reliabilityScore: 5,
      hourlyRate: 22,
    });
    const urgent = shift("urgent", "2026-07-13", { priority: "Urgent" });
    const result = generateOptimizedSchedule([volunteer, paid], [urgent]);
    const selected = result.assignments[0];

    expect(selected.workerId).toBe("urgent-paid");
    expect(selected.estimatedCost).toBe(88);
    expect(selected.warnings.some((warning) => warning.includes("Paid priority coverage"))).toBe(true);
  });

  it("8. repairs an uncovered rare-role shift by swapping a generic assignment", () => {
    const rare = worker("repair-rare", {
      roles: ["General", "Nurse"],
      availability: availability(["Monday", "Tuesday"]),
      maxShiftsPerWeek: 1,
    });
    const general = worker("repair-general", { availability: availability(["Monday"]) });
    const genericShift = shift("repair-generic", "2026-07-13");
    const rareShift = shift("repair-medical", "2026-07-14", { requiredRole: "Nurse" });
    const context = {
      workers: [rare, general],
      shifts: [genericShift, rareShift],
      assignments: [assignment(rare, genericShift)],
    };
    const before = getCoverageMetrics(context.shifts, context.assignments).coveredWorkerHours;

    repairUncoveredShifts(context);

    expect(getCoverageMetrics(context.shifts, context.assignments).coveredWorkerHours).toBeGreaterThan(before);
    expect(context.assignments.find((item) => item.shiftId === rareShift.id)?.workerId).toBe(rare.id);
    expect(context.assignments.find((item) => item.shiftId === genericShift.id)?.workerId).toBe(general.id);
    expect(context.assignments.every((item) => getAssignmentDurationHours(item) === 4)).toBe(true);
  });
});
