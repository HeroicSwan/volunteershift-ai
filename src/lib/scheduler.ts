import {
  SHIFT_PRIORITIES,
  isPaidWorker,
  type CoverageGap,
  type CoverageMetrics,
  type CoverageRiskLevel,
  type DayOfWeek,
  type FairnessStats,
  type LaborCostStats,
  type OptimizedScheduleResult,
  type ScheduleAssignment,
  type ScheduleValidationResult,
  type ScoreBreakdown,
  type Shift,
  type ShiftScheduleResult,
  type ShiftPriority,
  type ShiftRiskAssessment,
  type Worker,
} from "../types";

export type MatchEvaluation = {
  eligible: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  scoreBreakdown?: ScoreBreakdown;
};

export type MatchContext = {
  hardToFill?: boolean;
  allowRoleMismatch?: boolean;
  allShifts?: Shift[];
};

export type ScheduleInput = {
  workers: Worker[];
  shifts: Shift[];
  assignments?: ScheduleAssignment[];
};

export type ScheduleContext = {
  workers: Worker[];
  shifts: Shift[];
  assignments: ScheduleAssignment[];
};

type Candidate = {
  worker: Worker;
  segment: Shift;
  evaluation: MatchEvaluation;
  weekHours: number;
  weekAssignments: number;
  loadRatio: number;
  sameDayHours: number;
  adjacentWorkDays: number;
  nearestWorkDayDistance: number;
  capacityWaste: number;
};

type SchedulingPlan = {
  dateRank: Map<string, number>;
};

const WEEKDAYS: DayOfWeek[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PRIORITY_ORDER: Record<ShiftPriority, number> = { Urgent: 4, High: 3, Normal: 2, Low: 1 };
const RISK_ORDER: Record<CoverageRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SLOT_MINUTES = 30;
const SCORE_BASE = 50;
const SCORE_PREFERRED_DAY = 12;
const SCORE_PREFERRED_ROLE = 12;
const SCORE_RELIABILITY_STEP = 5;
const SCORE_UNDER_DESIRED_HOURS = 10;
const SCORE_OVER_DESIRED_PENALTY = 12;
const SCORE_TYPE_FIT = 8;
const SCORE_EMPLOYMENT_FIT = 5;

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getShiftDay(shift: Shift) {
  return WEEKDAYS[parseDate(shift.date).getDay()];
}

function getWeekKey(date: string) {
  const parsed = parseDate(date);
  const dayFromMonday = (parsed.getDay() + 6) % 7;
  parsed.setDate(parsed.getDate() - dayFromMonday);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function durationHours(startTime: string, endTime: string) {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime)) / 60;
}

function assignmentStartTime(assignment: ScheduleAssignment) {
  return assignment.startTime ?? assignment.shift.startTime;
}

function assignmentEndTime(assignment: ScheduleAssignment) {
  return assignment.endTime ?? assignment.shift.endTime;
}

export function getAssignmentDurationHours(assignment: ScheduleAssignment) {
  return durationHours(assignmentStartTime(assignment), assignmentEndTime(assignment));
}

function shiftDurationHours(shift: Shift) {
  return durationHours(shift.startTime, shift.endTime);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function daysBetween(first: string, second: string) {
  return Math.abs(Math.round((parseDate(first).getTime() - parseDate(second).getTime()) / 86_400_000));
}

function getDatesByWeek(shifts: Shift[]) {
  const datesByWeek = new Map<string, string[]>();
  for (const date of [...new Set(shifts.map((shift) => shift.date))].sort()) {
    const week = getWeekKey(date);
    datesByWeek.set(week, [...(datesByWeek.get(week) ?? []), date]);
  }
  return [...datesByWeek.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function buildSchedulingPlan(shifts: Shift[], strategy: "balanced" | "forward" | "reverse", offset = 0): SchedulingPlan {
  const dateRank = new Map<string, number>();
  let rank = 0;
  for (const [, dates] of getDatesByWeek(shifts)) {
    let ordered: string[] = [];
    if (strategy === "balanced") {
      let left = 0;
      let right = dates.length - 1;
      while (left <= right) {
        ordered.push(dates[left]);
        left += 1;
        if (left <= right) {
          ordered.push(dates[right]);
          right -= 1;
        }
      }
    } else {
      const base = strategy === "reverse" ? [...dates].reverse() : dates;
      const rotation = base.length ? offset % base.length : 0;
      ordered = [...base.slice(rotation), ...base.slice(0, rotation)];
    }
    for (const date of ordered) {
      dateRank.set(date, rank);
      rank += 1;
    }
  }
  return { dateRank };
}

function buildSchedulingPlans(shifts: Shift[]) {
  const longestWeek = Math.max(1, ...getDatesByWeek(shifts).map(([, dates]) => dates.length));
  const plans = [buildSchedulingPlan(shifts, "balanced"), buildSchedulingPlan(shifts, "reverse")];
  for (let offset = 0; offset < longestWeek; offset += 1) {
    plans.push(buildSchedulingPlan(shifts, "forward", offset));
  }
  return plans;
}

function getDesiredHours(worker: Worker) {
  const legacy = worker as Worker & { hoursPerWeek?: number };
  return worker.desiredHoursPerWeek ?? legacy.hoursPerWeek ?? Math.min(40, worker.maxShiftsPerWeek * 4);
}

function getMaxHours(worker: Worker) {
  const legacy = worker as Worker & { hoursPerWeek?: number };
  return worker.maxHoursPerWeek ?? legacy.hoursPerWeek ?? Math.min(40, worker.maxShiftsPerWeek * 4);
}

function getWorkerWeekAssignments(workerId: string, assignments: ScheduleAssignment[], weekKey?: string) {
  return assignments.filter(
    (assignment) =>
      assignment.workerId === workerId && (!weekKey || getWeekKey(assignment.shift.date) === weekKey),
  );
}

function countWorkerAssignments(workerId: string, assignments: ScheduleAssignment[], weekKey?: string) {
  return getWorkerWeekAssignments(workerId, assignments, weekKey).length;
}

function countWorkerHours(workerId: string, assignments: ScheduleAssignment[], weekKey?: string) {
  return round(
    getWorkerWeekAssignments(workerId, assignments, weekKey).reduce(
      (total, assignment) => total + getAssignmentDurationHours(assignment),
      0,
    ),
  );
}

function getShiftAssignments(shift: Shift, assignments: ScheduleAssignment[]) {
  return assignments.filter((assignment) => assignment.shiftId === shift.id);
}

function assignmentCovers(assignment: ScheduleAssignment, startTime: string, endTime: string) {
  return assignmentStartTime(assignment) <= startTime && assignmentEndTime(assignment) >= endTime;
}

function getSlotAssignments(shift: Shift, startTime: string, endTime: string, assignments: ScheduleAssignment[]) {
  return getShiftAssignments(shift, assignments).filter((assignment) => assignmentCovers(assignment, startTime, endTime));
}

function buildSlots(shift: Shift) {
  const slots: Array<{ startTime: string; endTime: string; hours: number }> = [];
  const end = timeToMinutes(shift.endTime);
  for (let start = timeToMinutes(shift.startTime); start < end; start += SLOT_MINUTES) {
    const slotEnd = Math.min(start + SLOT_MINUTES, end);
    slots.push({ startTime: minutesToTime(start), endTime: minutesToTime(slotEnd), hours: (slotEnd - start) / 60 });
  }
  return slots;
}

function availableUntil(worker: Worker, shift: Shift, startTime: string) {
  const start = timeToMinutes(startTime);
  const block = (worker.availability[getShiftDay(shift)] ?? []).find(
    (item) => timeToMinutes(item.start) <= start && timeToMinutes(item.end) > start,
  );
  return block ? Math.min(timeToMinutes(block.end), timeToMinutes(shift.endTime)) : start;
}

function isAvailable(worker: Worker, shift: Shift) {
  return availableUntil(worker, shift, shift.startTime) >= timeToMinutes(shift.endTime);
}

function getSingleShiftLimit(worker: Worker) {
  return worker.workerType === "volunteer" ? 6 : 8;
}

function chooseAssignmentEnd(worker: Worker, shift: Shift, startTime: string, assignments: ScheduleAssignment[]) {
  const weekKey = getWeekKey(shift.date);
  const weekHours = countWorkerHours(worker.id, assignments, weekKey);
  const maxRemainingMinutes = Math.floor((getMaxHours(worker) - weekHours) * 60);
  const start = timeToMinutes(startTime);
  const availableEnd = availableUntil(worker, shift, startTime);
  const nextConflictStart = assignments
    .filter(
      (assignment) =>
        assignment.workerId === worker.id &&
        assignment.shift.date === shift.date &&
        assignmentStartTime(assignment) >= startTime,
    )
    .map((assignment) => timeToMinutes(assignmentStartTime(assignment)))
    .sort((a, b) => a - b)[0];
  const hardEnd = Math.min(
    availableEnd,
    nextConflictStart ?? Number.POSITIVE_INFINITY,
    start + getSingleShiftLimit(worker) * 60,
    start + maxRemainingMinutes,
  );
  const availableMinutes = hardEnd - start;
  if (availableMinutes < SLOT_MINUTES) return undefined;

  let targetMinutes: number;
  if (worker.workerType === "volunteer") {
    if (availableMinutes <= 5 * 60) {
      targetMinutes = availableMinutes;
    } else {
      const parts = Math.ceil(availableMinutes / (4 * 60));
      targetMinutes = Math.round(availableMinutes / parts / SLOT_MINUTES) * SLOT_MINUTES;
      targetMinutes = Math.max(3 * 60, Math.min(4 * 60, targetMinutes));
    }
  } else if (worker.employmentType === "part_time") {
    targetMinutes = Math.min(6 * 60, availableMinutes);
    const tail = availableMinutes - targetMinutes;
    if (tail > 0 && tail < 3 * 60 && availableMinutes >= 6 * 60) targetMinutes = availableMinutes - 3 * 60;
  } else {
    targetMinutes = Math.min(8 * 60, availableMinutes);
    const tail = availableMinutes - targetMinutes;
    if (tail > 0 && tail < 3 * 60 && availableMinutes >= 6 * 60) targetMinutes = availableMinutes - 3 * 60;
  }

  const desiredRemainingMinutes = Math.max(0, Math.floor((getDesiredHours(worker) - weekHours) * 60));
  if (desiredRemainingMinutes >= 3 * 60 && desiredRemainingMinutes < targetMinutes) {
    targetMinutes = Math.floor(desiredRemainingMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  }
  targetMinutes = Math.max(SLOT_MINUTES, Math.min(targetMinutes, availableMinutes));
  return minutesToTime(start + targetMinutes);
}

export function detectConflicts(worker: Worker, shift: Shift, assignments: ScheduleAssignment[]) {
  return assignments.some(
    (assignment) =>
      assignment.workerId === worker.id &&
      assignment.shift.date === shift.date &&
      shift.startTime < assignmentEndTime(assignment) &&
      shift.endTime > assignmentStartTime(assignment),
  );
}

export const detectOverlap = detectConflicts;

export function normalizeScheduleInput(inputOrWorkers: ScheduleInput | Worker[], shifts: Shift[] = []): ScheduleContext {
  return Array.isArray(inputOrWorkers)
    ? { workers: [...inputOrWorkers], shifts: [...shifts], assignments: [] }
    : {
        workers: [...inputOrWorkers.workers],
        shifts: [...inputOrWorkers.shifts],
        assignments: [...(inputOrWorkers.assignments ?? [])],
      };
}

export function respectsMaxShifts(worker: Worker, assignments: ScheduleAssignment[], date?: string) {
  return countWorkerAssignments(worker.id, assignments, date ? getWeekKey(date) : undefined) < worker.maxShiftsPerWeek;
}

export function calculateFairnessPenalty(worker: Worker, assignments: ScheduleAssignment[], date?: string) {
  const week = date ? getWeekKey(date) : undefined;
  return Math.round(
    (countWorkerHours(worker.id, assignments, week) / Math.max(getDesiredHours(worker), 1)) * 12 +
    (countWorkerAssignments(worker.id, assignments, week) / Math.max(worker.maxShiftsPerWeek, 1)) * 8,
  );
}

export function calculateConsecutiveDayPenalty(worker: Worker, shift: Shift, assignments: ScheduleAssignment[]) {
  const dates = getWorkerWeekAssignments(worker.id, assignments, getWeekKey(shift.date)).map((item) => item.shift.date);
  return dates.filter((date) => daysBetween(date, shift.date) === 1).length * 6;
}

export function calculateLaborCost(worker: Worker, shift: Shift) {
  return isPaidWorker(worker.workerType) && worker.hourlyRate !== undefined
    ? round(shiftDurationHours(shift) * worker.hourlyRate)
    : 0;
}

function emptyBreakdown(): ScoreBreakdown {
  return {
    base: 0,
    preferredDay: 0,
    preferredRole: 0,
    reliability: 0,
    workerTypeFit: 0,
    employmentFit: 0,
    fairnessPenalty: 0,
    consecutiveDayPenalty: 0,
    laborCostPenalty: 0,
    roleMismatchPenalty: 0,
    total: 0,
  };
}

export function explainAssignment(worker: Worker, shift: Shift, scoreBreakdown: ScoreBreakdown) {
  const reasons = ["Available for the full assignment"];
  if (worker.roles.includes(shift.requiredRole)) reasons.push(`Qualified for ${shift.requiredRole}`);
  if (scoreBreakdown.preferredDay > 0) reasons.push(`${getShiftDay(shift)} is a preferred day`);
  if (scoreBreakdown.preferredRole > 0) reasons.push(`${shift.requiredRole} is a preferred role`);
  if (scoreBreakdown.reliability > 0) reasons.push(`Reliability ${worker.reliabilityScore}/5 boosts confidence`);
  return reasons;
}

export function calculateMatchScore(
  worker: Worker,
  shift: Shift,
  assignments: ScheduleAssignment[] = [],
  context: MatchContext = {},
): MatchEvaluation {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const weekKey = getWeekKey(shift.date);
  const weekHours = countWorkerHours(worker.id, assignments, weekKey);
  const weekAssignments = countWorkerAssignments(worker.id, assignments, weekKey);
  const assignmentHours = shiftDurationHours(shift);
  const projectedHours = weekHours + assignmentHours;
  const desiredHours = getDesiredHours(worker);
  const maxHours = getMaxHours(worker);

  if (!isAvailable(worker, shift)) return { eligible: false, score: 0, reasons, warnings: ["Not available for the full assignment"] };
  if (!worker.roles.includes(shift.requiredRole)) return { eligible: false, score: 0, reasons, warnings: [`Not qualified for ${shift.requiredRole}`] };
  if (worker.workerType === "volunteer" && assignments.some((assignment) => assignment.workerId === worker.id && assignment.shiftId === shift.id)) {
    return { eligible: false, score: 0, reasons, warnings: ["Volunteer already has an assignment in this operating window"] };
  }
  if (weekAssignments >= worker.maxShiftsPerWeek) return { eligible: false, score: 0, reasons, warnings: ["Weekly shift limit reached"] };
  if (assignmentHours > getSingleShiftLimit(worker)) return { eligible: false, score: 0, reasons, warnings: [`Assignment exceeds the ${getSingleShiftLimit(worker)}-hour shift limit`] };
  if (projectedHours > maxHours) return { eligible: false, score: 0, reasons, warnings: ["Maximum weekly hours reached—overtime is not allowed"] };
  if (detectConflicts(worker, shift, assignments)) return { eligible: false, score: 0, reasons, warnings: ["Overlaps another assigned shift"] };

  let score = SCORE_BASE;
  reasons.push("Available for the full assignment", `Qualified for ${shift.requiredRole}`);
  const shiftDay = getShiftDay(shift);
  if (worker.preferredDays.includes(shiftDay)) {
    score += SCORE_PREFERRED_DAY;
    reasons.push(`${shiftDay} is a preferred day`);
  }
  if (worker.preferredRoles.includes(shift.requiredRole)) {
    score += SCORE_PREFERRED_ROLE;
    reasons.push(`${shift.requiredRole} is a preferred role`);
  }
  if (worker.reliabilityScore !== undefined) {
    score += (worker.reliabilityScore - 3) * SCORE_RELIABILITY_STEP;
    if (worker.reliabilityScore >= 4) reasons.push(`Reliability ${worker.reliabilityScore}/5 boosts confidence`);
    if (worker.reliabilityScore <= 2) warnings.push(`Reliability ${worker.reliabilityScore}/5—consider lining up a backup`);
  }

  if (weekHours < desiredHours) {
    score += SCORE_UNDER_DESIRED_HOURS;
    reasons.push(`${round(desiredHours - weekHours)} desired weekly hours remain`);
  }
  if (projectedHours > desiredHours) {
    score -= SCORE_OVER_DESIRED_PENALTY;
    warnings.push("This assignment exceeds desired hours but stays below the hard maximum");
  }
  score -= Math.round((weekHours / Math.max(maxHours, 1)) * 12);

  const critical = shift.priority === "Urgent" || shift.priority === "High" || Boolean(context.hardToFill);
  const paid = isPaidWorker(worker.workerType);
  if (critical && paid) {
    score += SCORE_TYPE_FIT;
    reasons.push("Paid staff strengthens priority coverage");
  } else if (!critical && !paid) {
    score += SCORE_TYPE_FIT;
    reasons.push("Volunteer supports routine coverage");
  }
  if (paid && worker.employmentType === "full_time" && critical) {
    score += SCORE_EMPLOYMENT_FIT;
    reasons.push("Full-time staff supports priority coverage");
  }
  if (paid && worker.employmentType === "part_time" && !critical) score += SCORE_EMPLOYMENT_FIT;
  if (projectedHours === maxHours) warnings.push("This assignment reaches the maximum weekly hours");

  return { eligible: true, score: Math.max(0, Math.min(100, score)), reasons, warnings };
}

export function calculateWorkerMatchScore(
  worker: Worker,
  shift: Shift,
  assignments: ScheduleAssignment[] = [],
  context: MatchContext = {},
): MatchEvaluation {
  const roleMatches = worker.roles.includes(shift.requiredRole);
  const scoredWorker = !roleMatches && context.allowRoleMismatch
    ? { ...worker, roles: [...worker.roles, shift.requiredRole] }
    : worker;
  const evaluation = calculateMatchScore(scoredWorker, shift, assignments, context);
  if (!evaluation.eligible) return { ...evaluation, scoreBreakdown: emptyBreakdown() };

  const week = getWeekKey(shift.date);
  const weekHours = countWorkerHours(worker.id, assignments, week);
  const projectedHours = weekHours + shiftDurationHours(shift);
  const critical = shift.priority === "Urgent" || shift.priority === "High" || Boolean(context.hardToFill);
  const paid = isPaidWorker(worker.workerType);
  const breakdown = emptyBreakdown();
  breakdown.base = SCORE_BASE + (weekHours < getDesiredHours(worker) ? SCORE_UNDER_DESIRED_HOURS : 0);
  breakdown.preferredDay = worker.preferredDays.includes(getShiftDay(shift)) ? SCORE_PREFERRED_DAY : 0;
  breakdown.preferredRole = worker.preferredRoles.includes(shift.requiredRole) ? SCORE_PREFERRED_ROLE : 0;
  breakdown.reliability = worker.reliabilityScore === undefined ? 0 : (worker.reliabilityScore - 3) * SCORE_RELIABILITY_STEP;
  breakdown.workerTypeFit = (critical && paid) || (!critical && !paid) ? SCORE_TYPE_FIT : 0;
  breakdown.employmentFit = paid && ((critical && worker.employmentType === "full_time") || (!critical && worker.employmentType === "part_time"))
    ? SCORE_EMPLOYMENT_FIT
    : 0;
  breakdown.fairnessPenalty = -calculateFairnessPenalty(worker, assignments, shift.date) -
    (projectedHours > getDesiredHours(worker) ? SCORE_OVER_DESIRED_PENALTY : 0);
  breakdown.consecutiveDayPenalty = -calculateConsecutiveDayPenalty(worker, shift, assignments);
  breakdown.laborCostPenalty = !critical && paid ? -(worker.hourlyRate ? Math.min(6, Math.round(worker.hourlyRate / 10)) : 1) : 0;
  breakdown.roleMismatchPenalty = roleMatches ? 0 : -40;
  const adjustedScore = Math.max(
    0,
    Math.min(
      100,
      evaluation.score + breakdown.consecutiveDayPenalty + breakdown.laborCostPenalty + breakdown.roleMismatchPenalty,
    ),
  );
  breakdown.total = adjustedScore;
  const warnings = [...evaluation.warnings];
  if (!roleMatches) warnings.push(`Emergency role mismatch: ${worker.name} is not qualified for ${shift.requiredRole}`);
  if (critical && paid && worker.hourlyRate !== undefined) {
    warnings.push(`Paid priority coverage adds an estimated $${calculateLaborCost(worker, shift).toFixed(2)} in labor cost`);
  }
  return { ...evaluation, score: adjustedScore, warnings, scoreBreakdown: breakdown };
}

function getCandidateBalance(
  worker: Worker,
  shift: Shift,
  assignments: ScheduleAssignment[],
) {
  const weekKey = getWeekKey(shift.date);
  const workerAssignments = getWorkerWeekAssignments(worker.id, assignments, weekKey);
  const weekHours = countWorkerHours(worker.id, assignments, weekKey);
  const weekAssignments = workerAssignments.length;
  const assignedDates = [...new Set(workerAssignments.map((assignment) => assignment.shift.date))];
  const distances = assignedDates.map((date) => daysBetween(date, shift.date));
  const sameDayHours = round(
    workerAssignments
      .filter((assignment) => assignment.shift.date === shift.date)
      .reduce((sum, assignment) => sum + getAssignmentDurationHours(assignment), 0),
  );
  const hourRatio = weekHours / Math.max(getDesiredHours(worker), 1);
  const shiftRatio = weekAssignments / Math.max(worker.maxShiftsPerWeek, 1);
  const desiredRemainingHours = Math.max(0, getDesiredHours(worker) - weekHours);
  const remainingSlotsAfterAssignment = Math.max(0, worker.maxShiftsPerWeek - weekAssignments - 1);
  return {
    weekHours,
    weekAssignments,
    loadRatio: hourRatio + shiftRatio * 0.75,
    sameDayHours,
    adjacentWorkDays: distances.filter((distance) => distance === 1).length,
    nearestWorkDayDistance: distances.length ? Math.min(...distances) : 7,
    capacityWaste: shiftDurationHours(shift) < 3
      ? Math.max(
          0,
          desiredRemainingHours - shiftDurationHours(shift) - remainingSlotsAfterAssignment * getSingleShiftLimit(worker),
        )
      : 0,
  };
}

function getShiftScarcity(shift: Shift, workers: Worker[]) {
  const ratios = buildSlots(shift).map((slot) => {
    const eligible = workers.filter(
      (worker) =>
        worker.roles.includes(shift.requiredRole) &&
        availableUntil(worker, shift, slot.startTime) >= timeToMinutes(slot.endTime),
    );
    const coverageRatio = eligible.length / Math.max(shift.requiredWorkers, 1);
    const supervisorRatio = shift.requiresSupervisor
      ? eligible.filter((worker) => worker.workerType === "supervisor").length
      : Number.POSITIVE_INFINITY;
    const paidRatio = shift.minPaidStaff
      ? eligible.filter((worker) => isPaidWorker(worker.workerType)).length / shift.minPaidStaff
      : Number.POSITIVE_INFINITY;
    return Math.min(coverageRatio, supervisorRatio, paidRatio);
  });
  return ratios.length ? Math.min(...ratios) : 0;
}

export function getEligibleWorkersForShift(
  shift: Shift,
  workers: Worker[],
  currentAssignments: ScheduleAssignment[],
  allowRoleMismatch = false,
) {
  return workers.filter((worker) =>
    calculateWorkerMatchScore(worker, shift, currentAssignments, { allowRoleMismatch }).eligible,
  );
}

export function getShiftDifficultyScore(
  shift: Shift,
  workers: Worker[],
  currentAssignments: ScheduleAssignment[] = [],
) {
  const eligible = getEligibleWorkersForShift(shift, workers, currentAssignments).length;
  const demandPressure = shift.requiredWorkers / Math.max(eligible, 0.5);
  return (
    PRIORITY_ORDER[shift.priority] * 100 +
    (shift.requiresSupervisor ? 45 : 0) +
    (shift.minPaidStaff ?? 0) * 12 +
    demandPressure * 40 +
    (getShiftScarcity(shift, workers) < 1 ? 35 : 0)
  );
}

function rankCandidates(
  shift: Shift,
  sourceShift: Shift,
  pool: Worker[],
  assignments: ScheduleAssignment[],
  context: MatchContext = {},
) {
  // Only the most reliability-sensitive work (urgent, or scarce/hard-to-fill)
  // keeps paid staff ahead of cheaper volunteers. Everything else optimizes
  // for cost once coverage is safe.
  const forcePaidFirst = shift.priority === "Urgent" || Boolean(context.hardToFill);
  return pool
    .filter((worker) => !assignments.some((assignment) =>
      assignment.workerId === worker.id &&
      (
        assignment.shiftId === sourceShift.id ||
        (
          assignment.shift.date === sourceShift.date &&
          sourceShift.startTime < assignment.shift.endTime &&
          sourceShift.endTime > assignment.shift.startTime
        )
      ),
    ))
    .flatMap((worker): Candidate[] => {
      const endTime = chooseAssignmentEnd(worker, sourceShift, shift.startTime, assignments);
      if (!endTime) return [];
      const segment = { ...shift, endTime };
      const evaluation = calculateWorkerMatchScore(worker, segment, assignments, context);
      if (!evaluation.eligible) return [];
      const balance = getCandidateBalance(worker, segment, assignments);
      return [{
        worker,
        segment,
        evaluation,
        ...balance,
      }];
    })
    .sort((a, b) => {
      // Cost efficiency: on routine shifts, prefer the cheapest eligible
      // worker (volunteers cost $0) even ahead of load-balancing, so paid
      // staff are only spent where a volunteer can't do the job. Urgent,
      // high-priority, and hard-to-fill shifts keep the reliability-first
      // ordering (paid staff preferred) instead. Coverage is never traded for
      // cost—only eligible candidates reach this sort, and the fill loops run
      // until the required headcount is met.
      const costTiebreak = forcePaidFirst ? 0 : candidateCost(a) - candidateCost(b);
      return (
        a.sameDayHours - b.sameDayHours ||
        a.capacityWaste - b.capacityWaste ||
        costTiebreak ||
        a.loadRatio - b.loadRatio ||
        a.adjacentWorkDays - b.adjacentWorkDays ||
        b.nearestWorkDayDistance - a.nearestWorkDayDistance ||
        b.evaluation.score - a.evaluation.score ||
        // Final resort: when everything else ties, the cheaper worker wins on
        // any shift (harmless on critical shifts—score already ranked paid up).
        candidateCost(a) - candidateCost(b) ||
        a.weekHours - b.weekHours ||
        a.weekAssignments - b.weekAssignments ||
        a.worker.name.localeCompare(b.worker.name) ||
        a.worker.id.localeCompare(b.worker.id)
      );
    });
}

function candidateCost(candidate: Candidate) {
  return estimateAssignmentCost(candidate.worker, candidate.segment.startTime, candidate.segment.endTime) ?? 0;
}

function estimateAssignmentCost(worker: Worker, startTime: string, endTime: string) {
  if (!isPaidWorker(worker.workerType) || worker.hourlyRate === undefined) return undefined;
  return round(durationHours(startTime, endTime) * worker.hourlyRate);
}

function commitCandidate(
  candidate: Candidate,
  sourceShift: Shift,
  assignments: ScheduleAssignment[],
  leadReason?: string,
  extraWarnings: string[] = [],
) {
  const { worker, segment, evaluation } = candidate;
  const warnings = [...evaluation.warnings, ...extraWarnings];
  if (isPaidWorker(worker.workerType) && worker.hourlyRate === undefined) warnings.push("No hourly rate on file—excluded from cost estimates");
  const assignment: ScheduleAssignment = {
    shiftId: sourceShift.id,
    workerId: worker.id,
    worker,
    shift: sourceShift,
    startTime: segment.startTime,
    endTime: segment.endTime,
    workerType: worker.workerType,
    matchScore: evaluation.score,
    scoreBreakdown: evaluation.scoreBreakdown ?? emptyBreakdown(),
    estimatedCost: estimateAssignmentCost(worker, segment.startTime, segment.endTime) ?? 0,
    reasons: leadReason ? [leadReason, ...evaluation.reasons] : evaluation.reasons,
    warnings,
  };
  assignments.push(assignment);
  return assignment;
}

function getDailyRosterBlock(worker: Worker, shift: Shift, assignments: ScheduleAssignment[]) {
  if (worker.workerType === "volunteer") {
    const block = (worker.availability[getShiftDay(shift)] ?? [])[0];
    if (!block) return undefined;
    const start = Math.max(timeToMinutes(block.start), timeToMinutes(shift.startTime));
    const end = Math.min(start + 4 * 60, timeToMinutes(block.end), timeToMinutes(shift.endTime));
    return end - start >= 3 * 60 ? { startTime: minutesToTime(start), endTime: minutesToTime(end) } : undefined;
  }
  if (worker.employmentType === "part_time") {
    return { startTime: "08:00", endTime: "14:00" };
  }
  const dayAssignments = getShiftAssignments(shift, assignments);
  const comparable = worker.workerType === "supervisor"
    ? dayAssignments.filter((assignment) => assignment.workerType === "supervisor")
    : dayAssignments.filter((assignment) => assignment.worker.employmentType === "full_time");
  const earlyCount = comparable.filter((assignment) => assignment.startTime === "08:00").length;
  const lateCount = comparable.filter((assignment) => assignment.startTime === "10:00").length;
  return earlyCount <= lateCount
    ? { startTime: "08:00", endTime: "16:00" }
    : { startTime: "10:00", endTime: "18:00" };
}

function rankDailyRosterCandidates(
  shift: Shift,
  pool: Worker[],
  assignments: ScheduleAssignment[],
) {
  return pool
    .filter((worker) => !getShiftAssignments(shift, assignments).some((assignment) => assignment.workerId === worker.id))
    .flatMap((worker) => {
      const block = getDailyRosterBlock(worker, shift, assignments);
      if (!block) return [];
      const candidate = exactCandidate(worker, shift, block.startTime, block.endTime, assignments, { allShifts: [shift] });
      return candidate ? [candidate] : [];
    })
    .sort(
      (a, b) =>
        a.loadRatio - b.loadRatio ||
        a.adjacentWorkDays - b.adjacentWorkDays ||
        b.nearestWorkDayDistance - a.nearestWorkDayDistance ||
        b.evaluation.score - a.evaluation.score ||
        a.worker.name.localeCompare(b.worker.name),
    );
}

function assignDailyRosterShift(shift: Shift, workers: Worker[], assignments: ScheduleAssignment[]) {
  const managerTarget = shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0);
  while (getShiftAssignments(shift, assignments).filter((assignment) => assignment.workerType === "supervisor").length < managerTarget) {
    const manager = rankDailyRosterCandidates(
      shift,
      workers.filter((worker) => worker.workerType === "supervisor"),
      assignments,
    )[0];
    if (!manager) break;
    commitCandidate(manager, shift, assignments, `Fills manager ${getShiftAssignments(shift, assignments).filter((assignment) => assignment.workerType === "supervisor").length + 1} of ${managerTarget}`);
  }

  const rosterTarget = Math.min(shift.requiredWorkers, shift.maxDailyWorkers ?? shift.requiredWorkers);
  const preferredVolunteer = rankDailyRosterCandidates(
    shift,
    workers.filter(
      (worker) =>
        worker.workerType === "volunteer" &&
        worker.preferredDays.includes(getShiftDay(shift)) &&
        countWorkerHours(worker.id, assignments, getWeekKey(shift.date)) < getDesiredHours(worker),
    ),
    assignments,
  )[0];
  if (preferredVolunteer && getShiftAssignments(shift, assignments).length < rosterTarget) {
    commitCandidate(preferredVolunteer, shift, assignments, "Adds preference-aware volunteer support");
  }
  while (getShiftAssignments(shift, assignments).length < rosterTarget) {
    const paid = rankDailyRosterCandidates(
      shift,
      workers.filter((worker) => isPaidWorker(worker.workerType)),
      assignments,
    )[0];
    const volunteer = paid ? undefined : rankDailyRosterCandidates(
      shift,
      workers.filter((worker) => worker.workerType === "volunteer"),
      assignments,
    )[0];
    const selected = paid ?? volunteer;
    if (!selected) break;
    commitCandidate(
      selected,
      shift,
      assignments,
      selected.worker.workerType === "volunteer"
        ? "Adds preference-aware volunteer support"
        : "Fills the staggered daily roster",
    );
  }
}

function assignSupervisorAt(
  sourceShift: Shift,
  slot: Shift,
  workers: Worker[],
  assignments: ScheduleAssignment[],
) {
  if (!sourceShift.requiresSupervisor) return undefined;
  const current = getSlotAssignments(sourceShift, slot.startTime, slot.endTime, assignments);
  if (current.some((assignment) => assignment.workerType === "supervisor")) return undefined;
  const selected = rankCandidates(slot, sourceShift, workers.filter((worker) => worker.workerType === "supervisor"), assignments, { hardToFill: true })[0];
  return selected ? commitCandidate(selected, sourceShift, assignments, "Covers the required supervisor spot") : undefined;
}

function assignPaidMinimumAt(sourceShift: Shift, slot: Shift, workers: Worker[], assignments: ScheduleAssignment[]) {
  const added: ScheduleAssignment[] = [];
  const target = sourceShift.minPaidStaff ?? 0;
  while (
    getSlotAssignments(sourceShift, slot.startTime, slot.endTime, assignments).filter((assignment) => isPaidWorker(assignment.workerType)).length < target &&
    getSlotAssignments(sourceShift, slot.startTime, slot.endTime, assignments).length < sourceShift.requiredWorkers
  ) {
    const selected =
      rankCandidates(slot, sourceShift, workers.filter((worker) => worker.workerType === "paid_employee"), assignments)[0] ??
      rankCandidates(slot, sourceShift, workers.filter((worker) => worker.workerType === "supervisor"), assignments)[0];
    if (!selected) break;
    added.push(commitCandidate(selected, sourceShift, assignments, "Fills the minimum paid staffing rule"));
  }
  return added;
}

function fillCoverageAt(sourceShift: Shift, slot: Shift, workers: Worker[], assignments: ScheduleAssignment[]) {
  const added: ScheduleAssignment[] = [];
  while (getSlotAssignments(sourceShift, slot.startTime, slot.endTime, assignments).length < sourceShift.requiredWorkers) {
    const current = getSlotAssignments(sourceShift, slot.startTime, slot.endTime, assignments);
    const paidCount = current.filter((assignment) => isPaidWorker(assignment.workerType)).length;
    const paidCapReached = sourceShift.maxPaidStaff !== undefined && paidCount >= sourceShift.maxPaidStaff;
    const basePool = paidCapReached ? workers.filter((worker) => !isPaidWorker(worker.workerType)) : workers;
    const preferredPool = basePool.filter((worker) => worker.workerType !== "supervisor");
    let selected = rankCandidates(
      slot,
      sourceShift,
      preferredPool,
      assignments,
    )[0];
    if (!selected && preferredPool.length !== basePool.length) {
      selected = rankCandidates(slot, sourceShift, basePool, assignments)[0];
    }
    let capOverride = false;
    if (!selected && paidCapReached) {
      const fallbackPool = current.some((assignment) => assignment.workerType === "supervisor")
        ? workers.filter((worker) => worker.workerType !== "supervisor")
        : workers;
      selected = rankCandidates(slot, sourceShift, fallbackPool, assignments)[0] ??
        rankCandidates(slot, sourceShift, workers, assignments)[0];
      capOverride = true;
    }
    if (!selected) break;
    added.push(commitCandidate(selected, sourceShift, assignments, undefined, capOverride ? ["Exceeds the paid staff cap to protect minimum coverage"] : []));
  }
  return added;
}

function fullShiftCandidate(worker: Worker, shift: Shift, assignments: ScheduleAssignment[]) {
  const evaluation = calculateWorkerMatchScore(worker, shift, assignments);
  return { worker, segment: shift, evaluation, ...getCandidateBalance(worker, shift, assignments) };
}

export function assignRequiredSupervisor(shift: Shift, workers: Worker[], assignments: ScheduleAssignment[]) {
  if (!shift.requiresSupervisor || getShiftAssignments(shift, assignments).some((assignment) => assignment.workerType === "supervisor")) return undefined;
  const candidate = workers
    .filter((worker) => worker.workerType === "supervisor")
    .map((worker) => fullShiftCandidate(worker, shift, assignments))
    .filter((item) => item.evaluation.eligible)
    .sort((a, b) => b.evaluation.score - a.evaluation.score)[0];
  return candidate ? commitCandidate(candidate, shift, assignments, "Covers the required supervisor spot") : undefined;
}

export const assignSupervisorIfRequired = assignRequiredSupervisor;

export function assignMinimumPaidStaff(shift: Shift, workers: Worker[], assignments: ScheduleAssignment[]) {
  const added: ScheduleAssignment[] = [];
  const target = shift.minPaidStaff ?? 0;
  while (getShiftAssignments(shift, assignments).filter((assignment) => isPaidWorker(assignment.workerType)).length < target && getShiftAssignments(shift, assignments).length < shift.requiredWorkers) {
    const candidate = workers
      .filter((worker) => isPaidWorker(worker.workerType))
      .map((worker) => fullShiftCandidate(worker, shift, assignments))
      .filter((item) => item.evaluation.eligible)
      .sort((a, b) => b.evaluation.score - a.evaluation.score)[0];
    if (!candidate) break;
    added.push(commitCandidate(candidate, shift, assignments, "Fills the minimum paid staffing rule"));
  }
  return added;
}

export function fillRemainingCoverage(shift: Shift, workers: Worker[], assignments: ScheduleAssignment[]) {
  const added: ScheduleAssignment[] = [];
  while (getShiftAssignments(shift, assignments).length < shift.requiredWorkers) {
    const paidCount = getShiftAssignments(shift, assignments).filter((assignment) => isPaidWorker(assignment.workerType)).length;
    const paidCapReached = shift.maxPaidStaff !== undefined && paidCount >= shift.maxPaidStaff;
    const preferredPool = paidCapReached ? workers.filter((worker) => !isPaidWorker(worker.workerType)) : workers;
    let candidate = preferredPool
      .map((worker) => fullShiftCandidate(worker, shift, assignments))
      .filter((item) => item.evaluation.eligible)
      .sort((a, b) => b.evaluation.score - a.evaluation.score)[0];
    let capOverride = false;
    if (!candidate && paidCapReached) {
      candidate = workers
        .map((worker) => fullShiftCandidate(worker, shift, assignments))
        .filter((item) => item.evaluation.eligible)
        .sort((a, b) => b.evaluation.score - a.evaluation.score)[0];
      capOverride = true;
    }
    if (!candidate) break;
    added.push(commitCandidate(candidate, shift, assignments, undefined, capOverride ? ["Exceeds the paid staff cap to avoid an unfilled spot"] : []));
  }
  return added;
}

export const assignRemainingWorkers = fillRemainingCoverage;

export function getShiftMinimumCoverage(shift: Shift, assignments: ScheduleAssignment[]) {
  if (shift.staffingMode === "daily_roster") return getShiftAssignments(shift, assignments).length;
  const slots = buildSlots(shift);
  if (slots.length === 0) return 0;
  return Math.min(...slots.map((slot) => getSlotAssignments(shift, slot.startTime, slot.endTime, assignments).length));
}

export function getCoverageMetrics(shifts: Shift[], assignments: ScheduleAssignment[]): CoverageMetrics {
  let requiredWorkerHours = 0;
  let coveredWorkerHours = 0;
  for (const shift of shifts) {
    if (shift.staffingMode === "daily_roster") {
      const required = shift.requiredWorkerHours ?? shift.requiredWorkers * 8;
      const assigned = getShiftAssignments(shift, assignments);
      requiredWorkerHours += required;
      coveredWorkerHours += required * Math.min(1, assigned.length / Math.max(shift.requiredWorkers, 1));
      continue;
    }
    for (const slot of buildSlots(shift)) {
      requiredWorkerHours += shift.requiredWorkers * slot.hours;
      coveredWorkerHours += Math.min(
        shift.requiredWorkers,
        getSlotAssignments(shift, slot.startTime, slot.endTime, assignments).length,
      ) * slot.hours;
    }
  }
  requiredWorkerHours = round(requiredWorkerHours);
  coveredWorkerHours = round(coveredWorkerHours);
  return {
    requiredWorkerHours,
    coveredWorkerHours,
    coverageRate: requiredWorkerHours ? Math.round((coveredWorkerHours / requiredWorkerHours) * 100) : 100,
  };
}

export function getUncoveredShifts(shifts: Shift[], assignments: ScheduleAssignment[]): CoverageGap[] {
  return shifts.flatMap((shift) => {
    const assignedCount = getShiftMinimumCoverage(shift, assignments);
    if (assignedCount >= shift.requiredWorkers) return [];
    const anyAssignments = getShiftAssignments(shift, assignments).length > 0;
    return [{
      shift,
      assignedCount,
      requiredCount: shift.requiredWorkers,
      missingWorkers: shift.requiredWorkers - assignedCount,
      status: anyAssignments ? "partial" : "uncovered",
    }];
  });
}

export function getFairnessStats(workers: Worker[], assignments: ScheduleAssignment[]): FairnessStats {
  const workerStats = workers
    .map((worker) => {
      const assignedShifts = countWorkerAssignments(worker.id, assignments);
      const assignedHours = countWorkerHours(worker.id, assignments);
      return {
        worker,
        assignedShifts,
        assignedHours,
        desiredHoursPerWeek: getDesiredHours(worker),
        maxHoursPerWeek: getMaxHours(worker),
        maxShiftsPerWeek: worker.maxShiftsPerWeek,
        utilizationRate: getMaxHours(worker) ? Math.round((assignedHours / getMaxHours(worker)) * 100) : 0,
      };
    })
    .sort((a, b) => b.assignedHours - a.assignedHours || a.worker.name.localeCompare(b.worker.name));
  const counts = workerStats.map((stat) => stat.assignedShifts);
  const minimumAssignments = counts.length ? Math.min(...counts) : 0;
  const maximumAssignments = counts.length ? Math.max(...counts) : 0;
  return {
    workers: workerStats,
    totalAssignments: assignments.length,
    averageAssignments: workers.length ? Number((assignments.length / workers.length).toFixed(1)) : 0,
    minimumAssignments,
    maximumAssignments,
    assignmentSpread: maximumAssignments - minimumAssignments,
  };
}

export function getLaborCostStats(shifts: Shift[], assignments: ScheduleAssignment[]): LaborCostStats {
  const shiftEstimates = [...shifts]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((shift) => {
      const paid = getShiftAssignments(shift, assignments).filter((assignment) => isPaidWorker(assignment.workerType));
      return {
        shift,
        paidAssignments: paid.length,
        estimatedCost: round(paid.reduce((sum, assignment) => sum + (assignment.estimatedCost ?? 0), 0)),
        missingRates: paid.filter((assignment) => assignment.warnings.some((warning) => warning.includes("No hourly rate"))).length,
      };
    });
  const paidAssignments = shiftEstimates.reduce((sum, item) => sum + item.paidAssignments, 0);
  return {
    shifts: shiftEstimates,
    totalEstimatedCost: round(shiftEstimates.reduce((sum, item) => sum + item.estimatedCost, 0)),
    paidAssignments,
    volunteerAssignments: assignments.length - paidAssignments,
    missingRates: shiftEstimates.reduce((sum, item) => sum + item.missingRates, 0),
  };
}

export function getCoverageRiskLevel(shift: Shift, assignments: ScheduleAssignment[]): ShiftRiskAssessment {
  if (shift.staffingMode === "daily_roster") {
    const assigned = getShiftAssignments(shift, assignments);
    const managerTarget = shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0);
    const managers = assigned.filter((item) => item.workerType === "supervisor").length;
    const paid = assigned.filter((item) => isPaidWorker(item.workerType)).length;
    const reasons: string[] = [];
    let level: CoverageRiskLevel = "low";
    if (assigned.length < shift.requiredWorkers) {
      level = shift.priority === "Urgent" || shift.priority === "High" ? "critical" : "high";
      reasons.push(`${shift.requiredWorkers - assigned.length} of ${shift.requiredWorkers} daily roster positions unfilled`);
    }
    if (managers < managerTarget) {
      level = "high";
      reasons.push(`Only ${managers} of ${managerTarget} required managers assigned`);
    }
    if (shift.minPaidStaff !== undefined && paid < shift.minPaidStaff) {
      level = "high";
      reasons.push(`Only ${paid} of ${shift.minPaidStaff} minimum paid staff assigned`);
    }
    if (level === "low") reasons.push("Daily roster and manager requirements met");
    return { shift, level, reasons };
  }
  const slots = buildSlots(shift);
  const coverage = slots.map((slot) => getSlotAssignments(shift, slot.startTime, slot.endTime, assignments));
  const minimumCoverage = coverage.length ? Math.min(...coverage.map((items) => items.length)) : 0;
  const minimumPaid = coverage.length ? Math.min(...coverage.map((items) => items.filter((item) => isPaidWorker(item.workerType)).length)) : 0;
  const managerEverySlot = coverage.every((items) => items.some((item) => item.workerType === "supervisor"));
  const missing = shift.requiredWorkers - minimumCoverage;
  const highPriority = shift.priority === "Urgent" || shift.priority === "High";
  const reasons: string[] = [];
  let level: CoverageRiskLevel = "low";
  const raise = (next: CoverageRiskLevel) => {
    if (RISK_ORDER[next] > RISK_ORDER[level]) level = next;
  };
  if (minimumCoverage === 0) {
    raise(highPriority ? "critical" : "high");
    reasons.push(getShiftAssignments(shift, assignments).length === 0 ? "No workers assigned" : "No staff during part of the operating window");
  } else if (missing > 0) {
    raise(highPriority ? "high" : "medium");
    reasons.push(`${missing} of ${shift.requiredWorkers} positions unfilled during the weakest period`);
  }
  if (shift.requiresSupervisor && !managerEverySlot) {
    raise("high");
    reasons.push("Required supervisor not assigned");
  }
  if (shift.minPaidStaff !== undefined && minimumPaid < shift.minPaidStaff) {
    raise("high");
    reasons.push(`Only ${minimumPaid} of ${shift.minPaidStaff} minimum paid staff assigned`);
  }
  if (level === "low") reasons.push("Fully staffed with all staffing rules met");
  return { shift, level, reasons };
}

export function explainUncoveredShift(shift: Shift, workers: Worker[], assignments: ScheduleAssignment[]) {
  const reasons: string[] = [];
  const roleQualified = workers.filter((worker) => worker.roles.includes(shift.requiredRole));
  const available = roleQualified.filter((worker) => isAvailable(worker, shift));
  if (roleQualified.length === 0) reasons.push(`No workers are qualified for ${shift.requiredRole}.`);
  else if (available.length === 0) reasons.push("No qualified workers are available for the full operating window.");
  if (available.length > 0 && available.every((worker) => !respectsMaxShifts(worker, assignments, shift.date))) {
    reasons.push("Every otherwise eligible worker has reached their weekly shift limit.");
  }
  if (shift.requiresSupervisor && !available.some((worker) => worker.workerType === "supervisor")) {
    reasons.push("No supervisor is available for the required leadership coverage.");
  }
  if (shift.minPaidStaff && available.filter((worker) => isPaidWorker(worker.workerType)).length < shift.minPaidStaff) {
    reasons.push(`Fewer than ${shift.minPaidStaff} paid staff are available.`);
  }
  return reasons.length ? reasons : ["Eligible capacity is insufficient during part of this shift."];
}

function buildShiftResults(context: ScheduleContext): ShiftScheduleResult[] {
  return [...context.shifts]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((shift) => {
      const assignedWorkers = getShiftAssignments(shift, context.assignments);
      const minimumCoverage = getShiftMinimumCoverage(shift, context.assignments);
      const risk = getCoverageRiskLevel(shift, context.assignments);
      const managerTarget = shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0);
      const supervisorCovered = assignedWorkers.filter((assignment) => assignment.workerType === "supervisor").length >= managerTarget;
      const paidMet = shift.minPaidStaff === undefined || assignedWorkers.filter((assignment) => isPaidWorker(assignment.workerType)).length >= shift.minPaidStaff;
      return {
        shiftId: shift.id,
        assignedWorkers,
        requiredWorkers: shift.requiredWorkers,
        coverageStatus: minimumCoverage >= shift.requiredWorkers
          ? "covered"
          : assignedWorkers.length > 0
            ? "partially_covered"
            : "uncovered",
        riskLevel: risk.level,
        uncoveredReasons: minimumCoverage >= shift.requiredWorkers ? [] : explainUncoveredShift(shift, context.workers, context.assignments),
        supervisorStatus: managerTarget > 0 ? (supervisorCovered ? "covered" : "missing") : "not_required",
        paidStaffStatus: shift.minPaidStaff === undefined ? "not_required" : (paidMet ? "met" : "short"),
        estimatedLaborCost: round(assignedWorkers.reduce((sum, assignment) => sum + (assignment.estimatedCost ?? 0), 0)),
      };
    });
}

function exactCandidate(
  worker: Worker,
  shift: Shift,
  startTime: string,
  endTime: string,
  assignments: ScheduleAssignment[],
  context: MatchContext = {},
): Candidate | undefined {
  const segment = { ...shift, startTime, endTime };
  const evaluation = calculateWorkerMatchScore(worker, segment, assignments, context);
  if (!evaluation.eligible) return undefined;
  return { worker, segment, evaluation, ...getCandidateBalance(worker, segment, assignments) };
}

function canPreserveAssignmentRule(assignment: ScheduleAssignment, replacement: Worker) {
  if (assignment.shift.requiresSupervisor && assignment.workerType === "supervisor" && replacement.workerType !== "supervisor") return false;
  if (assignment.shift.minPaidStaff && isPaidWorker(assignment.workerType) && !isPaidWorker(replacement.workerType)) return false;
  return true;
}

export function repairUncoveredShifts(context: ScheduleContext) {
  const ordered = [...context.shifts].sort(
    (a, b) => getShiftDifficultyScore(b, context.workers, context.assignments) - getShiftDifficultyScore(a, context.workers, context.assignments),
  );
  for (const sourceShift of ordered) {
    if (sourceShift.staffingMode === "daily_roster") continue;
    for (const slot of buildSlots(sourceShift)) {
      while (getSlotAssignments(sourceShift, slot.startTime, slot.endTime, context.assignments).length < sourceShift.requiredWorkers) {
        const segment = { ...sourceShift, startTime: slot.startTime, endTime: slot.endTime };
        const current = getSlotAssignments(sourceShift, slot.startTime, slot.endTime, context.assignments);
        const directPool = sourceShift.requiresSupervisor && !current.some((item) => item.workerType === "supervisor")
          ? context.workers.filter((worker) => worker.workerType === "supervisor")
          : context.workers.filter((worker) => worker.workerType !== "supervisor");
        const direct = rankCandidates(segment, sourceShift, directPool, context.assignments, { hardToFill: true, allShifts: context.shifts })[0] ??
          rankCandidates(segment, sourceShift, context.workers, context.assignments, { hardToFill: true, allShifts: context.shifts })[0];
        if (direct) {
          commitCandidate(direct, sourceShift, context.assignments, "Added during the coverage repair pass");
          continue;
        }

        let repaired = false;
        const blockers = context.workers.filter(
          (worker) => worker.roles.includes(sourceShift.requiredRole) && isAvailable(worker, segment),
        );
        for (const blocker of blockers) {
          const movable = context.assignments.filter((assignment) => assignment.workerId === blocker.id);
          for (const oldAssignment of movable) {
            const withoutOld = context.assignments.filter((assignment) => assignment !== oldAssignment);
            const replacement = context.workers
              .filter((worker) => worker.id !== blocker.id && canPreserveAssignmentRule(oldAssignment, worker))
              .flatMap((worker) => {
                const candidate = exactCandidate(
                  worker,
                  oldAssignment.shift,
                  assignmentStartTime(oldAssignment),
                  assignmentEndTime(oldAssignment),
                  withoutOld,
                  { allShifts: context.shifts },
                );
                return candidate ? [candidate] : [];
              })
              .sort((a, b) => a.loadRatio - b.loadRatio || b.evaluation.score - a.evaluation.score)[0];
            const movedEnd = chooseAssignmentEnd(blocker, sourceShift, slot.startTime, withoutOld);
            const moved = movedEnd
              ? exactCandidate(blocker, sourceShift, slot.startTime, movedEnd, withoutOld, { hardToFill: true, allShifts: context.shifts })
              : undefined;
            if (!replacement || !moved) continue;
            context.assignments.splice(context.assignments.indexOf(oldAssignment), 1);
            commitCandidate(replacement, oldAssignment.shift, context.assignments, "Rebalanced to unlock harder coverage");
            commitCandidate(moved, sourceShift, context.assignments, "Moved during the coverage repair pass");
            repaired = true;
            break;
          }
          if (repaired) break;
        }
        if (repaired) continue;

        const emergencyPool = sourceShift.requiresSupervisor &&
          !getSlotAssignments(sourceShift, slot.startTime, slot.endTime, context.assignments).some((item) => item.workerType === "supervisor")
          ? context.workers.filter((worker) => worker.workerType === "supervisor")
          : context.workers;
        const emergency = rankCandidates(segment, sourceShift, emergencyPool, context.assignments, {
          hardToFill: true,
          allowRoleMismatch: true,
          allShifts: context.shifts,
        })[0];
        if (!emergency) break;
        commitCandidate(emergency, sourceShift, context.assignments, "Emergency fallback prevented an uncovered period");
      }
    }
  }
  return context;
}

export function rebalanceOverloadedWorkers(context: ScheduleContext) {
  for (let pass = 0; pass < context.assignments.length; pass += 1) {
    const fairness = getFairnessStats(context.workers, context.assignments);
    const overloaded = fairness.workers.find(
      (stat) => stat.assignedHours > stat.desiredHoursPerWeek || stat.utilizationRate > 90,
    );
    if (!overloaded) break;
    const oldAssignment = context.assignments
      .filter((assignment) => assignment.workerId === overloaded.worker.id)
      .sort((a, b) => getAssignmentDurationHours(b) - getAssignmentDurationHours(a))[0];
    if (!oldAssignment) break;
    const withoutOld = context.assignments.filter((assignment) => assignment !== oldAssignment);
    const replacement = fairness.workers
      .filter((stat) => stat.worker.id !== overloaded.worker.id && stat.assignedHours < stat.desiredHoursPerWeek)
      .filter((stat) => canPreserveAssignmentRule(oldAssignment, stat.worker))
      .flatMap((stat) => {
        const candidate = exactCandidate(
          stat.worker,
          oldAssignment.shift,
          assignmentStartTime(oldAssignment),
          assignmentEndTime(oldAssignment),
          withoutOld,
          { allShifts: context.shifts },
        );
        return candidate ? [{ candidate, assignedHours: stat.assignedHours }] : [];
      })
      .sort((a, b) => a.assignedHours - b.assignedHours || b.candidate.evaluation.score - a.candidate.evaluation.score)[0];
    if (!replacement) break;
    context.assignments.splice(context.assignments.indexOf(oldAssignment), 1);
    commitCandidate(replacement.candidate, oldAssignment.shift, context.assignments, "Rebalanced for a fairer weekly workload");
  }
  return context;
}

export function validateFinalSchedule(context: ScheduleContext): ScheduleValidationResult {
  const issues: ScheduleValidationResult["issues"] = [];
  const shiftResults = buildShiftResults(context);
  for (const worker of context.workers) {
    const assignments = context.assignments.filter((assignment) => assignment.workerId === worker.id);
    const weeks = [...new Set(assignments.map((assignment) => getWeekKey(assignment.shift.date)))];
    for (const week of weeks) {
      if (countWorkerAssignments(worker.id, assignments, week) > worker.maxShiftsPerWeek) {
        issues.push({ rule: "max_shifts", message: `${worker.name} exceeds max shifts.`, workerId: worker.id });
      }
      if (countWorkerHours(worker.id, assignments, week) > getMaxHours(worker)) {
        issues.push({ rule: "max_hours", message: `${worker.name} exceeds maximum weekly hours.`, workerId: worker.id });
      }
    }
    for (let first = 0; first < assignments.length; first += 1) {
      const segment = { ...assignments[first].shift, startTime: assignmentStartTime(assignments[first]), endTime: assignmentEndTime(assignments[first]) };
      if (!assignments[first].scoreBreakdown || assignments[first].scoreBreakdown.total !== assignments[first].matchScore) {
        issues.push({ rule: "score_breakdown", message: `${worker.name} has an invalid score breakdown.`, workerId: worker.id, shiftId: segment.id });
      }
      if (typeof assignments[first].estimatedCost !== "number") {
        issues.push({ rule: "labor_cost", message: `${worker.name} is missing assignment labor cost.`, workerId: worker.id, shiftId: segment.id });
      }
      if (!isAvailable(worker, segment)) issues.push({ rule: "availability", message: `${worker.name} is assigned outside availability.`, workerId: worker.id, shiftId: segment.id });
      if (!worker.roles.includes(segment.requiredRole) && !assignments[first].warnings.some((warning) => warning.includes("Emergency role mismatch"))) {
        issues.push({ rule: "role", message: `${worker.name} has an unexplained role mismatch.`, workerId: worker.id, shiftId: segment.id });
      }
      for (let second = first + 1; second < assignments.length; second += 1) {
        if (assignments[first].shift.date === assignments[second].shift.date &&
          assignmentStartTime(assignments[first]) < assignmentEndTime(assignments[second]) &&
          assignmentEndTime(assignments[first]) > assignmentStartTime(assignments[second])) {
          issues.push({ rule: "overlap", message: `${worker.name} has overlapping assignments.`, workerId: worker.id });
        }
      }
    }
  }
  for (const shift of context.shifts) {
    const result = shiftResults.find((item) => item.shiftId === shift.id);
    if (!result) issues.push({ rule: "shift_result", message: `${shift.title} is missing from results.`, shiftId: shift.id });
    if (shift.requiresSupervisor && result?.supervisorStatus === "missing" && result.riskLevel === "low") {
      issues.push({ rule: "supervisor", message: `${shift.title} does not flag its missing supervisor.`, shiftId: shift.id });
    }
    if (shift.minPaidStaff && result?.paidStaffStatus === "short" && result.riskLevel === "low") {
      issues.push({ rule: "paid_staff", message: `${shift.title} does not flag its paid staffing shortfall.`, shiftId: shift.id });
    }
    if (result?.coverageStatus !== "covered" && result?.uncoveredReasons.length === 0) {
      issues.push({ rule: "uncovered_reason", message: `${shift.title} has no uncovered explanation.`, shiftId: shift.id });
    }
    if (shift.staffingMode === "daily_roster") {
      if (getShiftAssignments(shift, context.assignments).length > (shift.maxDailyWorkers ?? shift.requiredWorkers)) {
        issues.push({ rule: "overstaffing", message: `${shift.title} exceeds its daily roster cap.`, shiftId: shift.id });
      }
      continue;
    }
    for (const slot of buildSlots(shift)) {
      if (getSlotAssignments(shift, slot.startTime, slot.endTime, context.assignments).length > shift.requiredWorkers) {
        issues.push({ rule: "overstaffing", message: `${shift.title} is overstaffed during ${slot.startTime}.`, shiftId: shift.id });
        break;
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function generateScheduleForPlan(
  workers: Worker[],
  shifts: Shift[],
  plan: SchedulingPlan,
  existingAssignments: ScheduleAssignment[] = [],
): OptimizedScheduleResult {
  const assignments: ScheduleAssignment[] = [...existingAssignments];
  const scarcity = new Map(shifts.map((shift) => [shift.id, getShiftScarcity(shift, workers)]));
  const difficulty = new Map(shifts.map((shift) => [shift.id, getShiftDifficultyScore(shift, workers, assignments)]));
  const orderedShifts = [...shifts].sort(
    (a, b) =>
      (difficulty.get(b.id) ?? 0) - (difficulty.get(a.id) ?? 0) ||
      (scarcity.get(a.id) ?? 0) - (scarcity.get(b.id) ?? 0) ||
      (plan.dateRank.get(a.date) ?? 0) - (plan.dateRank.get(b.date) ?? 0) ||
      a.startTime.localeCompare(b.startTime) ||
      a.id.localeCompare(b.id),
  );

  for (const sourceShift of orderedShifts) {
    if (sourceShift.staffingMode === "daily_roster") {
      assignDailyRosterShift(sourceShift, workers, assignments);
      continue;
    }
    for (const slot of buildSlots(sourceShift)) {
      const slotShift = { ...sourceShift, startTime: slot.startTime, endTime: slot.endTime };
      assignSupervisorAt(sourceShift, slotShift, workers, assignments);
      assignPaidMinimumAt(sourceShift, slotShift, workers, assignments);
      fillCoverageAt(sourceShift, slotShift, workers, assignments);
    }
  }

  const context = repairUncoveredShifts({ workers, shifts, assignments });
  rebalanceOverloadedWorkers(context);

  context.assignments.sort(
    (a, b) =>
      a.shift.date.localeCompare(b.shift.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.worker.name.localeCompare(b.worker.name),
  );
  const coverageGaps = getUncoveredShifts(shifts, context.assignments);
  const shiftRisks = orderedShifts.map((shift) => getCoverageRiskLevel(shift, context.assignments));
  const shiftResults = buildShiftResults(context);
  return {
    assignments: context.assignments,
    uncoveredShifts: coverageGaps.filter((gap) => gap.status === "uncovered"),
    partiallyCoveredShifts: coverageGaps.filter((gap) => gap.status === "partial"),
    fairnessStats: getFairnessStats(workers, context.assignments),
    laborCostStats: getLaborCostStats(shifts, context.assignments),
    shiftRisks,
    shiftResults,
    validation: validateFinalSchedule(context),
  };
}

type ScheduleQuality = {
  coveredWorkerHours: number;
  priorityCoverage: number;
  riskPenalty: number;
  totalCost: number;
  spreadScore: number;
};

function getScheduleQuality(result: OptimizedScheduleResult, workers: Worker[], shifts: Shift[]): ScheduleQuality {
  const coverage = getCoverageMetrics(shifts, result.assignments);
  const priorityCoverage = SHIFT_PRIORITIES.reduce((score, priority) => {
    const priorityShifts = shifts.filter((shift) => shift.priority === priority);
    return score + getCoverageMetrics(priorityShifts, result.assignments).coveredWorkerHours * PRIORITY_ORDER[priority];
  }, 0);
  const riskPenalty = result.shiftRisks.reduce(
    (sum, risk) => sum + RISK_ORDER[risk.level],
    0,
  );
  let spreadScore = 0;
  const loadRatios: number[] = [];
  for (const worker of workers) {
    const byWeek = new Map<string, ScheduleAssignment[]>();
    for (const assignment of result.assignments.filter((item) => item.workerId === worker.id)) {
      const week = getWeekKey(assignment.shift.date);
      byWeek.set(week, [...(byWeek.get(week) ?? []), assignment]);
    }
    for (const assignments of byWeek.values()) {
      const dates = [...new Set(assignments.map((assignment) => assignment.shift.date))].sort();
      const hours = assignments.reduce((sum, assignment) => sum + getAssignmentDurationHours(assignment), 0);
      loadRatios.push(hours / Math.max(getDesiredHours(worker), 1));
      if (dates.length > 1) {
        spreadScore += daysBetween(dates[0], dates[dates.length - 1]) * 20;
        spreadScore -= dates.slice(1).filter((date, index) => daysBetween(date, dates[index]) === 1).length * 6;
      }
      spreadScore -= (assignments.length - dates.length) * 25;
    }
  }
  if (loadRatios.length > 1) {
    const mean = loadRatios.reduce((sum, ratio) => sum + ratio, 0) / loadRatios.length;
    spreadScore -= loadRatios.reduce((sum, ratio) => sum + Math.abs(ratio - mean), 0) * 40;
  }
  return {
    coveredWorkerHours: coverage.coveredWorkerHours,
    priorityCoverage,
    riskPenalty,
    totalCost: result.laborCostStats.totalEstimatedCost,
    spreadScore,
  };
}

// Lexicographic objective. Coverage always wins, then priority-weighted
// coverage, then lower risk. Labor cost is only a tiebreaker among plans that
// are otherwise equal on coverage/priority/risk—so the schedule reaches the
// most coverage it can and, once that is settled, does it as cheaply as
// possible. Fair spread breaks any remaining ties.
function compareScheduleQuality(a: ScheduleQuality, b: ScheduleQuality) {
  return (
    b.coveredWorkerHours - a.coveredWorkerHours ||
    b.priorityCoverage - a.priorityCoverage ||
    a.riskPenalty - b.riskPenalty ||
    a.totalCost - b.totalCost ||
    b.spreadScore - a.spreadScore
  );
}

export function generateOptimizedSchedule(input: ScheduleInput): OptimizedScheduleResult;
export function generateOptimizedSchedule(workers: Worker[], shifts: Shift[]): OptimizedScheduleResult;
export function generateOptimizedSchedule(inputOrWorkers: ScheduleInput | Worker[], inputShifts: Shift[] = []): OptimizedScheduleResult {
  const { workers, shifts, assignments } = normalizeScheduleInput(inputOrWorkers, inputShifts);
  const ranked = buildSchedulingPlans(shifts)
    .map((plan) => generateScheduleForPlan(workers, shifts, plan, assignments))
    .map((result) => ({ result, quality: getScheduleQuality(result, workers, shifts) }))
    .sort((a, b) => compareScheduleQuality(a.quality, b.quality));
  return ranked[0]?.result ?? generateScheduleForPlan(workers, shifts, buildSchedulingPlan(shifts, "forward"), assignments);
}
