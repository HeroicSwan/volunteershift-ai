import type { Worker, Shift, AiProposalCoverage } from "./index";
import type { AiScheduleProposal } from "../lib/ai-schedule-proposals";

type DesktopScheduleResponse = {
  source: "openai" | "deterministic";
  assignments: AiScheduleProposal[];
  warning?: string;
  proposalCoverage?: AiProposalCoverage;
  cancelled?: boolean;
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
      cancelSchedule(): Promise<{ cancelled: boolean }>;
      onScheduleProgress(callback: (progress: { current: number; total: number; requested: number; proposed: number; status: string }) => void): () => void;
      getAiConfig(): Promise<DesktopAiConfig>;
      saveAiConfig(payload: { apiKey: string; baseUrl?: string; model?: string }): Promise<DesktopAiConfig>;
      clearAiConfig(): Promise<DesktopAiConfig>;
    };
  }
}

export {};
