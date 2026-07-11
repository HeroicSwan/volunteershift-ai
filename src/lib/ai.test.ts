import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAiAssistant, generateFallbackAssistant } from "./ai";
import { generateOptimizedSchedule } from "./scheduler";
import type { AiAssistantInput, Shift, Worker } from "../types";

const worker: Worker = {
  id: "worker-1",
  name: "Jordan Lee",
  email: "jordan@example.org",
  workerType: "volunteer",
  roles: ["Food Service"],
  availability: { Monday: [{ start: "08:00", end: "17:00" }] },
  preferredDays: ["Monday"],
  preferredRoles: ["Food Service"],
  maxShiftsPerWeek: 1,
  desiredHoursPerWeek: 2,
  maxHoursPerWeek: 4,
  notes: "",
};

const shift: Shift = {
  id: "shift-1",
  title: "Community Pantry Morning",
  date: "2026-07-13",
  startTime: "09:00",
  endTime: "12:00",
  location: "Northside Resource Center",
  requiredRole: "Food Service",
  requiredWorkers: 2,
  requiresSupervisor: false,
  priority: "Urgent",
  notes: "",
};

function getInput(overrides: Partial<Worker> = {}): AiAssistantInput {
  const inputWorker = { ...worker, ...overrides };
  const schedule = generateOptimizedSchedule([inputWorker], [shift]);
  return {
    workers: [inputWorker],
    shifts: [shift],
    assignments: schedule.assignments,
    scheduleGeneratedAt: "2026-07-09T12:00:00.000Z",
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("fallback schedule assistant", () => {
  it("explains priority ordering, coverage gaps, overload, and next actions", () => {
    const result = generateFallbackAssistant(getInput());

    expect(result.source).toBe("fallback");
    expect(result.explanation).toContain("urgent or high-priority");
    expect(result.risks.some((risk) => risk.includes("partially covered"))).toBe(true);
    expect(result.risks.some((risk) => risk.includes("hour target"))).toBe(true);
    expect(result.nextActions.some((action) => action.includes("additional worker"))).toBe(true);
  });

  it("creates a complete email and SMS draft for every assigned worker", () => {
    const result = generateFallbackAssistant(getInput());
    const reminder = result.reminders[0];

    expect(result.reminders).toHaveLength(1);
    expect(reminder.emailSubject).toContain("Community Pantry Morning");
    expect(reminder.emailBody).toContain("Thank you for volunteering");
    expect(reminder.emailBody).toContain("Monday, July 13, 2026");
    expect(reminder.emailBody).toContain("9:00 AM–12:00 PM");
    expect(reminder.emailBody).toContain("Northside Resource Center");
    expect(reminder.emailBody).toContain("Role: Food Service");
    expect(reminder.smsBody).toContain("Food Service");
  });

  it("does not thank paid staff for volunteering", () => {
    const result = generateFallbackAssistant(getInput({ workerType: "paid_employee" }));
    const reminder = result.reminders[0];

    expect(reminder.emailBody).not.toContain("volunteering");
    expect(reminder.emailBody).toContain("Role: Food Service");
    expect(reminder.smsBody).toContain("on the team");
  });

  it("uses fallback output when no API key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await generateAiAssistant(getInput());

    expect(result.source).toBe("fallback");
    expect(result.warning).toContain("No API key");
  });
});
