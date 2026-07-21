import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Shift, Worker } from "@/types";

const { createCompletion } = vi.hoisted(() => ({ createCompletion: vi.fn() }));
vi.mock("openai", () => ({ default: class MockOpenAI { chat = { completions: { create: createCompletion } }; } }));

import { generateAiSchedule } from "./ai-scheduler";

const worker: Worker = {
  id: "worker-1", name: "Alex Rivera", email: "alex@example.com", workerType: "volunteer", roles: ["Welcome Desk"],
  availability: { Monday: [{ start: "09:00", end: "12:00" }] }, preferredDays: ["Monday"], preferredRoles: ["Welcome Desk"],
  maxShiftsPerWeek: 1, desiredHoursPerWeek: 3, maxHoursPerWeek: 6, notes: "",
};
const shift: Shift = {
  id: "shift-1", title: "Welcome desk", date: "2026-07-20", startTime: "09:00", endTime: "12:00", location: "Main office",
  requiredRole: "Welcome Desk", requiredWorkers: 1, requiresSupervisor: false, priority: "Normal", notes: "",
};
const proposal = { workerId: worker.id, shiftId: shift.id, startTime: "09:00", endTime: "12:00", reason: "Available and role matched" };

describe("AI schedule provider contract", () => {
  beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-key"); createCompletion.mockReset(); });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a valid schedule response", async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ assignments: [proposal] }) } }] });
    const result = await generateAiSchedule([worker], [shift]);
    expect(result.source).toBe("openai"); expect(result.result.assignments).toHaveLength(1); expect(result.result.validation.valid).toBe(true);
  });

  it("falls back for invalid JSON", async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    const result = await generateAiSchedule([worker], [shift]);
    expect(result.source).toBe("deterministic"); expect(result.warning).toContain("AI scheduling service"); expect(result.result.validation.valid).toBe(true);
  });

  it("rejects hallucinated worker and shift IDs", async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ assignments: [{ ...proposal, workerId: "ghost", shiftId: "missing" }] }) } }] });
    const result = await generateAiSchedule([worker], [shift]);
    expect(result.result.assignments.some((assignment) => assignment.workerId === "ghost" || assignment.shiftId === "missing")).toBe(false);
    expect(result.result.validation.valid).toBe(true);
  });

  it("falls back on provider timeout", async () => {
    createCompletion.mockRejectedValue(new Error("timeout"));
    const result = await generateAiSchedule([worker], [shift]);
    expect(result.source).toBe("deterministic"); expect(result.result.validation.valid).toBe(true);
  });

  it("falls back on provider failure", async () => {
    createCompletion.mockRejectedValue(new Error("service unavailable"));
    const result = await generateAiSchedule([worker], [shift]);
    expect(result.source).toBe("deterministic"); expect(result.warning).toContain("AI scheduling service");
  });

  it("does not retain unsafe overlapping assignments", async () => {
    const secondShift = { ...shift, id: "shift-2", title: "Closing desk", startTime: "11:00", endTime: "14:00" };
    createCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ assignments: [proposal, { ...proposal, shiftId: "shift-2", startTime: "11:00", endTime: "14:00" }] }) } }] });
    const result = await generateAiSchedule([worker], [shift, secondShift]);
    expect(result.result.assignments).toHaveLength(1); expect(result.result.validation.valid).toBe(true);
  });
});

