const MODEL_TIMEOUT_MS = 20_000;

function buildPromptContext(workers, shifts) {
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
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl || process.env.OPENAI_BASE_URL || undefined,
    });
    const completion = await client.chat.completions.create(
      {
        model: config.model || process.env.OPENAI_MODEL || "gpt-5.4-mini",
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
      { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) },
    );
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("The scheduling model returned no content.");
    const parsed = JSON.parse(content);
    const workerIds = new Set(workers.map((worker) => worker.id));
    const shiftIds = new Set(shifts.map((shift) => shift.id));
    if (!Array.isArray(parsed.assignments)) throw new Error("The scheduling model returned no assignments.");
    return {
      source: "openai",
      assignments: parsed.assignments.filter((value) => isProposal(value, workerIds, shiftIds)).slice(0, 10_000),
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
