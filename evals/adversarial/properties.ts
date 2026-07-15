import type { EvaluationCase, ValidationIssue } from "../schema";
import { DAYS } from "../../src/types";
import { runProductionScheduler, validateSchedule } from "../validators";
import { availability, evaluationCase, paid, seededRandom, shift, supervisor, TEST_WEEK, worker } from "./factories";

const FEASIBILITY_CODES = new Set([
  "MINIMUM_COVERAGE_NOT_MET",
  "MINIMUM_WORKER_HOURS_NOT_MET",
  "REQUIRED_SUPERVISOR_MISSING",
  "MINIMUM_PAID_STAFF_NOT_MET",
]);

export type PropertyFailure = {
  seed: number;
  caseId: string;
  message: string;
  issues: ValidationIssue[];
  fixture: EvaluationCase;
};

export type PropertyResult = {
  category: "K-property-based-randomized";
  total: number;
  passed: number;
  failed: number;
  failures: PropertyFailure[];
  seedRange: [number, number];
};

function time(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function generatePropertyCase(seed: number): EvaluationCase {
  const random = seededRandom(seed);
  const roles = ["General Support", "Food Service", "Reception"];
  const workerCount = 3 + Math.floor(random() * 10);
  const shiftCount = 1 + Math.floor(random() * 8);
  const workers = Array.from({ length: workerCount }, (_, index) => {
    const role = roles[Math.floor(random() * roles.length)];
    const availableDays = DAYS.filter(() => random() > 0.2);
    const start = random() > 0.15 ? "08:00" : "10:00";
    const end = random() > 0.15 ? "19:00" : "15:00";
    const common = {
      id: `p-${seed}-w-${index}`,
      roles: random() > 0.25 ? [role, "General Support"] : [role],
      availability: availability(availableDays, start, end),
      desiredHoursPerWeek: 8 + Math.floor(random() * 25),
      maxHoursPerWeek: 16 + Math.floor(random() * 25),
      maxShiftsPerWeek: 2 + Math.floor(random() * 6),
    };
    if (index === 0 || random() < 0.15) return supervisor(common.id, { ...common, roles: [...common.roles, "Manager"] });
    if (random() < 0.55) return paid(common.id, { ...common, employmentType: random() < 0.5 ? "part_time" : "full_time" });
    return worker(common.id, { ...common, maxHoursPerWeek: Math.min(18, common.maxHoursPerWeek) });
  });
  const shifts = Array.from({ length: shiftCount }, (_, index) => {
    const startMinutes = 9 * 60 + Math.floor(random() * 10) * 30;
    const maximumLength = Math.min(8 * 60, 18 * 60 - startMinutes);
    const length = Math.max(60, (2 + Math.floor(random() * Math.max(1, maximumLength / 60 - 1))) * 60);
    const role = roles[Math.floor(random() * roles.length)];
    const date = TEST_WEEK[Math.floor(random() * TEST_WEEK.length)];
    const managerRequired = random() < 0.25;
    return shift(`p-${seed}-s-${index}`, {
      title: `Property shift ${index}`,
      date,
      startTime: time(startMinutes),
      endTime: time(Math.min(18 * 60, startMinutes + length)),
      requiredRole: role,
      requiredWorkers: 1 + Math.floor(random() * Math.min(4, workerCount)),
      requiresSupervisor: managerRequired,
      requiredSupervisors: managerRequired ? 1 : 0,
      priority: random() < 0.15 ? "Urgent" : random() < 0.4 ? "High" : "Normal",
    });
  });
  return evaluationCase(
    `property-${seed}`,
    "K-property-based-randomized",
    { workers, shifts, existingAssignments: [], cancelledWorkerIds: [] },
  );
}

function signature(assignments: ReturnType<typeof runProductionScheduler>["assignments"]) {
  return assignments
    .map((item) => `${item.workerId}|${item.shiftId}|${item.startTime}|${item.endTime}`)
    .sort()
    .join("\n");
}

export function runPropertySuite(count = 1_000, firstSeed = 41_000): PropertyResult {
  const failures: PropertyFailure[] = [];
  for (let index = 0; index < count; index += 1) {
    const seed = firstSeed + index;
    const fixture = generatePropertyCase(seed);
    try {
      const first = runProductionScheduler(fixture);
      const unsafeIssues = validateSchedule(fixture, first).filter(
        (item) => item.severity === "hard" && !FEASIBILITY_CODES.has(item.code),
      );
      if (unsafeIssues.length) {
        failures.push({ seed, caseId: fixture.id, message: "Production output violated assignment invariants.", issues: unsafeIssues, fixture });
        continue;
      }
      if (index < 100) {
        const second = runProductionScheduler(fixture);
        if (signature(first.assignments) !== signature(second.assignments)) {
          failures.push({ seed, caseId: fixture.id, message: "Repeated execution produced a different assignment set.", issues: [], fixture });
        }
      }
    } catch (error) {
      failures.push({
        seed,
        caseId: fixture.id,
        message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        issues: [],
        fixture,
      });
    }
  }
  return {
    category: "K-property-based-randomized",
    total: count,
    passed: count - failures.length,
    failed: failures.length,
    failures,
    seedRange: [firstSeed, firstSeed + count - 1],
  };
}
