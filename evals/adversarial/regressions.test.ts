import { describe, expect, it } from "vitest";
import { calculateMatchScore, generateOptimizedSchedule } from "../../src/lib/scheduler";
import { validateSchedule } from "../validators";
import { paid, shift, worker } from "./factories";
import { generatePropertyCase } from "./properties";

describe("adversarial scheduler regressions", () => {
  it("uses the longest overlapping availability block regardless of array order", () => {
    const candidate = worker("ordered-availability", {
      availability: { Monday: [{ start: "09:00", end: "10:00" }, { start: "09:00", end: "13:00" }] },
    });

    expect(calculateMatchScore(candidate, shift("ordered-shift", { startTime: "09:00", endTime: "13:00" })).eligible).toBe(true);
  });

  it("never emits more than one assignment for a worker and shift", () => {
    const fixture = generatePropertyCase(41_041);
    const result = generateOptimizedSchedule({
      workers: fixture.input.workers,
      shifts: fixture.input.shifts,
      assignments: [],
    });
    const issues = validateSchedule(fixture, result);

    expect(issues.filter((item) => item.code === "DUPLICATE_ASSIGNMENT")).toHaveLength(0);
  });

  it("fails duplicate identifiers safely without producing corrupt assignments", () => {
    const duplicate = shift("duplicate-shift");
    const result = generateOptimizedSchedule([worker("unique-worker")], [duplicate, { ...duplicate, startTime: "13:00", endTime: "17:00" }]);

    expect(result.assignments).toHaveLength(0);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues[0].message).toContain("Duplicate shift ID");
  });

  it("clamps and staggers daily roster blocks inside opening hours", () => {
    const workers = Array.from({ length: 4 }, (_, index) => paid(`roster-paid-${index + 1}`));
    const rosterShift = shift("roster-day", {
      startTime: "09:00",
      endTime: "18:00",
      staffingMode: "daily_roster",
      requiredWorkers: 4,
      maxDailyWorkers: 4,
      requiredWorkerHours: 32,
    });

    const result = generateOptimizedSchedule(workers, [rosterShift]);

    expect(result.assignments).toHaveLength(4);
    expect(result.assignments.every((item) => item.startTime >= "09:00" && item.endTime <= "18:00")).toBe(true);
    expect(new Set(result.assignments.map((item) => item.startTime))).toEqual(new Set(["09:00", "10:00"]));
  });
});
