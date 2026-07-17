import { generateAiSchedule } from "@/lib/ai-scheduler";
import type { Shift, Worker } from "@/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workers?: Worker[]; shifts?: Shift[] };
    if (!Array.isArray(body.workers) || !Array.isArray(body.shifts)) {
      return Response.json({ error: "Workers and shifts are required." }, { status: 400 });
    }
    return Response.json(await generateAiSchedule(body.workers, body.shifts));
  } catch {
    return Response.json(
      { error: "The schedule planner could not process this roster." },
      { status: 400 },
    );
  }
}
