import { DAYS, type DayOfWeek, type Shift, type Worker } from "../../src/types";
import type { EvaluationCase } from "../schema";

export const TEST_WEEK = [
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-09",
  "2026-10-10",
  "2026-10-11",
] as const;

export function availability(days: readonly DayOfWeek[] = DAYS, start = "08:00", end = "18:00") {
  return Object.fromEntries(days.map((day) => [day, [{ start, end }]])) as Worker["availability"];
}

export function worker(id: string, overrides: Partial<Worker> = {}): Worker {
  return {
    id,
    name: id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    email: `${id}@adversarial.test`,
    workerType: "volunteer",
    roles: ["General Support"],
    availability: availability(),
    preferredDays: [],
    preferredRoles: [],
    maxShiftsPerWeek: 7,
    desiredHoursPerWeek: 20,
    maxHoursPerWeek: 30,
    reliabilityScore: 4,
    notes: "Adversarial evaluation fixture",
    ...overrides,
  };
}

export function paid(id: string, overrides: Partial<Worker> = {}): Worker {
  return worker(id, {
    workerType: "paid_employee",
    employmentType: "full_time",
    desiredHoursPerWeek: 40,
    maxHoursPerWeek: 40,
    maxShiftsPerWeek: 7,
    hourlyRate: 22,
    ...overrides,
  });
}

export function supervisor(id: string, overrides: Partial<Worker> = {}): Worker {
  return paid(id, {
    workerType: "supervisor",
    roles: ["General Support", "Manager"],
    hourlyRate: 28,
    ...overrides,
  });
}

export function shift(id: string, overrides: Partial<Shift> = {}): Shift {
  return {
    id,
    title: id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    date: TEST_WEEK[0],
    startTime: "09:00",
    endTime: "13:00",
    location: "Adversarial Community Center",
    requiredRole: "General Support",
    requiredWorkers: 1,
    requiresSupervisor: false,
    priority: "Normal",
    notes: "Adversarial evaluation shift",
    ...overrides,
  };
}

export function evaluationCase(
  id: string,
  category: string,
  input: EvaluationCase["input"],
  overrides: Partial<Omit<EvaluationCase, "id" | "name" | "description" | "category" | "input">> = {},
): EvaluationCase {
  return {
    id,
    name: id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: `Adversarial ${category} scenario ${id}.`,
    category,
    input,
    expectedStatus: "success",
    requiredAssignments: [],
    forbiddenAssignments: [],
    expectedUnfilledShifts: [],
    expectedWarnings: [],
    expectedHardViolationCodes: [],
    maximumAllowedHardViolations: 0,
    minimumSoftQualityThresholds: { maximumOvertimeHours: 0 },
    timeoutMs: 10_000,
    ...overrides,
  };
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function pick<T>(random: () => number, values: readonly T[]) {
  return values[Math.floor(random() * values.length)];
}
