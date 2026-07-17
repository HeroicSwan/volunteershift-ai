import {
  generateOptimizedSchedule,
  type ScheduleInput,
} from "../src/lib/scheduler";
import {
  DAYS,
  isPaidWorker,
  type DayOfWeek,
  type OptimizedScheduleResult,
  type ScheduleAssignment,
  type Shift,
  type Worker,
} from "../src/types";
import type {
  AssignmentExpectation,
  EvaluationCase,
  EvaluationMetrics,
  EvaluationStatus,
  ValidationIssue,
} from "./schema";

const SLOT_MINUTES = 30;

function issue(
  code: string,
  explanation: string,
  expected: unknown,
  actual: unknown,
  context: { workerId?: string; shiftId?: string; severity?: "hard" | "soft" } = {},
): ValidationIssue {
  return {
    severity: context.severity ?? "hard",
    code,
    explanation,
    workerId: context.workerId,
    shiftId: context.shiftId,
    expected,
    actual,
  };
}

function validTime(time: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function minutes(time: string) {
  if (!validTime(time)) return Number.NaN;
  const [hours, minute] = time.split(":").map(Number);
  return hours * 60 + minute;
}

function duration(startTime: string, endTime: string) {
  return Math.max(0, minutes(endTime) - minutes(startTime)) / 60;
}

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function dayOf(date: string): DayOfWeek | undefined {
  if (!validDate(date)) return undefined;
  return DAYS[(new Date(`${date}T12:00:00`).getDay() + 6) % 7];
}

function weekKey(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const dayFromMonday = (parsed.getDay() + 6) % 7;
  parsed.setDate(parsed.getDate() - dayFromMonday);
  return parsed.toISOString().slice(0, 10);
}

function assignmentHours(assignment: ScheduleAssignment) {
  return duration(assignment.startTime, assignment.endTime);
}

function assignmentMatches(assignment: ScheduleAssignment, expected: AssignmentExpectation) {
  return assignment.workerId === expected.workerId &&
    assignment.shiftId === expected.shiftId &&
    (expected.startTime === undefined || assignment.startTime === expected.startTime) &&
    (expected.endTime === undefined || assignment.endTime === expected.endTime);
}

function assignmentsForShift(shiftId: string, assignments: ScheduleAssignment[]) {
  return assignments.filter((assignment) => assignment.shiftId === shiftId);
}

function assignmentsForSlot(shiftId: string, start: number, end: number, assignments: ScheduleAssignment[]) {
  return assignmentsForShift(shiftId, assignments).filter(
    (assignment) => minutes(assignment.startTime) <= start && minutes(assignment.endTime) >= end,
  );
}

function shiftSlots(shift: Shift) {
  const start = minutes(shift.startTime);
  const end = minutes(shift.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [];
  const slots: Array<{ start: number; end: number }> = [];
  for (let slotStart = start; slotStart < end; slotStart += SLOT_MINUTES) {
    slots.push({ start: slotStart, end: Math.min(end, slotStart + SLOT_MINUTES) });
  }
  return slots;
}

function paidCount(assignments: ScheduleAssignment[]) {
  return assignments.filter((assignment) => isPaidWorker(assignment.workerType)).length;
}

function workerHoursByWeek(workerId: string, assignments: ScheduleAssignment[]) {
  const totals = new Map<string, number>();
  for (const assignment of assignments.filter((item) => item.workerId === workerId && validDate(item.shift.date))) {
    const week = weekKey(assignment.shift.date);
    totals.set(week, (totals.get(week) ?? 0) + assignmentHours(assignment));
  }
  return totals;
}

function workerAssignmentsByWeek(workerId: string, assignments: ScheduleAssignment[]) {
  const totals = new Map<string, number>();
  for (const assignment of assignments.filter((item) => item.workerId === workerId && validDate(item.shift.date))) {
    const week = weekKey(assignment.shift.date);
    totals.set(week, (totals.get(week) ?? 0) + 1);
  }
  return totals;
}

export function activeWorkersForCase(evaluationCase: EvaluationCase) {
  const cancelled = new Set(evaluationCase.input.cancelledWorkerIds);
  return evaluationCase.input.workers.filter((worker) => !cancelled.has(worker.id));
}

function placeholderWorker(id: string, shift?: Shift): Worker {
  const availability = Object.fromEntries(
    DAYS.map((day) => [day, [{ start: "00:00", end: "23:59" }]]),
  ) as Worker["availability"];
  return {
    id,
    name: `Missing worker ${id}`,
    email: `${id}@missing.invalid`,
    workerType: "volunteer",
    roles: shift ? [shift.requiredRole] : [],
    availability,
    preferredDays: [],
    preferredRoles: [],
    maxShiftsPerWeek: 99,
    desiredHoursPerWeek: 40,
    maxHoursPerWeek: 40,
    notes: "Evaluation placeholder for a missing reference",
  };
}

function placeholderShift(id: string): Shift {
  return {
    id,
    title: `Missing shift ${id}`,
    date: "2026-09-14",
    startTime: "09:00",
    endTime: "13:00",
    location: "Missing location",
    requiredRole: "General Support",
    requiredWorkers: 1,
    requiresSupervisor: false,
    priority: "Normal",
    notes: "Evaluation placeholder for a missing reference",
  };
}

export function buildScheduleInput(evaluationCase: EvaluationCase): ScheduleInput {
  const workers = activeWorkersForCase(evaluationCase);
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftById = new Map(evaluationCase.input.shifts.map((shift) => [shift.id, shift]));
  const assignments = evaluationCase.input.existingAssignments.map((seed): ScheduleAssignment => {
    const shift = shiftById.get(seed.shiftId) ?? placeholderShift(seed.shiftId);
    const worker = workerById.get(seed.workerId) ?? placeholderWorker(seed.workerId, shift);
    return {
      shiftId: seed.shiftId,
      workerId: seed.workerId,
      worker,
      shift,
      startTime: seed.startTime ?? shift.startTime,
      endTime: seed.endTime ?? shift.endTime,
      workerType: worker.workerType,
      matchScore: seed.matchScore,
      scoreBreakdown: {
        base: seed.matchScore,
        preferredDay: 0,
        preferredRole: 0,
        reliability: 0,
        workerTypeFit: 0,
        employmentFit: 0,
        fairnessPenalty: 0,
        consecutiveDayPenalty: 0,
        laborCostPenalty: 0,
        roleMismatchPenalty: 0,
        total: seed.matchScore,
      },
      estimatedCost: 0,
      reasons: ["Seeded by evaluation case"],
      warnings: seed.warnings,
    };
  });
  return { workers, shifts: evaluationCase.input.shifts, assignments };
}

export function runProductionScheduler(evaluationCase: EvaluationCase) {
  return generateOptimizedSchedule(buildScheduleInput(evaluationCase));
}

export function getUnfilledShiftIds(shifts: Shift[], assignments: ScheduleAssignment[]) {
  return [...new Set(shifts.flatMap((shift) => {
    const shiftAssignments = assignmentsForShift(shift.id, assignments);
    if (shift.staffingMode === "daily_roster") {
      const assignedHours = shiftAssignments.reduce((sum, assignment) => sum + assignmentHours(assignment), 0);
      const requiredHours = shift.requiredWorkerHours ?? shift.requiredWorkers * Math.min(8, duration(shift.startTime, shift.endTime));
      return shiftAssignments.length < shift.requiredWorkers || assignedHours < requiredHours ? [shift.id] : [];
    }
    const slots = shiftSlots(shift);
    return slots.length === 0 || slots.some((slot) => assignmentsForSlot(shift.id, slot.start, slot.end, assignments).length < shift.requiredWorkers)
      ? [shift.id]
      : [];
  }))];
}

export function determineStatus(
  shifts: Shift[],
  assignments: ScheduleAssignment[],
  inputIssues: ValidationIssue[],
): EvaluationStatus {
  const invalidCodes = new Set([
    "ASSIGNMENT_OUTSIDE_SHIFT",
    "DUPLICATE_ASSIGNMENT",
    "DUPLICATE_SHIFT_ID",
    "DUPLICATE_WORKER_ID",
    "EMPLOYEE_OVERTIME",
    "EMPLOYEE_SHIFT_LIMIT_EXCEEDED",
    "FORBIDDEN_ASSIGNMENT_PRESENT",
    "MAX_WEEKLY_HOURS_EXCEEDED",
    "MAX_WEEKLY_SHIFTS_EXCEEDED",
    "OVERLAPPING_ASSIGNMENTS",
    "REQUIRED_ROLE_MISSING",
    "VOLUNTEER_SHIFT_LIMIT_EXCEEDED",
    "VOLUNTEER_WEEKLY_LIMIT_EXCEEDED",
    "WORKER_UNAVAILABLE",
    "WORKER_TYPE_REFERENCE_MISMATCH",
  ]);
  if (inputIssues.some((item) => item.code.startsWith("INVALID_") || item.code.startsWith("MISSING_") || invalidCodes.has(item.code))) return "invalid";
  const unfilled = getUnfilledShiftIds(shifts, assignments);
  if (shifts.length > 0 && unfilled.length === shifts.length && assignments.length === 0) return "impossible";
  if (unfilled.length > 0) return "partial";
  return "success";
}

export function validateSchedule(
  evaluationCase: EvaluationCase,
  result: OptimizedScheduleResult,
): ValidationIssue[] {
  const workers = activeWorkersForCase(evaluationCase);
  const shifts = evaluationCase.input.shifts;
  const assignments = result.assignments;
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const issues: ValidationIssue[] = [];

  const workerIds = new Set<string>();
  for (const worker of workers) {
    if (workerIds.has(worker.id)) {
      issues.push(issue("DUPLICATE_WORKER_ID", "Worker IDs must be unique.", "unique worker ID", worker.id, { workerId: worker.id }));
    }
    workerIds.add(worker.id);
    if (!worker.id || !worker.name || !worker.email) {
      issues.push(issue("INVALID_WORKER_IDENTITY", "Worker identity fields must be nonempty.", "nonempty id, name, and email", { id: worker.id, name: worker.name, email: worker.email }, { workerId: worker.id || undefined }));
    }
    if (!Number.isFinite(worker.maxShiftsPerWeek) || worker.maxShiftsPerWeek < 0 || !Number.isInteger(worker.maxShiftsPerWeek)) {
      issues.push(issue("INVALID_MAX_SHIFTS", "Maximum weekly shifts must be a nonnegative integer.", "nonnegative integer", worker.maxShiftsPerWeek, { workerId: worker.id }));
    }
    if (!Number.isFinite(worker.maxHoursPerWeek) || worker.maxHoursPerWeek < 0 || !Number.isFinite(worker.desiredHoursPerWeek) || worker.desiredHoursPerWeek < 0) {
      issues.push(issue("INVALID_WORKER_HOURS", "Desired and maximum weekly hours must be finite and nonnegative.", "finite nonnegative hours", { desired: worker.desiredHoursPerWeek, maximum: worker.maxHoursPerWeek }, { workerId: worker.id }));
    }
    for (const [day, blocks] of Object.entries(worker.availability)) {
      const seenBlocks = new Set<string>();
      for (const block of blocks ?? []) {
        const key = `${block.start}-${block.end}`;
        if (!validTime(block.start) || !validTime(block.end) || minutes(block.start) >= minutes(block.end)) {
          issues.push(issue("INVALID_AVAILABILITY_BLOCK", `${worker.name} has an invalid ${day} availability block.`, "valid start before end", key, { workerId: worker.id }));
        }
        if (seenBlocks.has(key)) {
          issues.push(issue("DUPLICATE_AVAILABILITY_BLOCK", `${worker.name} has a duplicate ${day} availability block.`, "unique availability blocks", key, { workerId: worker.id, severity: "soft" }));
        }
        seenBlocks.add(key);
      }
    }
  }

  const shiftIds = new Set<string>();

  for (const shift of shifts) {
    if (shiftIds.has(shift.id)) {
      issues.push(issue("DUPLICATE_SHIFT_ID", "Shift IDs must be unique.", "unique shift ID", shift.id, { shiftId: shift.id }));
    }
    shiftIds.add(shift.id);
    if (!shift.id || !shift.title || !shift.location || !shift.requiredRole) {
      issues.push(issue("INVALID_SHIFT_IDENTITY", "Shift identity, location, and required role must be nonempty.", "nonempty shift fields", { id: shift.id, title: shift.title, location: shift.location, role: shift.requiredRole }, { shiftId: shift.id || undefined }));
    }
    if (!Number.isInteger(shift.requiredWorkers) || shift.requiredWorkers < 1) {
      issues.push(issue("INVALID_REQUIRED_WORKERS", `${shift.title} must require at least one worker.`, "positive integer", shift.requiredWorkers, { shiftId: shift.id }));
    }
    const managerTarget = shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0);
    if (!Number.isInteger(managerTarget) || managerTarget < 0 || managerTarget > shift.requiredWorkers) {
      issues.push(issue("INVALID_REQUIRED_SUPERVISORS", `${shift.title} has an invalid supervisor requirement.`, `integer from 0 to ${shift.requiredWorkers}`, managerTarget, { shiftId: shift.id }));
    }
    if (shift.minPaidStaff !== undefined && (!Number.isInteger(shift.minPaidStaff) || shift.minPaidStaff < 0 || shift.minPaidStaff > shift.requiredWorkers)) {
      issues.push(issue("INVALID_MINIMUM_PAID_STAFF", `${shift.title} has an invalid paid-staff minimum.`, `integer from 0 to ${shift.requiredWorkers}`, shift.minPaidStaff, { shiftId: shift.id }));
    }
    if (shift.maxPaidStaff !== undefined && (!Number.isInteger(shift.maxPaidStaff) || shift.maxPaidStaff < 0 || shift.maxPaidStaff > shift.requiredWorkers || (shift.minPaidStaff ?? 0) > shift.maxPaidStaff)) {
      issues.push(issue("INVALID_MAXIMUM_PAID_STAFF", `${shift.title} has an invalid paid-staff maximum.`, `integer from ${shift.minPaidStaff ?? 0} to ${shift.requiredWorkers}`, shift.maxPaidStaff, { shiftId: shift.id }));
    }
    if (!validDate(shift.date)) {
      issues.push(issue("INVALID_SHIFT_DATE", `${shift.title} has an invalid calendar date.`, "YYYY-MM-DD calendar date", shift.date, { shiftId: shift.id }));
    }
    if (!validTime(shift.startTime) || !validTime(shift.endTime) || minutes(shift.startTime) >= minutes(shift.endTime)) {
      issues.push(issue("INVALID_SHIFT_TIME", `${shift.title} must end after it starts using 24-hour time.`, "startTime < endTime", `${shift.startTime}-${shift.endTime}`, { shiftId: shift.id }));
    }
  }

  const duplicateKeys = new Set<string>();
  for (const assignment of assignments) {
    const worker = workerById.get(assignment.workerId);
    const shift = shiftById.get(assignment.shiftId);
    if (!worker) {
      issues.push(issue("MISSING_WORKER_REFERENCE", "Assignment references a worker who is not active in the evaluation input.", "active worker ID", assignment.workerId, { workerId: assignment.workerId, shiftId: assignment.shiftId }));
    }
    if (!shift) {
      issues.push(issue("MISSING_SHIFT_REFERENCE", "Assignment references a shift that is not in the evaluation input.", "known shift ID", assignment.shiftId, { workerId: assignment.workerId, shiftId: assignment.shiftId }));
    }
    const duplicateKey = `${assignment.workerId}|${assignment.shiftId}`;
    if (duplicateKeys.has(duplicateKey)) {
      issues.push(issue("DUPLICATE_ASSIGNMENT", "The same worker is assigned more than once to one shift.", "one assignment per worker and shift", duplicateKey, { workerId: assignment.workerId, shiftId: assignment.shiftId }));
    }
    duplicateKeys.add(duplicateKey);
    if (!worker || !shift) continue;

    if (assignment.workerType !== worker.workerType || assignment.worker.id !== worker.id || assignment.shift.id !== shift.id) {
      issues.push(issue("WORKER_TYPE_REFERENCE_MISMATCH", "Assignment snapshots do not match the canonical worker or shift reference.", { workerType: worker.workerType, workerId: worker.id, shiftId: shift.id }, { workerType: assignment.workerType, workerId: assignment.worker.id, shiftId: assignment.shift.id }, { workerId: worker.id, shiftId: shift.id }));
    }
    if (!validTime(assignment.startTime) || !validTime(assignment.endTime) || minutes(assignment.startTime) >= minutes(assignment.endTime)) {
      issues.push(issue("INVALID_ASSIGNMENT_TIME", "Assignment must have a valid positive time range.", "startTime < endTime", `${assignment.startTime}-${assignment.endTime}`, { workerId: worker.id, shiftId: shift.id }));
      continue;
    }
    if (minutes(assignment.startTime) < minutes(shift.startTime) || minutes(assignment.endTime) > minutes(shift.endTime)) {
      issues.push(issue("ASSIGNMENT_OUTSIDE_SHIFT", "Assignment extends outside the shift opening and closing times.", `${shift.startTime}-${shift.endTime}`, `${assignment.startTime}-${assignment.endTime}`, { workerId: worker.id, shiftId: shift.id }));
    }
    const day = dayOf(shift.date);
    const available = day && (worker.availability[day] ?? []).some(
      (block) => minutes(block.start) <= minutes(assignment.startTime) && minutes(block.end) >= minutes(assignment.endTime),
    );
    if (!available) {
      issues.push(issue("WORKER_UNAVAILABLE", `${worker.name} is assigned outside recorded availability.`, day ? worker.availability[day] ?? [] : "valid shift date", `${assignment.startTime}-${assignment.endTime}`, { workerId: worker.id, shiftId: shift.id }));
    }
    if (!worker.roles.includes(shift.requiredRole)) {
      issues.push(issue("REQUIRED_ROLE_MISSING", `${worker.name} does not hold the required ${shift.requiredRole} role or certification.`, shift.requiredRole, worker.roles, { workerId: worker.id, shiftId: shift.id }));
    }
    const hours = assignmentHours(assignment);
    if (worker.workerType === "volunteer" && hours > 6) {
      issues.push(issue("VOLUNTEER_SHIFT_LIMIT_EXCEEDED", `${worker.name} exceeds the six-hour volunteer assignment limit.`, 6, hours, { workerId: worker.id, shiftId: shift.id }));
    }
    if (isPaidWorker(worker.workerType) && hours > 8) {
      issues.push(issue("EMPLOYEE_SHIFT_LIMIT_EXCEEDED", `${worker.name} exceeds the eight-hour paid assignment limit.`, 8, hours, { workerId: worker.id, shiftId: shift.id }));
    }
  }

  for (const worker of workers) {
    const workerAssignments = assignments.filter((assignment) => assignment.workerId === worker.id);
    for (let first = 0; first < workerAssignments.length; first += 1) {
      for (let second = first + 1; second < workerAssignments.length; second += 1) {
        const a = workerAssignments[first];
        const b = workerAssignments[second];
        if (a.shift.date === b.shift.date && minutes(a.startTime) < minutes(b.endTime) && minutes(a.endTime) > minutes(b.startTime)) {
          issues.push(issue("OVERLAPPING_ASSIGNMENTS", `${worker.name} is double-booked for overlapping times.`, "non-overlapping assignments", [`${a.shiftId}:${a.startTime}-${a.endTime}`, `${b.shiftId}:${b.startTime}-${b.endTime}`], { workerId: worker.id, shiftId: b.shiftId }));
        }
      }
    }
    for (const [week, hours] of workerHoursByWeek(worker.id, assignments)) {
      if (hours > worker.maxHoursPerWeek) {
        issues.push(issue("MAX_WEEKLY_HOURS_EXCEEDED", `${worker.name} exceeds the configured weekly hour limit.`, worker.maxHoursPerWeek, hours, { workerId: worker.id }));
      }
      if (worker.workerType === "volunteer" && hours > worker.maxHoursPerWeek) {
        issues.push(issue("VOLUNTEER_WEEKLY_LIMIT_EXCEEDED", `${worker.name} exceeds the volunteer weekly hour limit.`, worker.maxHoursPerWeek, hours, { workerId: worker.id }));
      }
      if (isPaidWorker(worker.workerType) && hours > 40) {
        issues.push(issue("EMPLOYEE_OVERTIME", `${worker.name} is scheduled for overtime during the week of ${week}.`, 40, hours, { workerId: worker.id }));
      }
    }
    for (const [, count] of workerAssignmentsByWeek(worker.id, assignments)) {
      if (count > worker.maxShiftsPerWeek) {
        issues.push(issue("MAX_WEEKLY_SHIFTS_EXCEEDED", `${worker.name} exceeds the configured weekly shift limit.`, worker.maxShiftsPerWeek, count, { workerId: worker.id }));
      }
    }
  }

  for (const shift of shifts) {
    const shiftAssignments = assignmentsForShift(shift.id, assignments);
    const managerTarget = shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0);
    const groups = shift.staffingMode === "daily_roster"
      ? [shiftAssignments]
      : shiftSlots(shift).map((slot) => assignmentsForSlot(shift.id, slot.start, slot.end, assignments));
    const weakestCoverage = groups.length ? Math.min(...groups.map((group) => group.length)) : 0;
    if (weakestCoverage < shift.requiredWorkers) {
      issues.push(issue("MINIMUM_COVERAGE_NOT_MET", `${shift.title} falls below minimum coverage during at least one period.`, shift.requiredWorkers, weakestCoverage, { shiftId: shift.id }));
    }
    if (shift.staffingMode === "daily_roster") {
      const requiredHours = shift.requiredWorkerHours ?? shift.requiredWorkers * Math.min(8, duration(shift.startTime, shift.endTime));
      const assignedHours = shiftAssignments.reduce((sum, assignment) => sum + assignmentHours(assignment), 0);
      if (assignedHours < requiredHours) {
        issues.push(issue("MINIMUM_WORKER_HOURS_NOT_MET", `${shift.title} does not meet its required roster hours.`, requiredHours, assignedHours, { shiftId: shift.id }));
      }
    }
    const cap = shift.staffingMode === "daily_roster" ? (shift.maxDailyWorkers ?? shift.requiredWorkers) : shift.requiredWorkers;
    const highestCoverage = groups.length ? Math.max(...groups.map((group) => group.length)) : 0;
    if (highestCoverage > cap) {
      issues.push(issue("SHIFT_OVERSTAFFED", `${shift.title} exceeds its staffing cap.`, cap, highestCoverage, { shiftId: shift.id }));
    }
    if (managerTarget > 0) {
      const weakestManagers = groups.length
        ? Math.min(...groups.map((group) => group.filter((assignment) => assignment.workerType === "supervisor").length))
        : 0;
      if (weakestManagers < managerTarget) {
        issues.push(issue("REQUIRED_SUPERVISOR_MISSING", `${shift.title} does not maintain required supervisor coverage.`, managerTarget, weakestManagers, { shiftId: shift.id }));
      }
    }
    if (shift.minPaidStaff !== undefined) {
      const weakestPaid = groups.length ? Math.min(...groups.map(paidCount)) : 0;
      if (weakestPaid < shift.minPaidStaff) {
        issues.push(issue("MINIMUM_PAID_STAFF_NOT_MET", `${shift.title} falls below its minimum paid staffing rule.`, shift.minPaidStaff, weakestPaid, { shiftId: shift.id }));
      }
    }
    if (shift.maxPaidStaff !== undefined) {
      const highestPaid = groups.length ? Math.max(...groups.map(paidCount)) : 0;
      if (highestPaid > shift.maxPaidStaff) {
        issues.push(issue("MAXIMUM_PAID_STAFF_EXCEEDED", `${shift.title} exceeds its paid staffing cap.`, shift.maxPaidStaff, highestPaid, { shiftId: shift.id }));
      }
    }
  }

  for (const expectation of evaluationCase.requiredAssignments) {
    if (!assignments.some((assignment) => assignmentMatches(assignment, expectation))) {
      issues.push(issue("REQUIRED_ASSIGNMENT_MISSING", "A required evaluation assignment was not produced.", expectation, null, { workerId: expectation.workerId, shiftId: expectation.shiftId }));
    }
  }
  for (const expectation of evaluationCase.forbiddenAssignments) {
    const actual = assignments.find((assignment) => assignmentMatches(assignment, expectation));
    if (actual) {
      issues.push(issue("FORBIDDEN_ASSIGNMENT_PRESENT", "A forbidden evaluation assignment was produced.", "assignment absent", expectation, { workerId: expectation.workerId, shiftId: expectation.shiftId }));
    }
  }
  return issues;
}

function coveragePercentage(shifts: Shift[], assignments: ScheduleAssignment[]) {
  let required = 0;
  let covered = 0;
  for (const shift of shifts) {
    if (shift.staffingMode === "daily_roster") {
      const requiredHours = shift.requiredWorkerHours ?? shift.requiredWorkers * Math.min(8, duration(shift.startTime, shift.endTime));
      required += requiredHours;
      covered += Math.min(requiredHours, assignmentsForShift(shift.id, assignments).reduce((sum, assignment) => sum + assignmentHours(assignment), 0));
      continue;
    }
    for (const slot of shiftSlots(shift)) {
      const slotHours = (slot.end - slot.start) / 60;
      required += shift.requiredWorkers * slotHours;
      covered += Math.min(shift.requiredWorkers, assignmentsForSlot(shift.id, slot.start, slot.end, assignments).length) * slotHours;
    }
  }
  return required === 0 ? 100 : Math.round((covered / required) * 10_000) / 100;
}

export function calculateMetrics(
  workers: Worker[],
  shifts: Shift[],
  assignments: ScheduleAssignment[],
  runtimeMs: number,
  issues: ValidationIssue[],
): EvaluationMetrics {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const preferenceResults: boolean[] = [];
  for (const assignment of assignments) {
    const worker = workerById.get(assignment.workerId);
    const day = dayOf(assignment.shift.date);
    if (!worker || !day) continue;
    if (worker.preferredDays.length > 0) preferenceResults.push(worker.preferredDays.includes(day));
    if (worker.preferredRoles.length > 0) preferenceResults.push(worker.preferredRoles.includes(assignment.shift.requiredRole));
  }
  const preferenceSatisfaction = preferenceResults.length
    ? Math.round((preferenceResults.filter(Boolean).length / preferenceResults.length) * 10_000) / 100
    : 100;

  const utilization = workers.map((worker) => {
    const hours = assignments.filter((assignment) => assignment.workerId === worker.id).reduce((sum, assignment) => sum + assignmentHours(assignment), 0);
    return hours / Math.max(worker.desiredHoursPerWeek, 1);
  });
  const utilizationSum = utilization.reduce((sum, value) => sum + value, 0);
  const fairness = utilizationSum === 0
    ? 1
    : (utilizationSum ** 2) / (utilization.length * utilization.reduce((sum, value) => sum + value ** 2, 0));

  let overtimeUsageHours = 0;
  for (const worker of workers) {
    for (const [, hours] of workerHoursByWeek(worker.id, assignments)) {
      const overtimeLimit = isPaidWorker(worker.workerType) ? Math.min(worker.maxHoursPerWeek, 40) : worker.maxHoursPerWeek;
      overtimeUsageHours += Math.max(0, hours - overtimeLimit);
    }
  }
  const undesirableCounts = workers.map((worker) => assignments.filter((assignment) => {
    if (assignment.workerId !== worker.id) return false;
    const day = dayOf(assignment.shift.date);
    return day === "Saturday" || day === "Sunday" || assignment.shift.priority === "High" || assignment.shift.priority === "Urgent" || assignment.startTime < "09:00" || assignment.endTime > "17:00";
  }).length);
  const averageMatchScore = assignments.length
    ? assignments.reduce((sum, assignment) => sum + assignment.matchScore, 0) / assignments.length
    : 0;
  return {
    coveragePercentage: coveragePercentage(shifts, assignments),
    preferenceSatisfaction,
    fairnessOfAssignedHours: Math.round(fairness * 10_000) / 100,
    overtimeUsageHours: Math.round(overtimeUsageHours * 100) / 100,
    undesirableShiftSpread: undesirableCounts.length ? Math.max(...undesirableCounts) - Math.min(...undesirableCounts) : 0,
    unfilledShiftCount: getUnfilledShiftIds(shifts, assignments).length,
    schedulingRuntimeMs: Math.round(runtimeMs * 100) / 100,
    hardConstraintViolationCount: issues.filter((item) => item.severity === "hard").length,
    averageMatchScore: Math.round(averageMatchScore * 100) / 100,
  };
}

export function expectedHardIssue(evaluationCase: EvaluationCase, validationIssue: ValidationIssue) {
  return evaluationCase.expectedHardViolationCodes.includes(validationIssue.code) ||
    (validationIssue.code === "MINIMUM_COVERAGE_NOT_MET" &&
      validationIssue.shiftId !== undefined &&
      evaluationCase.expectedUnfilledShifts.includes(validationIssue.shiftId));
}
