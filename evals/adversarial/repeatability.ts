import { runProductionScheduler } from "../validators";
import { generatePropertyCase } from "./properties";

export type RepeatabilityResult = {
  category: "O-repeatability-and-idempotence";
  runs: number;
  deterministic: boolean;
  uniqueSignatures: number;
  idempotentWithExistingAssignments: boolean;
  firstSignature: string;
  replaySignature: string;
  failures: string[];
};

function signature(result: ReturnType<typeof runProductionScheduler>) {
  return result.assignments
    .map((item) => `${item.workerId}|${item.shiftId}|${item.startTime}|${item.endTime}`)
    .sort()
    .join("\n");
}

export function runRepeatabilitySuite(runs = 50): RepeatabilityResult {
  const evaluationCase = generatePropertyCase(99_001);
  const results = Array.from({ length: runs }, () => runProductionScheduler(evaluationCase));
  const signatures = new Set(results.map(signature));
  const first = results[0];
  const replayCase = structuredClone(evaluationCase);
  replayCase.input.existingAssignments = first.assignments.map((assignment) => ({
    workerId: assignment.workerId,
    shiftId: assignment.shiftId,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    matchScore: assignment.matchScore,
    warnings: assignment.warnings,
  }));
  const replay = runProductionScheduler(replayCase);
  const firstSignature = signature(first);
  const replaySignature = signature(replay);
  const deterministic = signatures.size === 1;
  const idempotentWithExistingAssignments = firstSignature === replaySignature;
  const failures = [
    ...(!deterministic ? [`${signatures.size} unique assignment signatures appeared across ${runs} runs.`] : []),
    ...(!idempotentWithExistingAssignments ? ["Re-running with the generated assignments as existing assignments changed the schedule."] : []),
  ];
  return {
    category: "O-repeatability-and-idempotence",
    runs,
    deterministic,
    uniqueSignatures: signatures.size,
    idempotentWithExistingAssignments,
    firstSignature,
    replaySignature,
    failures,
  };
}
