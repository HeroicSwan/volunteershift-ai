import OpenAI from "openai";
import {
  generateOptimizedSchedule,
} from "./scheduler";
import { aiProposalSchema, buildScheduleFromAiProposals } from "./ai-schedule-proposals";
import type {
  OptimizedScheduleResult,
  ScheduleGenerationSource,
  Shift,
  Worker,
} from "../types";

export type AiScheduleGeneration = {
  result: OptimizedScheduleResult;
  source: ScheduleGenerationSource;
  warning?: string;
};

function buildPromptContext(workers: Worker[], shifts: Shift[]) {
  return {
    workers: workers.map((worker) => ({
      id: worker.id,
      workerType: worker.workerType,
      employmentType: worker.employmentType,
      roles: worker.roles,
      availability: worker.availability,
      preferredDays: worker.preferredDays,
      preferredRoles: worker.preferredRoles,
      desiredHoursPerWeek: worker.desiredHoursPerWeek,
      maxHoursPerWeek: worker.maxHoursPerWeek,
      maxShiftsPerWeek: worker.maxShiftsPerWeek,
      reliabilityScore: worker.reliabilityScore,
    })),
    shifts: shifts.map((shift) => ({
      id: shift.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      requiredRole: shift.requiredRole,
      requiredWorkers: shift.requiredWorkers,
      requiresSupervisor: shift.requiresSupervisor,
      requiredSupervisors: shift.requiredSupervisors,
      staffingMode: shift.staffingMode,
      maxDailyWorkers: shift.maxDailyWorkers,
      requiredWorkerHours: shift.requiredWorkerHours,
      minPaidStaff: shift.minPaidStaff,
      maxPaidStaff: shift.maxPaidStaff,
      priority: shift.priority,
    })),
  };
}

export async function generateAiSchedule(workers: Worker[], shifts: Shift[]): Promise<AiScheduleGeneration> {
  const deterministic = () => generateOptimizedSchedule(workers, shifts);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      result: deterministic(),
      source: "deterministic",
      warning: "No AI API key is configured, so the deterministic safety scheduler was used.",
    };
  }

  try {
    const baseUrl = process.env.OPENAI_BASE_URL || "";
    const isLocalProvider = /localhost|127\.0\.0\.1|\[::1\]/i.test(baseUrl);
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined,
    });
    const completion = await client.chat.completions.create(
      {
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        ...(isLocalProvider ? { think: false } : {}),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return compact JSON only with an assignments array. Use only supplied workerId and shiftId values. Include startTime, endTime, and a short reason. Prioritize urgent/high shifts, availability, roles, supervisors, worker type, weekly limits, no overlaps, and headcount. For daily rosters, use staggered segments within the shift window. Never invent IDs or facts; leave impossible work uncovered. No markdown or extra fields.",
          },
          { role: "user", content: JSON.stringify(buildPromptContext(workers, shifts)) },
        ],
      },
      { signal: AbortSignal.timeout(isLocalProvider ? 180_000 : 20_000) },
    );
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("The scheduling model returned no content.");
    const parsed = aiProposalSchema.parse(JSON.parse(content));
    const result = buildScheduleFromAiProposals(parsed.assignments, workers, shifts);
    const requiredAssignments = shifts.reduce((total, shift) => total + shift.requiredWorkers, 0);
    return {
      result,
      source: "openai",
      warning: parsed.assignments.length < requiredAssignments
        ? `AI returned ${parsed.assignments.length} of ${requiredAssignments} requested positions; the deterministic safety pass repaired the remaining coverage.`
        : undefined,
    };
  } catch {
    return {
      result: deterministic(),
      source: "deterministic",
      warning: "The AI scheduling service was unavailable or returned an unsafe plan, so the deterministic safety scheduler was used.",
    };
  }
}
