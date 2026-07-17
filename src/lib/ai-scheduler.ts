import OpenAI from "openai";
import { z } from "zod";
import {
  calculateLaborCost,
  calculateWorkerMatchScore,
  generateOptimizedSchedule,
} from "./scheduler";
import type {
  OptimizedScheduleResult,
  ScheduleAssignment,
  ScheduleGenerationSource,
  Shift,
  Worker,
} from "../types";

const proposalSchema = z.object({
  assignments: z.array(
    z.object({
      workerId: z.string(),
      shiftId: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      reason: z.string().optional(),
    }),
  ),
});

export type AiScheduleGeneration = {
  result: OptimizedScheduleResult;
  source: ScheduleGenerationSource;
  warning?: string;
};

type AiProposal = z.infer<typeof proposalSchema>["assignments"][number];

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function emptyScoreBreakdown() {
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

function buildAssignmentsFromProposals(
  proposals: AiProposal[],
  workers: Worker[],
  shifts: Shift[],
) {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const assignments: ScheduleAssignment[] = [];
  const seen = new Set<string>();

  for (const proposal of proposals) {
    const worker = workerById.get(proposal.workerId);
    const shift = shiftById.get(proposal.shiftId);
    if (!worker || !shift || seen.has(`${proposal.workerId}:${proposal.shiftId}`)) continue;

    const startTime = proposal.startTime || shift.startTime;
    const endTime = proposal.endTime || shift.endTime;
    const start = minutes(startTime);
    const end = minutes(endTime);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      start < minutes(shift.startTime) ||
      end > minutes(shift.endTime)
    ) continue;

    const segment = { ...shift, startTime, endTime };
    const evaluation = calculateWorkerMatchScore(worker, segment, assignments, { allShifts: shifts });
    if (!evaluation.eligible) continue;

    seen.add(`${proposal.workerId}:${proposal.shiftId}`);
    assignments.push({
      shiftId: shift.id,
      workerId: worker.id,
      worker,
      shift,
      startTime,
      endTime,
      workerType: worker.workerType,
      matchScore: evaluation.score,
      scoreBreakdown: evaluation.scoreBreakdown ?? emptyScoreBreakdown(),
      estimatedCost: calculateLaborCost(worker, segment),
      reasons: ["Selected by the AI scheduling assistant", ...(proposal.reason ? [proposal.reason] : []), ...evaluation.reasons],
      warnings: evaluation.warnings,
    });
  }

  return assignments;
}

function buildPromptContext(workers: Worker[], shifts: Shift[]) {
  return {
    workers: workers.map((worker) => ({
      id: worker.id,
      name: worker.name,
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
      notes: worker.notes,
    })),
    shifts: shifts.map((shift) => ({
      id: shift.id,
      title: shift.title,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      location: shift.location,
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
      notes: shift.notes,
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
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
    const completion = await client.chat.completions.create(
      {
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the primary scheduling planner for a nonprofit. Build the best possible weekly schedule from the supplied workers and shifts. Return JSON only with an assignments array. Every assignment must use existing workerId and shiftId values and include startTime, endTime, and a short reason. Fill high and urgent work first, distribute hours across the week, honor availability, roles, supervisor requirements, worker type, desired and maximum hours, max shifts, no overlaps, volunteer limits, paid limits, and shift headcount. Never invent people, shifts, qualifications, availability, or hours. It is acceptable to leave a shift uncovered when no valid worker exists. For daily rosters, choose staggered segments inside the shift window. Do not include markdown or any fields other than assignments.",
          },
          { role: "user", content: JSON.stringify(buildPromptContext(workers, shifts)) },
        ],
      },
      { signal: AbortSignal.timeout(20_000) },
    );
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("The scheduling model returned no content.");
    const parsed = proposalSchema.parse(JSON.parse(content));
    const proposedAssignments = buildAssignmentsFromProposals(parsed.assignments, workers, shifts);
    const result = generateOptimizedSchedule({ workers, shifts, assignments: proposedAssignments });
    return { result, source: "openai" };
  } catch {
    return {
      result: deterministic(),
      source: "deterministic",
      warning: "The AI scheduling service was unavailable or returned an unsafe plan, so the deterministic safety scheduler was used.",
    };
  }
}
