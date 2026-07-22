const MODEL_TIMEOUT_MS = 20_000;
const LOCAL_MODEL_TIMEOUT_MS = 180_000;

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

async function requestProposals(workers, shifts, config = {}) {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      source: "deterministic",
      assignments: [],
      warning: "No AI API key is configured for the desktop app, so the deterministic safety scheduler was used.",
    };
  }

  try {
    const baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || "";
    const isLocalProvider = /localhost|127\.0\.0\.1|\[::1\]/i.test(baseUrl);
    const timeoutMs = isLocalProvider ? LOCAL_MODEL_TIMEOUT_MS : MODEL_TIMEOUT_MS;
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl || process.env.OPENAI_BASE_URL || undefined,
    });
    const completion = await client.chat.completions.create(
      {
        model: config.model || process.env.OPENAI_MODEL || "gpt-5.4-mini",
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
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("The scheduling model returned no content.");
    const parsed = JSON.parse(content);
    const workerIds = new Set(workers.map((worker) => worker.id));
    const shiftIds = new Set(shifts.map((shift) => shift.id));
    if (!Array.isArray(parsed.assignments)) throw new Error("The scheduling model returned no assignments.");
    const assignments = parsed.assignments.filter((value) => isProposal(value, workerIds, shiftIds)).slice(0, 10_000);
    const requiredAssignments = shifts.reduce((total, shift) => total + shift.requiredWorkers, 0);
    return {
      source: "openai",
      assignments,
      warning: assignments.length < requiredAssignments
        ? `Ollama returned ${assignments.length} of ${requiredAssignments} requested positions; the deterministic safety pass will repair the remaining coverage.`
        : undefined,
    };
  } catch {
    return {
      source: "deterministic",
      assignments: [],
      warning: "The desktop AI service was unavailable or returned an unsafe plan, so the deterministic safety scheduler was used.",
    };
  }
}

module.exports = { requestProposals };
