const MODEL_TIMEOUT_MS = 20_000;
const LOCAL_MODEL_TIMEOUT_MS = 600_000;
const NIM_TIMEOUT_MS = 600_000;
const QWEN3_BATCH_SIZE = 4;

function buildPromptContext(workers, shifts) {
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

function isProposal(value, workerIds, shiftIds) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.workerId === "string" &&
    workerIds.has(value.workerId) &&
    typeof value.shiftId === "string" &&
    shiftIds.has(value.shiftId) &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string" &&
    (value.reason === undefined || typeof value.reason === "string"),
  );
}

function getRelevantWorkers(workers, shifts) {
  const roles = new Set(shifts.map((shift) => shift.requiredRole.toLowerCase()));
  const supervisorNeeded = shifts.some((shift) => shift.requiresSupervisor);
  const relevant = workers.filter((worker) =>
    worker.roles.some((role) => roles.has(role.toLowerCase())) ||
    (supervisorNeeded && worker.workerType === "supervisor"),
  );
  return relevant.length ? relevant : workers;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function minutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}
function dayName(date) {
  const parsed = new Date(String(date) + "T12:00:00Z");
  return Number.isNaN(parsed.getTime()) ? "" : DAY_NAMES[parsed.getUTCDay()];
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return minutes(aStart) < minutes(bEnd) && minutes(aEnd) > minutes(bStart);
}
function filterProposals(values, workers, shifts, priorAssignments) {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const accepted = [];
  const rejected = [];
  const seen = new Set(priorAssignments.map((item) => item.workerId + ":" + item.shiftId));
  for (const value of values) {
    const worker = workerById.get(value?.workerId);
    const shift = shiftById.get(value?.shiftId);
    const reject = (reason) => rejected.push({ workerId: value?.workerId, shiftId: value?.shiftId, reason });
    if (!isProposal(value, new Set(workerById.keys()), new Set(shiftById.keys()))) { reject("Invalid or hallucinated worker/shift ID."); continue; }
    if (seen.has(value.workerId + ":" + value.shiftId)) { reject("Duplicate worker/shift assignment."); continue; }
    if (minutes(value.startTime) < minutes(shift.startTime) || minutes(value.endTime) > minutes(shift.endTime) || minutes(value.endTime) <= minutes(value.startTime)) { reject("Assignment time is outside the shift window."); continue; }
    if (shift.requiredRole && !worker.roles.some((role) => role.toLowerCase() === shift.requiredRole.toLowerCase())) { reject("Worker does not have the required role."); continue; }
    const blocks = worker.availability?.[dayName(shift.date)] || [];
    if (!blocks.some((block) => minutes(value.startTime) >= minutes(block.start) && minutes(value.endTime) <= minutes(block.end))) { reject("Worker is unavailable for this time."); continue; }
    const workerAssignments = priorAssignments.filter((item) => item.workerId === worker.id).concat(accepted.filter((item) => item.workerId === worker.id));
    if (workerAssignments.some((item) => item.shiftId !== shift.id && overlaps(value.startTime, value.endTime, item.startTime, item.endTime))) { reject("Worker overlaps another assignment."); continue; }
    const weekHours = workerAssignments.filter((item) => item.shift?.date?.slice(0, 7) === shift.date.slice(0, 7)).reduce((sum, item) => sum + (minutes(item.endTime) - minutes(item.startTime)) / 60, 0);
    const proposedHours = (minutes(value.endTime) - minutes(value.startTime)) / 60;
    if (worker.maxHoursPerWeek !== undefined && weekHours + proposedHours > worker.maxHoursPerWeek) { reject("Worker would exceed the weekly hour limit."); continue; }
    accepted.push({ ...value, shift, worker });
    seen.add(value.workerId + ":" + value.shiftId);
  }
  return { accepted, rejected };
}

function planningState(assignments) {
  return assignments.map((item) => ({ workerId: item.workerId, shiftId: item.shiftId, startTime: item.startTime, endTime: item.endTime, shift: item.shift }));
}

async function requestProposals(workers, shifts, config = {}) {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const requiredAssignments = shifts.reduce((total, shift) => total + shift.requiredWorkers, 0);
  if (!apiKey) {
    return {
      source: "deterministic",
      assignments: [],
      proposalCoverage: { requested: requiredAssignments, proposed: 0, coveragePercent: 0, batches: 0, completedBatches: 0, retries: 0 },
      warning: "No AI API key is configured for the desktop app, so the deterministic safety scheduler was used.",
    };
  }

  try {
    const baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || "";
    const isLocalProvider = /localhost|127\.0\.0\.1|\[::1\]/i.test(baseUrl);
    const model = config.model || process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const isQwen3 = /qwen3/i.test(model);
    const isNvidiaNim = /integrate\.api\.nvidia\.com/i.test(baseUrl) || /nemotron/i.test(model);
    const timeoutMs = isLocalProvider ? LOCAL_MODEL_TIMEOUT_MS : isNvidiaNim ? NIM_TIMEOUT_MS : MODEL_TIMEOUT_MS;
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl || process.env.OPENAI_BASE_URL || undefined,
    });
    const batches = isQwen3 ? chunkShifts(shifts, QWEN3_BATCH_SIZE) : [shifts];
    const assignments = [];
    const rejected = [];
    let completedBatches = 0;
    let retries = 0;
    const warnings = [];

    for (const batch of batches) {
      config.onProgress?.({ current: completedBatches + 1, total: batches.length, requested: requiredAssignments, proposed: assignments.length, status: "running" });
      const batchRequired = batch.reduce((total, shift) => total + shift.requiredWorkers, 0);
      let batchAssignments = [];
      let batchRejected = [];
      let lastError;
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
                  content: `${isQwen3 ? "You are planning one small batch of a weekly roster. " : ""}Return compact JSON only: {\"assignments\":[...]}. Use only supplied IDs. Each item needs workerId, shiftId, startTime, endTime, and optional reason. Respect availability, roles, supervisors, worker type, weekly limits, no overlaps, and headcount. Use staggered segments inside each shift. Never invent IDs; leave impossible work uncovered. No markdown. ${attempt ? "REPAIR: return valid assignments for every feasible position in this batch and nothing else." : ""}`,
                },
                { role: "user", content: JSON.stringify({ ...buildPromptContext(getRelevantWorkers(workers, batch), batch), priorAssignments: planningState(assignments), rejectedProposals: batchRejected }) },
              ],
            },
            { signal: config.signal ? AbortSignal.any([config.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) },
          );
          const content = completion.choices[0]?.message.content;
          if (!content) throw new Error("The scheduling model returned no content.");
          const parsed = JSON.parse(content);
          if (!Array.isArray(parsed.assignments)) throw new Error("The scheduling model returned no assignments.");
          const filtered = filterProposals(parsed.assignments, workers, batch, assignments);
          batchAssignments = filtered.accepted;
          batchRejected = filtered.rejected;
          if (batchAssignments.length >= batchRequired || attempt === 1) break;
          retries += 1;
        } catch (error) {
          lastError = error;
          if (config.signal?.aborted) throw error;
          if (attempt === 0) { retries += 1; continue; }
        }
      }
      if (lastError && batchAssignments.length === 0) warnings.push(`Batch ${batch[0]?.date ?? "unknown"} failed: ${lastError.message}`);
      if (batchAssignments.length > 0) completedBatches += 1;
      rejected.push(...batchRejected);
      config.onProgress?.({ current: completedBatches, total: batches.length, requested: requiredAssignments, proposed: assignments.length + batchAssignments.length, status: "batch-complete" });
      for (const assignment of batchAssignments) {
        const key = `${assignment.workerId}:${assignment.shiftId}`;
        if (!assignments.some((item) => `${item.workerId}:${item.shiftId}` === key)) assignments.push(assignment);
      }
    }
    const coveragePercent = requiredAssignments ? Math.round((assignments.length / requiredAssignments) * 100) : 100;
    return {
      source: "openai",
      assignments,
      proposalCoverage: { requested: requiredAssignments, proposed: assignments.length, coveragePercent, batches: batches.length, completedBatches, retries, rejected: rejected.length, repairNeeded: Math.max(0, requiredAssignments - assignments.length) },
      warning: assignments.length < requiredAssignments || warnings.length
        ? (isNvidiaNim ? "NVIDIA NIM" : isLocalProvider ? "Ollama" : "AI provider") + " proposed " + assignments.length + " of " + requiredAssignments + " positions across " + batches.length + " " + (isQwen3 ? "qwen3 batches" : "request") + "; the deterministic safety pass will repair the remainder." + (warnings.length ? " " + warnings.join(" ") : "")
        : undefined,
    };
  } catch (error) {
    if (error?.name === "AbortError" || config.signal?.aborted) {
      return {
        source: "deterministic",
        assignments: [],
        proposalCoverage: { requested: requiredAssignments, proposed: 0, coveragePercent: 0, batches: 0, completedBatches: 0, retries: 0 },
        cancelled: true,
        warning: "AI planning was canceled. The deterministic safety scheduler was used instead.",
      };
    }
    return {
      source: "deterministic",
      assignments: [],
      proposalCoverage: { requested: requiredAssignments, proposed: 0, coveragePercent: 0, batches: 0, completedBatches: 0, retries: 0 },
      warning: "The desktop AI service was unavailable or returned an unsafe plan, so the deterministic safety scheduler was used.",
    };
  }
}

function chunkShifts(shifts, size) {
  const ordered = [...shifts].sort((a, b) => a.date.localeCompare(b.date) || priorityRank(b.priority) - priorityRank(a.priority));
  const batches = [];
  for (let index = 0; index < ordered.length; index += size) batches.push(ordered.slice(index, index + size));
  return batches.length ? batches : [[]];
}

function priorityRank(priority) {
  return { Urgent: 4, High: 3, Normal: 2, Low: 1 }[priority] || 0;
}

module.exports = { requestProposals };
