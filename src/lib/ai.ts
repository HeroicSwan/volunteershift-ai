import OpenAI from "openai";
import { z } from "zod";
import { generateFallbackAssistant } from "./ai-fallback";
import { getShiftMinimumCoverage, getUncoveredShifts } from "./scheduler";
import type { AiAssistantInput, AiAssistantResult } from "../types";

// The offline assistant lives in ai-fallback.ts (pure, client-safe). This
// module adds the optional OpenAI-backed variant, which is server-only.
export { generateFallbackAssistant } from "./ai-fallback";

const reminderSchema = z.object({
  workerId: z.string(),
  workerName: z.string(),
  email: z.string(),
  emailSubject: z.string(),
  emailBody: z.string(),
  smsBody: z.string(),
});

const aiResponseSchema = z.object({
  explanation: z.string(),
  risks: z.array(z.string()),
  nextActions: z.array(z.string()),
  reminders: z.array(reminderSchema),
});

function buildModelContext(input: AiAssistantInput) {
  const gaps = getUncoveredShifts(input.shifts, input.assignments);
  return {
    shifts: input.shifts.map((shift) => ({
      id: shift.id,
      title: shift.title,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      location: shift.location,
      requiredRole: shift.requiredRole,
      requiredWorkers: shift.requiredWorkers,
      requiresSupervisor: shift.requiresSupervisor,
      minPaidStaff: shift.minPaidStaff,
      maxPaidStaff: shift.maxPaidStaff,
      priority: shift.priority,
      assignedCount: getShiftMinimumCoverage(shift, input.assignments),
    })),
    assignments: input.assignments.map((assignment) => ({
      workerId: assignment.workerId,
      workerName: assignment.worker.name,
      workerEmail: assignment.worker.email,
      workerType: assignment.worker.workerType,
      maxShiftsPerWeek: assignment.worker.maxShiftsPerWeek,
      desiredHoursPerWeek: assignment.worker.desiredHoursPerWeek,
      maxHoursPerWeek: assignment.worker.maxHoursPerWeek,
      shift: {
        title: assignment.shift.title,
        date: assignment.shift.date,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        location: assignment.shift.location,
        role: assignment.shift.requiredRole,
        priority: assignment.shift.priority,
      },
      matchScore: assignment.matchScore,
      warnings: assignment.warnings,
    })),
    coverageGaps: gaps.map((gap) => ({
      status: gap.status,
      assignedCount: gap.assignedCount,
      requiredCount: gap.requiredCount,
      missingWorkers: gap.missingWorkers,
      shift: {
        id: gap.shift.id,
        title: gap.shift.title,
        date: gap.shift.date,
        startTime: gap.shift.startTime,
        endTime: gap.shift.endTime,
        location: gap.shift.location,
        requiredRole: gap.shift.requiredRole,
        requiredWorkers: gap.shift.requiredWorkers,
        priority: gap.shift.priority,
      },
    })),
  };
}

export async function generateAiAssistant(input: AiAssistantInput): Promise<AiAssistantResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = generateFallbackAssistant(input);
  if (!apiKey) return fallback;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a nonprofit staff and volunteer scheduling assistant. Return valid JSON only with keys explanation, risks, nextActions, and reminders. Be concise, practical, warm, and strictly grounded in the supplied schedule. Explain priority ordering, coverage gaps, workload risks, weak roles, and fixes. Workers may be volunteers, paid employees, or supervisors; only thank volunteers for volunteering. Create one reminder per assigned worker with workerId, workerName, email, emailSubject, emailBody, and smsBody. Every reminder must include every assigned shift’s title, date, time, location, and role. Never claim that a message was sent.",
        },
        {
          role: "user",
          content: JSON.stringify(buildModelContext(input)),
        },
      ],
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("The configured model returned no content.");

    const parsed = aiResponseSchema.parse(JSON.parse(content));
    const aiReminders = new Map(parsed.reminders.map((reminder) => [reminder.workerId, reminder]));
    return {
      ...parsed,
      reminders: fallback.reminders.map((reminder) => aiReminders.get(reminder.workerId) ?? reminder),
      source: "openai",
    };
  } catch {
    return generateFallbackAssistant(
      input,
      "The configured AI service was unavailable, so the built-in schedule assistant was used instead.",
    );
  }
}
