import OpenAI from "openai";
import {
  generateOptimizedSchedule,
} from "./scheduler";
import { aiProposalSchema, buildScheduleFromAiProposals } from "./ai-schedule-proposals";
import type {
  AiProposalCoverage,
  OptimizedScheduleResult,
  ScheduleGenerationSource,
  Shift,
  Worker,
} from "../types";

export type AiScheduleGeneration = {
  result: OptimizedScheduleResult;
  source: ScheduleGenerationSource;
  warning?: string;
  proposalCoverage?: AiProposalCoverage;
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

const QWEN3_BATCH_SIZE = 4;

function priorityRank(priority: Shift["priority"]) {
  return { Urgent: 4, High: 3, Normal: 2, Low: 1 }[priority];
}

function chunkShifts(shifts: Shift[], size: number) {
  const ordered = [...shifts].sort((a, b) => a.date.localeCompare(b.date) || priorityRank(b.priority) - priorityRank(a.priority));
  const batches: Shift[][] = [];
  for (let index = 0; index < ordered.length; index += size) batches.push(ordered.slice(index, index + size));
  return batches.length ? batches : [[]];
}

function parseProposals(content: string, workers: Worker[], shifts: Shift[]) {
  const parsed = aiProposalSchema.parse(JSON.parse(content));
  const workerIds = new Set(workers.map((worker) => worker.id));
  const shiftIds = new Set(shifts.map((shift) => shift.id));
  return parsed.assignments.filter((proposal) => workerIds.has(proposal.workerId) && shiftIds.has(proposal.shiftId));
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

function dayName(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}

function filterSafeProposals(values: ReturnType<typeof parseProposals>, workers: Worker[], shifts: Shift[], prior: ReturnType<typeof parseProposals>) {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const accepted: typeof values = [];
  const rejected: { workerId?: string; shiftId?: string; reason: string }[] = [];
  const seen = new Set(prior.map((item) => item.workerId + ":" + item.shiftId));
  for (const value of values) {
    const worker = workerById.get(value.workerId);
    const shift = shiftById.get(value.shiftId);
    const reject = (reason: string) => rejected.push({ workerId: value.workerId, shiftId: value.shiftId, reason });
    if (!worker || !shift) { reject("Invalid worker or shift ID."); continue; }
    if (seen.has(value.workerId + ":" + value.shiftId)) { reject("Duplicate worker/shift assignment."); continue; }
    if (minutes(value.startTime) < minutes(shift.startTime) || minutes(value.endTime) > minutes(shift.endTime) || minutes(value.endTime) <= minutes(value.startTime)) { reject("Assignment time is outside the shift window."); continue; }
    if (shift.requiredRole && !worker.roles.some((role) => role.toLowerCase() === shift.requiredRole.toLowerCase())) { reject("Worker does not have the required role."); continue; }
    const blocks = worker.availability[dayName(shift.date) as keyof Worker["availability"]] || [];
    if (!blocks.some((block) => minutes(value.startTime) >= minutes(block.start) && minutes(value.endTime) <= minutes(block.end))) { reject("Worker is unavailable for this time."); continue; }
    const workerPrior = prior.filter((item) => item.workerId === worker.id);
    if (workerPrior.some((item) => minutes(value.startTime) < minutes(item.endTime) && minutes(value.endTime) > minutes(item.startTime))) { reject("Worker overlaps another assignment."); continue; }
    accepted.push(value);
    seen.add(value.workerId + ":" + value.shiftId);
  }
  return { accepted, rejected };
}

function getRelevantWorkers(workers: Worker[], shifts: Shift[]) {
  const roles = new Set(shifts.map((shift) => shift.requiredRole.toLowerCase()));
  const supervisorNeeded = shifts.some((shift) => shift.requiresSupervisor);
  const relevant = workers.filter((worker) =>
    worker.roles.some((role) => roles.has(role.toLowerCase())) ||
    (supervisorNeeded && worker.workerType === "supervisor"),
  );
  return relevant.length ? relevant : workers;
}

export async function generateAiSchedule(workers: Worker[], shifts: Shift[]): Promise<AiScheduleGeneration> {
  const deterministic = () => generateOptimizedSchedule(workers, shifts);
  const requested = shifts.reduce((total, shift) => total + shift.requiredWorkers, 0);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      result: deterministic(),
      source: "deterministic",
      warning: "No AI API key is configured, so the deterministic safety scheduler was used.",
      proposalCoverage: { requested, proposed: 0, coveragePercent: 0, batches: 0, completedBatches: 0, retries: 0 },
    };
  }

  try {
    const baseUrl = process.env.OPENAI_BASE_URL || "";
    const isLocalProvider = /localhost|127\.0\.0\.1|\[::1\]/i.test(baseUrl);
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const isQwen3 = /qwen3/i.test(model);
    const isNvidiaNim = /integrate\.api\.nvidia\.com/i.test(baseUrl) || /nemotron/i.test(model);
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined,
    });
    const batches = isQwen3 ? chunkShifts(shifts, QWEN3_BATCH_SIZE) : [shifts];
    const proposals: ReturnType<typeof parseProposals> = [];
    const rejected: { workerId?: string; shiftId?: string; reason: string }[] = [];
    const failedBatches: string[] = [];
    let completedBatches = 0;
    let retries = 0;
    for (const batch of batches) {
      const batchRequired = batch.reduce((total, shift) => total + shift.requiredWorkers, 0);
      let batchProposals: ReturnType<typeof parseProposals> = [];
      let batchRejected: { workerId?: string; shiftId?: string; reason: string }[] = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const completion = await client.chat.completions.create(
            {
              model,
              temperature: 0,
              ...(isQwen3 ? { max_tokens: 2048 } : {}),
              ...(isNvidiaNim ? { max_tokens: 4096 } : {}),
              ...(isLocalProvider ? { think: false } : {}),
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: [
                    isQwen3 ? "Plan one small batch of a weekly roster." : "Plan this roster.",
                    "Return compact JSON only: {\"assignments\":[...]}. Use only supplied IDs.",
                    "Each item needs workerId, shiftId, startTime, endTime, and optional reason.",
                    "Respect availability, roles, supervisors, worker type, weekly limits, no overlaps, and headcount.",
                    "Never invent IDs; leave impossible work uncovered. No markdown.",
                    attempt ? "REPAIR: return valid assignments for every feasible position in this batch." : "",
                  ].filter(Boolean).join(" "),
                },
                { role: "user", content: JSON.stringify({ ...buildPromptContext(getRelevantWorkers(workers, batch), batch), priorAssignments: proposals, rejectedProposals: batchRejected }) },
              ],
            },
            { signal: AbortSignal.timeout(isLocalProvider ? 600_000 : isNvidiaNim ? 180_000 : 20_000) },
          );
          const content = completion.choices[0]?.message.content;
          if (!content) throw new Error("The scheduling model returned no content.");
          const parsedProposals = parseProposals(content, workers, batch);
          const filtered = filterSafeProposals(parsedProposals, workers, batch, proposals);
          batchProposals = filtered.accepted;
          batchRejected = filtered.rejected;
          if (batchProposals.length >= batchRequired || attempt === 1) break;
          retries += 1;
        } catch {
          if (attempt === 0) { retries += 1; continue; }
          failedBatches.push(batch[0]?.date ?? "unknown");
        }
      }
      if (!isQwen3 && batchProposals.length === 0) throw new Error("The scheduling model returned no safe proposals.");
      if (batchProposals.length > 0) completedBatches += 1;
      rejected.push(...batchRejected);
      for (const proposal of batchProposals) {
        if (!proposals.some((item) => item.workerId === proposal.workerId && item.shiftId === proposal.shiftId)) proposals.push(proposal);
      }
    }
    const result = buildScheduleFromAiProposals(proposals, workers, shifts);
    const coveragePercent = requested ? Math.round((proposals.length / requested) * 100) : 100;
    return {
      result,
      source: "openai",
      proposalCoverage: { requested, proposed: proposals.length, coveragePercent, batches: batches.length, completedBatches, retries, rejected: rejected.length, repairNeeded: Math.max(0, requested - proposals.length) },
      warning: proposals.length < requested || failedBatches.length
        ? "AI proposed " + proposals.length + " of " + requested + " positions across " + batches.length + " " + (isQwen3 ? "qwen3 batches" : "request") + "; the deterministic safety pass repaired the remainder." + (failedBatches.length ? " Failed batches: " + failedBatches.join(", ") + "." : "")
        : undefined,
    };
  } catch {
    return {
      result: deterministic(),
      source: "deterministic",
      warning: "The AI scheduling service was unavailable or returned an unsafe plan, so the deterministic safety scheduler was used.",
      proposalCoverage: { requested, proposed: 0, coveragePercent: 0, batches: 0, completedBatches: 0, retries: 0 },
    };
  }
}
