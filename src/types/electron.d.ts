import type { Worker, Shift, AiProposalCoverage } from "./index";
import type { AiScheduleProposal } from "../lib/ai-schedule-proposals";

type DesktopScheduleResponse = {
  source: "openai" | "deterministic";
  assignments: AiScheduleProposal[];
  warning?: string;
  proposalCoverage?: AiProposalCoverage;
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
