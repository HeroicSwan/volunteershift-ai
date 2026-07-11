import { describe, expect, it } from "vitest";
import {
  buildShiftsTemplate,
  buildWorkersTemplate,
  parseCsv,
  parseShiftsCsv,
  parseWorkersCsv,
  scheduleToCsv,
  shiftsToCsv,
  toCsv,
  workersToCsv,
} from "./csv";
import type { ScheduleAssignment, Shift, Worker } from "../types";

const worker: Worker = {
  id: "worker-1",
  name: "Jordan Lee",
  email: "jordan@example.org",
  phone: "(555) 014-2210",
  workerType: "paid_employee",
  roles: ["Food Service", "Welcome Desk"],
  availability: {
    Monday: [{ start: "08:00", end: "12:00" }],
    Thursday: [{ start: "12:00", end: "17:00" }],
  },
  preferredDays: ["Monday"],
  preferredRoles: ["Food Service"],
  maxShiftsPerWeek: 2,
  desiredHoursPerWeek: 16,
  maxHoursPerWeek: 24,
  employmentType: "full_time",
  hourlyRate: 18.5,
  reliabilityScore: 4,
  notes: 'Prefers "morning" shifts, if possible.',
};

const shift: Shift = {
  id: "shift-1",
  title: "Pantry Support",
  date: "2026-07-13",
  startTime: "09:00",
  endTime: "12:00",
  location: "Community Center",
  requiredRole: "Food Service",
  requiredWorkers: 2,
  requiresSupervisor: true,
  minPaidStaff: 1,
  maxPaidStaff: 2,
  priority: "High",
  notes: "",
};

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, and newlines inside quotes", () => {
    const rows = parseCsv('a,"b,c","say ""hi""","line1\nline2"\r\nd,e,f,g');

    expect(rows[0]).toEqual(["a", "b,c", 'say "hi"', "line1\nline2"]);
    expect(rows[1]).toEqual(["d", "e", "f", "g"]);
  });

  it("strips a leading byte-order mark", () => {
    expect(parseCsv(`${String.fromCharCode(0xfeff)}name\nJordan`)[0]).toEqual(["name"]);
  });
});

describe("toCsv", () => {
  it("escapes cells containing commas, quotes, and newlines", () => {
    const csv = toCsv([["plain", "with,comma", 'with "quote"', "with\nnewline"]]);

    expect(csv).toBe('plain,"with,comma","with ""quote""","with\nnewline"');
    expect(parseCsv(csv)[0]).toEqual(["plain", "with,comma", 'with "quote"', "with\nnewline"]);
  });
});

describe("parseWorkersCsv", () => {
  it("parses the sample template without errors", () => {
    const result = parseWorkersCsv(buildWorkersTemplate());

    expect(result.fileError).toBeUndefined();
    expect(result.rowErrors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.workerType)).toEqual(["volunteer", "paid_employee", "supervisor"]);
    expect(result.rows[1].hourlyRate).toBe(19.5);
    expect(result.rows[2].reliabilityScore).toBe(5);
    expect(result.rows[0].availability.Monday).toEqual([
      { start: "08:00", end: "12:00" },
      { start: "12:00", end: "17:00" },
    ]);
  });

  it("round-trips an exported worker", () => {
    const result = parseWorkersCsv(workersToCsv([worker]));

    expect(result.rowErrors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      name: worker.name,
      email: worker.email,
      phone: worker.phone,
      workerType: worker.workerType,
      roles: worker.roles,
      preferredDays: worker.preferredDays,
      preferredRoles: worker.preferredRoles,
      maxShiftsPerWeek: worker.maxShiftsPerWeek,
      desiredHoursPerWeek: worker.desiredHoursPerWeek,
      maxHoursPerWeek: worker.maxHoursPerWeek,
      hourlyRate: worker.hourlyRate,
      reliabilityScore: worker.reliabilityScore,
      notes: worker.notes,
    });
    expect(Object.keys(result.rows[0].availability)).toEqual(["Monday", "Thursday"]);
  });

  it("imports pre-upgrade CSV files without the new columns as volunteers", () => {
    const csv = [
      "name,email,phone,roles,availableDays,availableTimeBlocks,preferredDays,preferredRoles,maxShiftsPerWeek,notes",
      "Jordan Lee,jordan@example.org,,Food Service,Monday,Morning,,,2,",
    ].join("\n");
    const result = parseWorkersCsv(csv);

    expect(result.fileError).toBeUndefined();
    expect(result.rowErrors).toEqual([]);
    expect(result.rows[0].workerType).toBe("volunteer");
    expect(result.rows[0].hourlyRate).toBeUndefined();
    expect(result.rows[0].reliabilityScore).toBeUndefined();
  });

  it("accepts friendly worker type spellings", () => {
    const csv = [
      "name,email,phone,workerType,roles,availableDays,availableTimeBlocks,preferredDays,preferredRoles,maxShiftsPerWeek,notes",
      "A,a@example.org,,paid employee,Driver,Monday,Morning,,,2,",
      "B,b@example.org,,Supervisor / Lead,Driver,Monday,Morning,,,2,",
      "C,c@example.org,,VOLUNTEER,Driver,Monday,Morning,,,2,",
    ].join("\n");
    const result = parseWorkersCsv(csv);

    expect(result.rowErrors).toEqual([]);
    expect(result.rows.map((row) => row.workerType)).toEqual(["paid_employee", "supervisor", "volunteer"]);
  });

  it("reports row numbers and clear messages for invalid rows", () => {
    const csv = [
      "name,email,phone,workerType,roles,availableDays,availableTimeBlocks,preferredDays,preferredRoles,maxShiftsPerWeek,hourlyRate,reliabilityScore,notes",
      "Jordan Lee,not-an-email,,intern,Food Service,Mondey,Morning,,,2,,,",
      "Maya Thompson,maya@example.org,,volunteer,Driver,Saturday,Morning,,Welcome Desk,20,abc,9,",
      ",valid@example.org,,volunteer,Driver,Saturday,Morning,,,2,,,",
    ].join("\n");
    const result = parseWorkersCsv(csv);

    expect(result.rows).toEqual([]);
    expect(result.rowErrors).toEqual([
      {
        row: 2,
        messages: [
          '"not-an-email" is not a valid email address.',
          '"intern" is not a valid worker type. Use Volunteer, Paid Employee, or Supervisor.',
          '"Mondey" is not a valid day. Use full day names like Monday.',
        ],
      },
      {
        row: 3,
        messages: [
          'Preferred role "Welcome Desk" is not listed in roles.',
          "Max shifts per week must be a whole number between 1 and 14.",
          '"abc" is not a valid hourly rate. Use a number like 18.50.',
          '"9" is not a valid reliability score. Use a number from 1 to 5.',
        ],
      },
      { row: 4, messages: ["Name is required."] },
    ]);
  });

  it("rejects files with missing columns", () => {
    const result = parseWorkersCsv("name,email\nJordan,jordan@example.org");

    expect(result.fileError).toContain("Missing required columns");
    expect(result.fileError).toContain("roles");
  });
});

describe("parseShiftsCsv", () => {
  it("parses the sample template without errors", () => {
    const result = parseShiftsCsv(buildShiftsTemplate());

    expect(result.fileError).toBeUndefined();
    expect(result.rowErrors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].requiresSupervisor).toBe(false);
    expect(result.rows[1]).toMatchObject({ requiresSupervisor: true, minPaidStaff: 1, maxPaidStaff: 2 });
  });

  it("round-trips an exported shift", () => {
    const result = parseShiftsCsv(shiftsToCsv([shift]));

    expect(result.rowErrors).toEqual([]);
    expect(result.rows[0]).toEqual({
      title: shift.title,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      location: shift.location,
      requiredRole: shift.requiredRole,
      requiredWorkers: shift.requiredWorkers,
      requiresSupervisor: shift.requiresSupervisor,
      staffingMode: "continuous",
      requiredSupervisors: 1,
      maxDailyWorkers: undefined,
      requiredWorkerHours: undefined,
      minPaidStaff: shift.minPaidStaff,
      maxPaidStaff: shift.maxPaidStaff,
      priority: shift.priority,
      notes: shift.notes,
    });
  });

  it("accepts pre-upgrade files using requiredVolunteers and no staffing columns", () => {
    const csv = [
      "title,date,startTime,endTime,location,requiredRole,requiredVolunteers,priority,notes",
      "Pantry,7/13/2026,9:00 AM,1:30 pm,Community Center,Food Service,2,medium,",
    ].join("\n");
    const result = parseShiftsCsv(csv);

    expect(result.rowErrors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      date: "2026-07-13",
      startTime: "09:00",
      endTime: "13:30",
      requiredWorkers: 2,
      requiresSupervisor: false,
      priority: "Normal",
    });
    expect(result.rows[0].minPaidStaff).toBeUndefined();
  });

  it("validates staffing rules against workers needed", () => {
    const csv = [
      "title,date,startTime,endTime,location,requiredRole,requiredWorkers,requiresSupervisor,minPaidStaff,maxPaidStaff,priority,notes",
      "Pantry,2026-07-13,09:00,12:00,Community Center,Food Service,2,maybe,3,1,High,",
    ].join("\n");
    const result = parseShiftsCsv(csv);

    expect(result.rows).toEqual([]);
    expect(result.rowErrors[0].messages).toEqual([
      '"maybe" is not a valid requires-supervisor value. Use yes or no.',
      "Minimum paid staff cannot exceed the workers needed.",
      "Minimum paid staff cannot exceed the maximum paid staff.",
    ]);
  });

  it("reports invalid dates, reversed times, and bad priorities", () => {
    const csv = [
      "title,date,startTime,endTime,location,requiredRole,requiredWorkers,priority,notes",
      "Pantry,2026-02-30,14:00,12:00,Community Center,Food Service,2,ASAP,",
    ].join("\n");
    const result = parseShiftsCsv(csv);

    expect(result.rows).toEqual([]);
    expect(result.rowErrors[0].messages).toEqual([
      '"2026-02-30" is not a valid date. Use YYYY-MM-DD.',
      "End time must be after the start time.",
      '"ASAP" is not a valid priority. Use Low, Normal, High, or Urgent.',
    ]);
  });
});

describe("scheduleToCsv", () => {
  it("exports one sorted row per assignment with coordinator-ready details", () => {
    const later: ScheduleAssignment = {
      shiftId: shift.id,
      workerId: worker.id,
      worker,
      shift: { ...shift, id: "shift-2", startTime: "13:00", endTime: "16:00" },
      startTime: "13:30",
      endTime: "16:00",
      workerType: worker.workerType,
      matchScore: 88,
      scoreBreakdown: {
        base: 88,
        preferredDay: 0,
        preferredRole: 0,
        reliability: 0,
        workerTypeFit: 0,
        employmentFit: 0,
        fairnessPenalty: 0,
        consecutiveDayPenalty: 0,
        laborCostPenalty: 0,
        roleMismatchPenalty: 0,
        total: 88,
      },
      reasons: ["Available Monday", "Role matches"],
      warnings: ["Near weekly limit"],
    };
    const earlier: ScheduleAssignment = {
      ...later,
      shift,
      startTime: "09:30",
      endTime: "11:30",
      matchScore: 95,
      warnings: [],
    };
    const rows = parseCsv(scheduleToCsv([later, earlier]));

    expect(rows[0]).toEqual([
      "date",
      "startTime",
      "endTime",
      "shiftTitle",
      "location",
      "requiredRole",
      "volunteerName",
      "volunteerEmail",
      "matchScore",
      "reasons",
      "warnings",
    ]);
    expect(rows[1]).toEqual([
      "2026-07-13",
      "09:30",
      "11:30",
      "Pantry Support",
      "Community Center",
      "Food Service",
      "Jordan Lee",
      "jordan@example.org",
      "95",
      "Available Monday; Role matches",
      "",
    ]);
    expect(rows[2][1]).toBe("13:30");
    expect(rows[2][10]).toBe("Near weekly limit");
  });
});
