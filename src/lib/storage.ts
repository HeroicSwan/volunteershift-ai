import {
  WORKER_TYPES,
  EMPLOYMENT_TYPES,
  isPaidWorker,
  type ScheduleAssignment,
  type Shift,
  type ShiftPriority,
  type ScheduleGenerationSource,
  type AiProposalCoverage,
  type VolunteerMatcherData,
  type Worker,
  type WorkerType,
  type EmploymentType,
} from "@/types";

const STORAGE_KEY = "volunteer-matcher-data-v1";
const listeners = new Set<() => void>();

export const emptyData: VolunteerMatcherData = {
  workers: [],
  shifts: [],
  assignments: [],
  isSampleData: false,
};

// Stored payloads may predate the Worker upgrade: volunteers[] instead of
// workers[], requiredVolunteers on shifts, and volunteerId/volunteer on
// assignments. Normalizing here keeps every saved workspace loading.
type StoredWorker = Omit<Worker, "workerType" | "desiredHoursPerWeek" | "maxHoursPerWeek" | "employmentType"> & {
  workerType?: WorkerType;
  hoursPerWeek?: number;
  desiredHoursPerWeek?: number;
  maxHoursPerWeek?: number;
  employmentType?: EmploymentType;
};
type StoredShift = Omit<Shift, "priority" | "requiredWorkers" | "requiresSupervisor"> & {
  priority: ShiftPriority | "Medium";
  requiredWorkers?: number;
  requiredVolunteers?: number;
  requiresSupervisor?: boolean;
};
type StoredAssignment = Omit<ScheduleAssignment, "workerId" | "worker" | "shift" | "workerType" | "startTime" | "endTime" | "scoreBreakdown"> & {
  workerId?: string;
  worker?: StoredWorker;
  workerType?: WorkerType;
  volunteerId?: string;
  volunteer?: StoredWorker;
  shift?: StoredShift;
  startTime?: string;
  endTime?: string;
  scoreBreakdown?: ScheduleAssignment["scoreBreakdown"];
};
type StoredData = {
  workers?: StoredWorker[];
  volunteers?: StoredWorker[];
  shifts?: StoredShift[];
  assignments?: StoredAssignment[];
  isSampleData?: boolean;
  scheduleGeneratedAt?: string;
  scheduleGenerationSource?: ScheduleGenerationSource;
  scheduleGenerationWarning?: string;
  scheduleProposalCoverage?: AiProposalCoverage;
};

function normalizeWorker(worker: StoredWorker): Worker {
  const workerType = worker.workerType && WORKER_TYPES.includes(worker.workerType) ? worker.workerType : "volunteer";
  return {
    ...worker,
    workerType,
    desiredHoursPerWeek:
      worker.desiredHoursPerWeek ?? worker.hoursPerWeek ?? Math.min(40, Math.max(1, worker.maxShiftsPerWeek * 4)),
    maxHoursPerWeek:
      worker.maxHoursPerWeek ?? worker.hoursPerWeek ?? Math.min(40, Math.max(1, worker.maxShiftsPerWeek * 4)),
    employmentType:
      isPaidWorker(workerType) && worker.employmentType && EMPLOYMENT_TYPES.includes(worker.employmentType)
        ? worker.employmentType
        : isPaidWorker(workerType)
          ? "part_time"
          : undefined,
  };
}

function normalizeShift(shift: StoredShift): Shift {
  const { requiredVolunteers, ...rest } = shift;
  return {
    ...rest,
    priority: shift.priority === "Medium" ? "Normal" : shift.priority,
    requiredWorkers: shift.requiredWorkers ?? requiredVolunteers ?? 1,
    requiresSupervisor: shift.requiresSupervisor ?? false,
    staffingMode: shift.staffingMode ?? "continuous",
    requiredSupervisors: shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0),
  };
}

function normalizeData(data: StoredData): VolunteerMatcherData {
  const workers = (data.workers ?? data.volunteers ?? []).map(normalizeWorker);
  const shifts = (data.shifts ?? []).map(normalizeShift);

  return {
    workers,
    shifts,
    assignments: (data.assignments ?? []).flatMap((assignment) => {
      const workerId = assignment.workerId ?? assignment.volunteerId;
      const storedWorker = assignment.worker ?? assignment.volunteer;
      const worker = storedWorker
        ? normalizeWorker(storedWorker)
        : workers.find((item) => item.id === workerId);
      const shift = assignment.shift
        ? normalizeShift(assignment.shift)
        : shifts.find((item) => item.id === assignment.shiftId);
      return worker && shift && workerId
        ? [
            {
              shiftId: assignment.shiftId,
              workerId,
              worker,
              shift,
              startTime: assignment.startTime ?? shift.startTime,
              endTime: assignment.endTime ?? shift.endTime,
              workerType: assignment.workerType ?? worker.workerType,
              matchScore: assignment.matchScore,
              scoreBreakdown: assignment.scoreBreakdown ?? {
                base: 0,
                preferredDay: 0,
                preferredRole: 0,
                reliability: 0,
                workerTypeFit: 0,
                employmentFit: 0,
                fairnessPenalty: 0,
                consecutiveDayPenalty: 0,
                laborCostPenalty: 0,
                roleMismatchPenalty: 0,
                total: assignment.matchScore,
              },
              estimatedCost: assignment.estimatedCost,
              reasons: assignment.reasons ?? [],
              warnings: assignment.warnings ?? [],
            },
          ]
        : [];
    }),
    isSampleData: data.isSampleData ?? false,
    scheduleGeneratedAt: data.scheduleGeneratedAt,
    scheduleGenerationSource: data.scheduleGenerationSource,
    scheduleGenerationWarning: data.scheduleGenerationWarning,
    scheduleProposalCoverage: data.scheduleProposalCoverage,
  };
}

export function loadData(): VolunteerMatcherData {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeData(JSON.parse(saved)) : emptyData;
  } catch {
    return emptyData;
  }
}

export function saveData(data: VolunteerMatcherData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  listeners.forEach((listener) => listener());
}

export function getDataSnapshot() {
  return JSON.stringify(loadData());
}

export function getServerDataSnapshot() {
  return JSON.stringify(emptyData);
}

export function subscribeToData(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
