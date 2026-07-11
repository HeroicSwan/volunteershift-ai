import { getCoverageMetrics, getFairnessStats, getShiftMinimumCoverage, getUncoveredShifts } from "./scheduler";
import type { AiAssistantInput, AiAssistantResult, ReminderDraft, ScheduleAssignment, Shift } from "../types";

// Deterministic, offline schedule assistant. Pure TypeScript with no network or
// SDK dependencies, so it runs on the server, in the browser, and in the
// packaged desktop app alike. The optional OpenAI-backed variant lives in
// ai.ts and reuses this as its fallback.

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function assignmentCount(shift: Shift, assignments: ScheduleAssignment[]) {
  return getShiftMinimumCoverage(shift, assignments);
}

function buildReminderDrafts(input: AiAssistantInput): ReminderDraft[] {
  const assignedWorkerIds = [...new Set(input.assignments.map((assignment) => assignment.workerId))];

  return assignedWorkerIds.flatMap((workerId) => {
    const worker = input.workers.find((item) => item.id === workerId);
    if (!worker) return [];

    const assignments = input.assignments
      .filter((assignment) => assignment.workerId === workerId)
      .sort(
        (a, b) =>
          a.shift.date.localeCompare(b.shift.date) ||
          a.startTime.localeCompare(b.startTime),
      );
    const details = assignments
      .map(
        (assignment) =>
          [
            assignment.shift.title,
            `Date: ${formatDate(assignment.shift.date)}`,
            `Time: ${formatTime(assignment.startTime)}–${formatTime(assignment.endTime)}`,
            `Location: ${assignment.shift.location}`,
            `Role: ${assignment.shift.requiredRole}`,
          ].join("\n"),
      )
      .join("\n\n");
    const smsDetails = assignments
      .map(
        (assignment) =>
          `${assignment.shift.title} on ${formatShortDate(assignment.shift.date)}, ${formatTime(assignment.startTime)}–${formatTime(assignment.endTime)} at ${assignment.shift.location} (${assignment.shift.requiredRole})`,
      )
      .join("; ");
    const isVolunteer = worker.workerType === "volunteer";
    const opener = isVolunteer
      ? "Thank you for volunteering with us. Here are your upcoming assignment details:"
      : "Here are your upcoming shift details:";
    const closer = isVolunteer
      ? "Please reply to confirm that these details still work for you. We’re grateful for your time and support."
      : "Please reply to confirm that these details still work for you. Thank you for all you do for our team.";
    const smsThanks = isVolunteer ? "thank you for volunteering!" : "thank you for being on the team!";

    return [
      {
        workerId,
        workerName: worker.name,
        email: worker.email,
        emailSubject:
          assignments.length === 1
            ? `Shift reminder: ${assignments[0].shift.title}`
            : "Your upcoming shift schedule",
        emailBody: [
          `Hi ${worker.name.split(" ")[0]},`,
          "",
          opener,
          "",
          details,
          "",
          closer,
          "",
          "Warmly,",
          "Scheduling Team",
        ].join("\n"),
        smsBody: `Hi ${worker.name.split(" ")[0]}—${smsThanks} Reminder: ${smsDetails}. Please reply to confirm.`,
      },
    ];
  });
}

function getWeakRoles(input: AiAssistantInput) {
  const roles = [...new Set(input.shifts.map((shift) => shift.requiredRole))];
  return roles.flatMap((role) => {
    const roleShifts = input.shifts.filter((shift) => shift.requiredRole === role);
    const metrics = getCoverageMetrics(roleShifts, input.assignments);
    const required = metrics.requiredWorkerHours;
    const assigned = metrics.coveredWorkerHours;
    const coverage = metrics.coverageRate / 100;
    return coverage < 0.75 ? [{ role, assigned, required }] : [];
  });
}

export function generateFallbackAssistant(
  input: AiAssistantInput,
  warning = "No API key is configured, so the built-in schedule assistant was used.",
): AiAssistantResult {
  const gaps = getUncoveredShifts(input.shifts, input.assignments);
  const uncovered = gaps.filter((gap) => gap.status === "uncovered");
  const partial = gaps.filter((gap) => gap.status === "partial");
  const priorityShifts = input.shifts.filter(
    (shift) => shift.priority === "Urgent" || shift.priority === "High",
  );
  const filledPriorityShifts = priorityShifts.filter(
    (shift) => assignmentCount(shift, input.assignments) >= shift.requiredWorkers,
  );
  const weakRoles = getWeakRoles(input);
  const fairness = getFairnessStats(input.workers, input.assignments);
  const overloadedStats = fairness.workers.filter(
    (stat) => stat.assignedHours > stat.desiredHoursPerWeek,
  );
  const coverage = getCoverageMetrics(input.shifts, input.assignments);

  const risks = [
    ...uncovered.map(
      (gap) =>
        `${gap.shift.title} is uncovered and still needs ${gap.missingWorkers} ${gap.shift.requiredRole} worker${gap.missingWorkers === 1 ? "" : "s"}.`,
    ),
    ...partial.map(
      (gap) =>
        `${gap.shift.title} is partially covered at ${gap.assignedCount} of ${gap.requiredCount} spots.`,
    ),
    ...overloadedStats.map(
      (stat) =>
        `${stat.worker.name} is scheduled above their ${stat.desiredHoursPerWeek}-hour target, but remains below their ${stat.maxHoursPerWeek}-hour hard limit.`,
    ),
    ...weakRoles.map(
      ({ role, assigned, required }) =>
        `${role} has weak coverage with ${assigned} of ${required} worker-hours covered.`,
    ),
  ];

  const nextActions = [
    ...uncovered.map(
      (gap) =>
        `Contact qualified ${gap.shift.requiredRole} workers for ${gap.shift.title} before lower-priority outreach.`,
    ),
    ...partial.map(
      (gap) =>
        `Find ${gap.missingWorkers} additional worker${gap.missingWorkers === 1 ? "" : "s"} for ${gap.shift.title}.`,
    ),
    ...overloadedStats.map(
      (stat) =>
        `Review ${stat.worker.name}’s schedule and move hours to someone below their desired target if possible.`,
    ),
    ...weakRoles.map(
      ({ role }) => `Recruit or cross-train additional workers for the ${role} role.`,
    ),
    "Review and personalize each reminder draft before sending it through your usual communication tools.",
  ];

  return {
    explanation: [
      `The scheduler evaluated ${priorityShifts.length} urgent or high-priority shift${priorityShifts.length === 1 ? "" : "s"} before normal and low-priority work, and fully covered ${filledPriorityShifts.length} of them.`,
      `Overall, ${coverage.coveredWorkerHours} of ${coverage.requiredWorkerHours} worker-hours were covered for ${coverage.coverageRate}% coverage.`,
      "Assignments were limited to available, qualified workers. Weekly maximums are hard limits, while desired hours guide fair distribution.",
    ].join(" "),
    risks: risks.length ? risks : ["No immediate coverage or workload risks were detected."],
    nextActions: [...new Set(nextActions)],
    reminders: buildReminderDrafts(input),
    source: "fallback",
    warning,
  };
}
