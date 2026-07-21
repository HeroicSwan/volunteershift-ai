import { z } from "zod";
import {
  calculateLaborCost,
  calculateWorkerMatchScore,
  generateOptimizedSchedule,
} from "./scheduler";
import type {
  OptimizedScheduleResult,
  ScheduleAssignment,
  Shift,
  Worker,
} from "../types";

export const aiProposalSchema = z.object({
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

export type AiScheduleProposal = z.infer<typeof aiProposalSchema>["assignments"][number];

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

export function buildScheduleFromAiProposals(
  proposals: AiScheduleProposal[],
  workers: Worker[],
  shifts: Shift[],
): OptimizedScheduleResult {
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

  // The production engine performs the final coverage, repair, and quality pass
  // using the safe AI proposals as a starting point.
  return generateOptimizedSchedule({ workers, shifts, assignments });
}
