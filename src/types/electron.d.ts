import type { Worker, Shift } from "./index";
import type { AiScheduleProposal } from "../lib/ai-schedule-proposals";

type DesktopScheduleResponse = {
  source: "openai" | "deterministic";
  assignments: AiScheduleProposal[];
  warning?: string;
};

declare global {
  interface Window {
    volunteerShiftDesktop?: {
      generateSchedule(payload: { workers: Worker[]; shifts: Shift[] }): Promise<DesktopScheduleResponse>;
    };
  }
}

export {};
