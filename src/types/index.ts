export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type DayOfWeek = (typeof DAYS)[number];

export type TimeBlock = {
  start: string;
  end: string;
};

export const AVAILABILITY_BLOCKS = ["Morning", "Afternoon", "Evening"] as const;

export type AvailabilityBlock = (typeof AVAILABILITY_BLOCKS)[number];

export const AVAILABILITY_TIMES: Record<AvailabilityBlock, TimeBlock> = {
  Morning: { start: "08:00", end: "12:00" },
  Afternoon: { start: "12:00", end: "17:00" },
  Evening: { start: "17:00", end: "21:00" },
};

export const COMMON_ROLES = [
  "Welcome Desk",
  "Food Service",
  "Driver",
  "Event Support",
  "Inventory",
] as const;

export const WORKER_TYPES = ["volunteer", "paid_employee", "supervisor"] as const;

export type WorkerType = (typeof WORKER_TYPES)[number];

export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  volunteer: "Volunteer",
  paid_employee: "Paid Employee",
  supervisor: "Supervisor",
};

export const EMPLOYMENT_TYPES = ["part_time", "full_time"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  part_time: "Part-time",
  full_time: "Full-time",
};

export const RELIABILITY_SCORES = [1, 2, 3, 4, 5] as const;

export type Worker = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  workerType: WorkerType;
  roles: string[];
  availability: Partial<Record<DayOfWeek, TimeBlock[]>>;
  preferredDays: DayOfWeek[];
  preferredRoles: string[];
  maxShiftsPerWeek: number;
  desiredHoursPerWeek: number;
  maxHoursPerWeek: number;
  employmentType?: EmploymentType;
  hourlyRate?: number;
  reliabilityScore?: number;
  notes: string;
};

export function isPaidWorker(workerType: WorkerType) {
  return workerType === "paid_employee" || workerType === "supervisor";
}

export const SHIFT_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;

export type ShiftPriority = (typeof SHIFT_PRIORITIES)[number];

export type StaffingMode = "continuous" | "daily_roster";

export type Shift = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  requiredRole: string;
  requiredWorkers: number;
  requiresSupervisor: boolean;
  staffingMode?: StaffingMode;
  requiredSupervisors?: number;
  maxDailyWorkers?: number;
  requiredWorkerHours?: number;
  minPaidStaff?: number;
  maxPaidStaff?: number;
  priority: ShiftPriority;
  notes: string;
};

export type ScheduleAssignment = {
  shiftId: string;
  workerId: string;
  worker: Worker;
  shift: Shift;
  startTime: string;
  endTime: string;
  workerType: WorkerType;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  estimatedCost?: number;
  reasons: string[];
  warnings: string[];
};

export type ScoreBreakdown = {
  base: number;
  preferredDay: number;
  preferredRole: number;
  reliability: number;
  workerTypeFit: number;
  employmentFit: number;
  fairnessPenalty: number;
  consecutiveDayPenalty: number;
  laborCostPenalty: number;
  roleMismatchPenalty: number;
  total: number;
};

export type CoverageGap = {
  shift: Shift;
  assignedCount: number;
  requiredCount: number;
  missingWorkers: number;
  status: "uncovered" | "partial";
};

export type WorkerFairnessStat = {
  worker: Worker;
  assignedShifts: number;
  assignedHours: number;
  desiredHoursPerWeek: number;
  maxHoursPerWeek: number;
  maxShiftsPerWeek: number;
  utilizationRate: number;
};

export type FairnessStats = {
  workers: WorkerFairnessStat[];
  totalAssignments: number;
  averageAssignments: number;
  minimumAssignments: number;
  maximumAssignments: number;
  assignmentSpread: number;
};

export type ShiftCostEstimate = {
  shift: Shift;
  paidAssignments: number;
  estimatedCost: number;
  missingRates: number;
};

export type LaborCostStats = {
  shifts: ShiftCostEstimate[];
  totalEstimatedCost: number;
  paidAssignments: number;
  volunteerAssignments: number;
  missingRates: number;
};

export type CoverageMetrics = {
  requiredWorkerHours: number;
  coveredWorkerHours: number;
  coverageRate: number;
};

export type CoverageRiskLevel = "low" | "medium" | "high" | "critical";

export type ShiftRiskAssessment = {
  shift: Shift;
  level: CoverageRiskLevel;
  reasons: string[];
};

export type OptimizedScheduleResult = {
  assignments: ScheduleAssignment[];
  uncoveredShifts: CoverageGap[];
  partiallyCoveredShifts: CoverageGap[];
  fairnessStats: FairnessStats;
  laborCostStats: LaborCostStats;
  shiftRisks: ShiftRiskAssessment[];
  shiftResults: ShiftScheduleResult[];
  validation: ScheduleValidationResult;
};

export type ScheduleGenerationSource = "openai" | "deterministic";

export type AiProposalCoverage = {
  requested: number;
  proposed: number;
  coveragePercent: number;
  batches: number;
  completedBatches: number;
  retries: number;
};

export type ShiftScheduleResult = {
  shiftId: string;
  assignedWorkers: ScheduleAssignment[];
  requiredWorkers: number;
  coverageStatus: "covered" | "partially_covered" | "uncovered";
  riskLevel: CoverageRiskLevel;
  uncoveredReasons: string[];
  supervisorStatus: "not_required" | "covered" | "missing";
  paidStaffStatus: "not_required" | "met" | "short";
  estimatedLaborCost: number;
};

export type ScheduleValidationIssue = {
  rule: string;
  message: string;
  workerId?: string;
  shiftId?: string;
};

export type ScheduleValidationResult = {
  valid: boolean;
  issues: ScheduleValidationIssue[];
};

export type ReminderDraft = {
  workerId: string;
  workerName: string;
  email: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
};

export type AiAssistantResult = {
  explanation: string;
  risks: string[];
  nextActions: string[];
  reminders: ReminderDraft[];
  source: "openai" | "fallback";
  warning?: string;
};

export type AiAssistantInput = Pick<
  VolunteerMatcherData,
  "workers" | "shifts" | "assignments" | "scheduleGeneratedAt"
>;

export type VolunteerMatcherData = {
  workers: Worker[];
  shifts: Shift[];
  assignments: ScheduleAssignment[];
  isSampleData: boolean;
  scheduleGeneratedAt?: string;
  scheduleGenerationSource?: ScheduleGenerationSource;
  scheduleGenerationWarning?: string;
  scheduleProposalCoverage?: AiProposalCoverage;
};

export type WorkerInput = Omit<Worker, "id">;
export type ShiftInput = Omit<Shift, "id">;

export type ImportMode = "append" | "replace";
