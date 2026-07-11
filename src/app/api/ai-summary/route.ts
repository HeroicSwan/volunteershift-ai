import { generateAiAssistant } from "@/lib/ai";
import type { AiAssistantInput } from "@/types";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as AiAssistantInput;
    return Response.json(await generateAiAssistant(input));
  } catch {
    return Response.json(
      { error: "The schedule assistant could not read this schedule." },
      { status: 400 },
    );
  }
}
