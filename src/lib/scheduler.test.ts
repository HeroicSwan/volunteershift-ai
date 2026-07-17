import { describe, expect, it } from "vitest";
import {
  assignMinimumPaidStaff,
  assignRequiredSupervisor,
  calculateMatchScore,
  detectConflicts,
  fillRemainingCoverage,
  generateOptimizedSchedule,
  getAssignmentDurationHours,
  getCoverageRiskLevel,
  getFairnessStats,
  getCoverageMetrics,
  getLaborCostStats,
  getUncoveredShifts,
} from "./scheduler";
import { createSampleData, createTestStaff, createTestStaffShifts } from "./sample-data";
import { DAYS, type ScheduleAssignment, type Shift, type Worker } from "../types";

function makeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: "worker-1",
    name: "Jordan Lee",
    email: "jordan@example.org",
    workerType: "volunteer",
    roles: ["Food Service"],
    availability: { Monday: [{ start: "08:00", end: "17:00" }] },
    preferredDays: [],
    preferredRoles: [],
    maxShiftsPerWeek: 3,
    desiredHoursPerWeek: 12,
    maxHoursPerWeek: 12,
    notes: "",
    ...overrides,
  };
}

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    title: "Pantry Support",
    date: "2026-07-13",
    startTime: "09:00",
    endTime: "12:00",
    location: "Community Center",
    requiredRole: "Food Service",
    requiredWorkers: 1,
    requiresSupervisor: false,
    priority: "Normal",
    notes: "",
    ...overrides,
  };
}

function makeAssignment(worker: Worker, shift: Shift): ScheduleAssignment {
  return {
    shiftId: shift.id,
    workerId: worker.id,
    worker,
    shift,
    startTime: shift.startTime,
    endTime: shift.endTime,
    workerType: worker.workerType,
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
    reasons: [],
    warnings: [],
  };
}

describe("calculateMatchScore", () => {
  it("rewards preferences and explains every component", () => {
    const worker = makeWorker({ preferredDays: ["Monday"], preferredRoles: ["Food Service"] });
    const match = calculateMatchScore(worker, makeShift({ priority: "High" }));

    // 50 base + 12 day + 12 role + 8 first-of-week (no volunteer bonus on a High shift)
    expect(match.eligible).toBe(true);
    expect(match.score).toBe(84);
    expect(match.reasons).toContain("Monday is a preferred day");
    expect(match.reasons).toContain("Food Service is a preferred role");
  });

  it("prefers volunteers for routine shifts and paid staff for urgent ones", () => {
    const volunteer = makeWorker({ id: "v", name: "Volunteer" });
    const paid = makeWorker({ id: "p", name: "Paid", workerType: "paid_employee" });

    const routine = makeShift({ priority: "Low" });
    expect(calculateMatchScore(volunteer, routine).score).toBeGreaterThan(
      calculateMatchScore(paid, routine).score,
    );
    expect(calculateMatchScore(volunteer, routine).reasons).toContain(
      "Volunteer supports routine coverage",
    );

    const urgent = makeShift({ priority: "Urgent" });
    expect(calculateMatchScore(paid, urgent).score).toBeGreaterThan(
      calculateMatchScore(volunteer, urgent).score,
    );
    expect(calculateMatchScore(paid, urgent).reasons).toContain(
      "Paid staff strengthens priority coverage",
    );
  });

  it("raises scores for reliable workers and warns about unreliable ones", () => {
    const reliable = calculateMatchScore(makeWorker({ reliabilityScore: 5 }), makeShift());
    const unrated = calculateMatchScore(makeWorker(), makeShift());
    const shaky = calculateMatchScore(makeWorker({ reliabilityScore: 1 }), makeShift());

    expect(reliable.score).toBe(unrated.score + 10);
    expect(reliable.reasons).toContain("Reliability 5/5 boosts confidence");
    expect(shaky.score).toBe(unrated.score - 10);
    expect(shaky.warnings).toContain("Reliability 1/5—consider lining up a backup");
  });

  it("rejects workers without full-shift availability", () => {
    const worker = makeWorker({ availability: { Monday: [{ start: "08:00", end: "10:00" }] } });
    expect(calculateMatchScore(worker, makeShift()).eligible).toBe(false);
  });

  it("respects the weekly shift limit", () => {
    const worker = makeWorker({ maxShiftsPerWeek: 1 });
    const assigned = makeAssignment(worker, makeShift({ id: "other", startTime: "13:00", endTime: "15:00" }));
    expect(calculateMatchScore(worker, makeShift(), [assigned]).eligible).toBe(false);
  });

  it("respects weekly hours capacity even when shift count remains", () => {
    const worker = makeWorker({ maxShiftsPerWeek: 4, desiredHoursPerWeek: 4, maxHoursPerWeek: 4 });
    const assigned = makeAssignment(worker, makeShift({ id: "other", startTime: "08:00", endTime: "12:00" }));

    const result = calculateMatchScore(worker, makeShift(), [assigned]);

    expect(result.eligible).toBe(false);
    expect(result.warnings).toContain("Maximum weekly hours reached—overtime is not allowed");
  });

  it("uses paid employment status when scoring priority coverage", () => {
    const fullTime = makeWorker({ id: "full", workerType: "paid_employee", employmentType: "full_time" });
    const partTime = makeWorker({ id: "part", workerType: "paid_employee", employmentType: "part_time" });
    const urgent = makeShift({ priority: "Urgent" });

    expect(calculateMatchScore(fullTime, urgent).score).toBeGreaterThan(calculateMatchScore(partTime, urgent).score);
    expect(calculateMatchScore(fullTime, urgent).reasons).toContain("Full-time staff supports priority coverage");
  });
});

describe("assignRequiredSupervisor", () => {
  it("assigns a supervisor first even when others score higher", () => {
    const starVolunteer = makeWorker({
      id: "v",
      name: "Star Volunteer",
      preferredDays: ["Monday"],
      preferredRoles: ["Food Service"],
      reliabilityScore: 5,
    });
    const supervisor = makeWorker({ id: "s", name: "Sam Lead", workerType: "supervisor" });
    const shift = makeShift({ requiresSupervisor: true, requiredWorkers: 2 });
    const assignments: ScheduleAssignment[] = [];

    const assignment = assignRequiredSupervisor(shift, [starVolunteer, supervisor], assignments);

    expect(assignment?.workerType).toBe("supervisor");
    expect(assignment?.reasons[0]).toBe("Covers the required supervisor spot");
    expect(assignments).toHaveLength(1);
  });

  it("returns undefined when no supervisor is eligible", () => {
    const shift = makeShift({ requiresSupervisor: true });
    expect(assignRequiredSupervisor(shift, [makeWorker()], [])).toBeUndefined();
  });

  it("never treats a volunteer as a supervisor", () => {
    const volunteer = makeWorker({ workerType: "volunteer", roles: ["Welcome Desk"] });
    const shift = makeShift({ requiresSupervisor: true, requiredRole: "Welcome Desk" });

    expect(assignRequiredSupervisor(shift, [volunteer], [])).toBeUndefined();
  });
});

describe("assignMinimumPaidStaff", () => {
  it("fills the paid minimum before volunteers take spots", () => {
    const volunteer = makeWorker({ id: "v", name: "Volunteer" });
    const paid = makeWorker({ id: "p", name: "Paid", workerType: "paid_employee" });
    const shift = makeShift({ priority: "Low", requiredWorkers: 2, minPaidStaff: 1 });
    const assignments: ScheduleAssignment[] = [];

    const added = assignMinimumPaidStaff(shift, [volunteer, paid], assignments);

    expect(added).toHaveLength(1);
    expect(added[0].workerType).toBe("paid_employee");
    expect(added[0].reasons[0]).toBe("Fills the minimum paid staffing rule");
  });
});

describe("fillRemainingCoverage", () => {
  it("stops assigning paid staff once the cap is reached", () => {
    const paidA = makeWorker({ id: "p1", name: "Paid A", workerType: "paid_employee" });
    const paidB = makeWorker({ id: "p2", name: "Paid B", workerType: "paid_employee" });
    const volunteer = makeWorker({ id: "v", name: "Volunteer" });
    const shift = makeShift({ priority: "Urgent", requiredWorkers: 2, maxPaidStaff: 1 });
    const assignments: ScheduleAssignment[] = [];

    fillRemainingCoverage(shift, [paidA, paidB, volunteer], assignments);

    expect(assignments).toHaveLength(2);
    expect(assignments.filter((item) => item.workerType === "paid_employee")).toHaveLength(1);
    expect(assignments.some((item) => item.workerId === "v")).toBe(true);
  });

  it("exceeds the paid cap with a warning rather than leaving a spot unfilled", () => {
    const paidA = makeWorker({ id: "p1", name: "Paid A", workerType: "paid_employee" });
    const paidB = makeWorker({ id: "p2", name: "Paid B", workerType: "paid_employee" });
    const shift = makeShift({ requiredWorkers: 2, maxPaidStaff: 1 });
    const assignments: ScheduleAssignment[] = [];

    fillRemainingCoverage(shift, [paidA, paidB], assignments);

    expect(assignments).toHaveLength(2);
    expect(assignments[1].warnings).toContain("Exceeds the paid staff cap to avoid an unfilled spot");
  });
});

describe("generateOptimizedSchedule", () => {
  it("prioritizes urgent shifts when one worker cannot cover overlapping work", () => {
    const worker = makeWorker({ maxShiftsPerWeek: 1 });
    const urgentShift = makeShift({ id: "urgent", priority: "Urgent" });
    const lowShift = makeShift({ id: "low", priority: "Low" });
    const result = generateOptimizedSchedule([worker], [lowShift, urgentShift]);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].shiftId).toBe("urgent");
    expect(result.uncoveredShifts[0].shift.id).toBe("low");
  });

  it("layers supervisor, paid minimum, and volunteer coverage on one shift", () => {
    const supervisor = makeWorker({ id: "s", name: "Sam Lead", workerType: "supervisor", hourlyRate: 24 });
    const paid = makeWorker({ id: "p", name: "Paula Paid", workerType: "paid_employee", hourlyRate: 18 });
    const volunteer = makeWorker({ id: "v", name: "Vic Volunteer" });
    const shift = makeShift({ requiredWorkers: 3, requiresSupervisor: true, minPaidStaff: 2 });

    const result = generateOptimizedSchedule([volunteer, paid, supervisor], [shift]);
    const byWorker = new Map(result.assignments.map((item) => [item.workerId, item]));

    expect(result.assignments).toHaveLength(3);
    expect(byWorker.get("s")?.reasons[0]).toBe("Covers the required supervisor spot");
    expect(byWorker.get("p")?.reasons[0]).toBe("Fills the minimum paid staffing rule");
    expect(byWorker.get("v")).toBeDefined();
    expect(result.shiftRisks[0].level).toBe("low");
  });

  it("estimates cost for paid assignments and flags missing rates", () => {
    const paid = makeWorker({ id: "p", workerType: "paid_employee", hourlyRate: 20 });
    const unpriced = makeWorker({ id: "u", name: "Un Priced", workerType: "paid_employee" });
    const volunteer = makeWorker({ id: "v", name: "Vic Volunteer" });
    const shift = makeShift({ requiredWorkers: 3, startTime: "09:00", endTime: "12:00" });

    const result = generateOptimizedSchedule([paid, unpriced, volunteer], [shift]);
    const byWorker = new Map(result.assignments.map((item) => [item.workerId, item]));

    expect(byWorker.get("p")?.estimatedCost).toBe(60);
    expect(byWorker.get("v")?.estimatedCost).toBe(0);
    expect(byWorker.get("u")?.estimatedCost).toBe(0);
    expect(byWorker.get("u")?.warnings).toContain("No hourly rate on file—excluded from cost estimates");
    expect(result.laborCostStats.totalEstimatedCost).toBe(60);
    expect(result.laborCostStats.missingRates).toBe(1);
    expect(result.laborCostStats.volunteerAssignments).toBe(1);
  });

  it("spreads work across eligible workers", () => {
    const first = makeWorker({ maxShiftsPerWeek: 1 });
    const second = makeWorker({ id: "worker-2", name: "Maya Thompson" });
    const laterShift = makeShift({ id: "shift-2", startTime: "13:00", endTime: "15:00" });
    const result = generateOptimizedSchedule([first, second], [makeShift(), laterShift]);

    expect(result.assignments).toHaveLength(2);
    expect(new Set(result.assignments.map((assignment) => assignment.workerId)).size).toBe(2);
  });

  it("balances a full week instead of consuming everyone at the start", () => {
    const availability = Object.fromEntries(
      DAYS.map((day) => [day, [{ start: "09:00", end: "13:00" }]]),
    ) as Worker["availability"];
    const workers = Array.from({ length: 4 }, (_, index) =>
      makeWorker({
        id: `weekly-worker-${index}`,
        name: `Weekly Worker ${index}`,
        workerType: "paid_employee",
        employmentType: "part_time",
        availability,
        maxShiftsPerWeek: 4,
        desiredHoursPerWeek: 14,
        maxHoursPerWeek: 16,
      }),
    );
    const shifts = Array.from({ length: 7 }, (_, index) =>
      makeShift({
        id: `daily-shift-${index}`,
        date: `2026-07-${String(13 + index).padStart(2, "0")}`,
        startTime: "09:00",
        endTime: "13:00",
        requiredWorkers: 2,
        minPaidStaff: 2,
      }),
    );
    const result = generateOptimizedSchedule(workers, shifts);

    expect(result.uncoveredShifts).toHaveLength(0);
    expect(result.partiallyCoveredShifts).toHaveLength(0);
    expect(shifts.every((shift) => result.assignments.filter((item) => item.shiftId === shift.id).length === 2)).toBe(true);
    for (const worker of workers) {
      const dates = result.assignments
        .filter((assignment) => assignment.workerId === worker.id)
        .map((assignment) => assignment.shift.date)
        .sort();
      expect(dates.length).toBeGreaterThanOrEqual(3);
      expect(Number(dates.at(-1)?.slice(-2)) - Number(dates[0].slice(-2))).toBeGreaterThanOrEqual(4);
    }
  });

  it("uses 3–4 hour volunteer blocks and never exceeds six hours", () => {
    const volunteers = Array.from({ length: 6 }, (_, index) =>
      makeWorker({
        id: `volunteer-${index}`,
        name: `Volunteer ${index}`,
        availability: { Monday: [{ start: "08:00", end: "18:00" }] },
        desiredHoursPerWeek: 4,
        maxHoursPerWeek: 6,
      }),
    );
    const longShift = makeShift({ startTime: "09:00", endTime: "18:00", requiredWorkers: 2 });
    const result = generateOptimizedSchedule(volunteers, [longShift]);
    const durations = result.assignments.map(getAssignmentDurationHours);
    const average = durations.reduce((sum, hours) => sum + hours, 0) / durations.length;

    expect(result.uncoveredShifts).toHaveLength(0);
    expect(result.partiallyCoveredShifts).toHaveLength(0);
    expect(Math.max(...durations)).toBeLessThanOrEqual(6);
    expect(average).toBeGreaterThanOrEqual(3);
    expect(average).toBeLessThanOrEqual(4);
  });
});

describe("getLaborCostStats", () => {
  it("totals per-shift paid costs across the schedule", () => {
    const paid = makeWorker({ id: "p", workerType: "paid_employee", hourlyRate: 15 });
    const shiftA = makeShift({ id: "a", startTime: "09:00", endTime: "11:00" });
    const shiftB = makeShift({ id: "b", startTime: "13:00", endTime: "17:00" });
    const assignments = [makeAssignment(paid, shiftA), makeAssignment(paid, shiftB)].map((item) => ({
      ...item,
      estimatedCost: item.shiftId === "a" ? 30 : 60,
    }));

    const stats = getLaborCostStats([shiftA, shiftB], assignments);

    expect(stats.totalEstimatedCost).toBe(90);
    expect(stats.paidAssignments).toBe(2);
    expect(stats.shifts.find((item) => item.shift.id === "b")?.estimatedCost).toBe(60);
  });
});

describe("getCoverageRiskLevel", () => {
  it("marks an unstaffed urgent shift as critical", () => {
    const risk = getCoverageRiskLevel(makeShift({ priority: "Urgent", requiredWorkers: 2 }), []);

    expect(risk.level).toBe("critical");
    expect(risk.reasons).toContain("No workers assigned");
  });

  it("flags a covered shift that is missing its supervisor", () => {
    const volunteer = makeWorker();
    const shift = makeShift({ requiresSupervisor: true, requiredWorkers: 1 });
    const risk = getCoverageRiskLevel(shift, [makeAssignment(volunteer, shift)]);

    expect(risk.level).toBe("high");
    expect(risk.reasons).toContain("Required supervisor not assigned");
  });

  it("flags a paid staffing shortfall and reports low risk when rules are met", () => {
    const volunteer = makeWorker();
    const shift = makeShift({ requiredWorkers: 1, minPaidStaff: 1 });
    const short = getCoverageRiskLevel(shift, [makeAssignment(volunteer, shift)]);
    expect(short.level).toBe("high");
    expect(short.reasons).toContain("Only 0 of 1 minimum paid staff assigned");

    const paid = makeWorker({ id: "p", workerType: "paid_employee" });
    const met = getCoverageRiskLevel(shift, [makeAssignment(paid, shift)]);
    expect(met.level).toBe("low");
    expect(met.reasons).toContain("Fully staffed with all staffing rules met");
  });
});

describe("full coverage on the demo nonprofit roster", () => {
  it("covers every shift, every time", () => {
    const { workers, shifts } = createSampleData();
    const result = generateOptimizedSchedule(workers, shifts);

    expect(result.uncoveredShifts).toEqual([]);
    expect(result.partiallyCoveredShifts).toEqual([]);
    expect(getCoverageMetrics(shifts, result.assignments).coverageRate).toBe(100);
    expect(result.validation.valid).toBe(true);
  });

  it("covers the combined nonprofit and daily-operations demo without high-risk gaps", () => {
    const sample = createSampleData();
    const workers = [...sample.workers, ...createTestStaff()];
    const shifts = [...sample.shifts, ...createTestStaffShifts()];
    const result = generateOptimizedSchedule(workers, shifts);

    expect(result.shiftRisks.filter((risk) => risk.level === "high")).toEqual([]);
    expect(getCoverageMetrics(shifts, result.assignments).coverageRate).toBe(100);
    expect(result.validation.valid).toBe(true);
  });

  it("is deterministic across repeated runs", () => {
    const { workers, shifts } = createSampleData();
    const first = generateOptimizedSchedule(workers, shifts);
    const second = generateOptimizedSchedule(workers, shifts);

    const signature = (result: ReturnType<typeof generateOptimizedSchedule>) =>
      result.assignments
        .map((item) => `${item.shift.date}|${item.shiftId}|${item.workerId}|${item.startTime}-${item.endTime}`)
        .sort()
        .join("\n");
    expect(signature(first)).toBe(signature(second));
  });

  it("keeps routine days on free volunteers so cost lands only where rules require paid staff", () => {
    const { workers, shifts } = createSampleData();
    const result = generateOptimizedSchedule(workers, shifts);
    const dayOf = (date: string) => DAYS[(new Date(`${date}T12:00:00`).getDay() + 6) % 7];
    const paidByDay = new Map<string, number>();
    for (const assignment of result.assignments) {
      if (assignment.workerType !== "volunteer") {
        paidByDay.set(dayOf(assignment.shift.date), (paidByDay.get(dayOf(assignment.shift.date)) ?? 0) + 1);
      }
    }
    // Monday (Food Service), Tuesday (Inventory) and Friday (Food Service) can
    // all be fully covered by volunteers, so no paid staff should be spent there.
    expect(paidByDay.get("Monday") ?? 0).toBe(0);
    expect(paidByDay.get("Tuesday") ?? 0).toBe(0);
    expect(paidByDay.get("Friday") ?? 0).toBe(0);
  });
});

describe("cost efficiency", () => {
  it("prefers a volunteer over a paid worker when both cover a routine shift", () => {
    const volunteer = makeWorker({ id: "vol", name: "Vol Unteer", workerType: "volunteer" });
    const paid = makeWorker({ id: "paid", name: "Pat Paid", workerType: "paid_employee", employmentType: "part_time", hourlyRate: 20 });
    const shift = makeShift({ priority: "Normal", requiredWorkers: 1 });

    const result = generateOptimizedSchedule([paid, volunteer], [shift]);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].workerId).toBe("vol");
    expect(result.laborCostStats.totalEstimatedCost).toBe(0);
  });

  it("still uses paid staff when no volunteer can cover the role", () => {
    const paidCheap = makeWorker({ id: "cheap", name: "Cheap One", workerType: "paid_employee", employmentType: "part_time", hourlyRate: 15, roles: ["Driver"] });
    const paidPricey = makeWorker({ id: "pricey", name: "Pricey Two", workerType: "paid_employee", employmentType: "full_time", hourlyRate: 30, roles: ["Driver"] });
    const shift = makeShift({ requiredRole: "Driver", requiredWorkers: 1, priority: "Normal" });

    const result = generateOptimizedSchedule([paidPricey, paidCheap], [shift]);

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].workerId).toBe("cheap");
  });
});

describe("schedule utilities", () => {
  const worker = makeWorker();
  const shift = makeShift();
  const assignment = makeAssignment(worker, shift);

  it("detects overlaps for an already assigned worker", () => {
    const overlap = makeShift({ id: "shift-2", startTime: "11:00", endTime: "13:00" });
    expect(detectConflicts(worker, overlap, [assignment])).toBe(true);
  });

  it("reports coverage gaps and fairness counts", () => {
    const gap = getUncoveredShifts([makeShift({ requiredWorkers: 2 })], [assignment]);
    const fairness = getFairnessStats([worker], [assignment]);

    expect(gap[0].status).toBe("partial");
    expect(gap[0].missingWorkers).toBe(1);
    expect(fairness.workers[0].assignedShifts).toBe(1);
  });
});
