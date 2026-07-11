import { describe, expect, it } from "vitest";
import {
  generateOptimizedSchedule,
  getAssignmentDurationHours,
  getCoverageMetrics,
} from "./scheduler";
import { createTestStaff, createTestStaffShifts } from "./sample-data";

describe("test company data", () => {
  it("creates a staggered daily roster with two managers and exact weekly hours", () => {
    const staff = createTestStaff();
    const shifts = createTestStaffShifts();
    const result = generateOptimizedSchedule(staff, shifts);

    expect(staff).toHaveLength(10);
    expect(shifts).toHaveLength(7);
    expect(shifts.every((shift) => shift.startTime === "08:00" && shift.endTime === "18:00")).toBe(true);
    expect(shifts.every((shift) => shift.staffingMode === "daily_roster" && shift.requiredWorkers === 6)).toBe(true);
    expect(shifts.every((shift) => shift.requiredSupervisors === 2 && shift.maxDailyWorkers === 6)).toBe(true);
    expect(getCoverageMetrics(shifts, result.assignments).coverageRate).toBe(100);
    expect(result.uncoveredShifts).toHaveLength(0);
    expect(result.partiallyCoveredShifts).toHaveLength(0);
    expect(result.assignments.every((assignment) => getAssignmentDurationHours(assignment) <= 8)).toBe(true);
    expect(result.shiftRisks.every((risk) => risk.level === "low")).toBe(true);
    expect(shifts.every((shift) => {
      const assigned = result.assignments.filter((assignment) => assignment.shiftId === shift.id);
      return assigned.length === 6 && assigned.filter((assignment) => assignment.workerType === "supervisor").length >= 2;
    })).toBe(true);

    for (const worker of staff) {
      const workerAssignments = result.assignments.filter((assignment) => assignment.workerId === worker.id);
      const assignedHours = workerAssignments.reduce(
        (sum, assignment) => sum + getAssignmentDurationHours(assignment),
        0,
      );
      expect(assignedHours).toBe(worker.desiredHoursPerWeek);
      if (worker.employmentType === "full_time") {
        expect(workerAssignments).toHaveLength(5);
        expect(workerAssignments.every((assignment) => ["08:00-16:00", "10:00-18:00"].includes(`${assignment.startTime}-${assignment.endTime}`))).toBe(true);
      }
      if (worker.employmentType === "part_time") {
        expect(workerAssignments).toHaveLength(5);
        expect(workerAssignments.every((assignment) => assignment.startTime === "08:00" && assignment.endTime === "14:00")).toBe(true);
      }
    }
  });
});
