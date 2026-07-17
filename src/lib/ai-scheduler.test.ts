import { afterEach, describe, expect, it, vi } from "vitest";
import { createSampleData } from "./sample-data";
import { generateAiSchedule } from "./ai-scheduler";

describe("AI schedule generation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the deterministic safety scheduler when no API key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const sample = createSampleData();
    const generated = await generateAiSchedule(sample.workers, sample.shifts);

    expect(generated.source).toBe("deterministic");
    expect(generated.warning).toContain("No AI API key");
    expect(generated.result.validation.valid).toBe(true);
  });
});
