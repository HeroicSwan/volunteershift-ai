import type { Worker, Shift } from "./index";
import type { AiScheduleProposal } from "../lib/ai-schedule-proposals";

type DesktopScheduleResponse = {
  source: "openai" | "deterministic";
  assignments: AiScheduleProposal[];
  warning?: string;
};
type DesktopAiConfig = {
  configured: boolean;
  secureStorageAvailable: boolean;
  baseUrl: string;
  model: string;
};

declare global {
  interface Window {
    volunteerShiftDesktop?: {
      generateSchedule(payload: { workers: Worker[]; shifts: Shift[] }): Promise<DesktopScheduleResponse>;
      getAiConfig(): Promise<DesktopAiConfig>;
      saveAiConfig(payload: { apiKey: string; baseUrl?: string; model?: string }): Promise<DesktopAiConfig>;
      clearAiConfig(): Promise<DesktopAiConfig>;
    };
  }
}

export {};
