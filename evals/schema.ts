import { z } from "zod";
import {
  DAYS,
  EMPLOYMENT_TYPES,
  SHIFT_PRIORITIES,
  WORKER_TYPES,
  type ScheduleAssignment,
} from "../src/types";

const timeBlockSchema = z.object({
  start: z.string(),
  end: z.string(),
}).strict();

const availabilitySchema = z.object(
  Object.fromEntries(DAYS.map((day) => [day, z.array(timeBlockSchema).optional()])) as Record<
    (typeof DAYS)[number],
    z.ZodOptional<z.ZodArray<typeof timeBlockSchema>>
  >,
).strict();

export const workerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().optional(),
  workerType: z.enum(WORKER_TYPES),
  roles: z.array(z.string()),
  availability: availabilitySchema,
  preferredDays: z.array(z.enum(DAYS)),
  preferredRoles: z.array(z.string()),
  maxShiftsPerWeek: z.number().int().nonnegative(),
  desiredHoursPerWeek: z.number().nonnegative(),
  maxHoursPerWeek: z.number().nonnegative(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  hourlyRate: z.number().nonnegative().optional(),
  reliabilityScore: z.number().int().min(1).max(5).optional(),
  notes: z.string(),
}).strict();

export const shiftSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string(),
  requiredRole: z.string(),
  requiredWorkers: z.number().int().nonnegative(),
  requiresSupervisor: z.boolean(),
  staffingMode: z.enum(["continuous", "daily_roster"]).optional(),
  requiredSupervisors: z.number().int().nonnegative().optional(),
  maxDailyWorkers: z.number().int().nonnegative().optional(),
  requiredWorkerHours: z.number().nonnegative().optional(),
  minPaidStaff: z.number().int().nonnegative().optional(),
  maxPaidStaff: z.number().int().nonnegative().optional(),
  priority: z.enum(SHIFT_PRIORITIES),
  notes: z.string(),
}).strict();

export const assignmentExpectationSchema = z.object({
  workerId: z.string().min(1),
  shiftId: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
}).strict();

export const seededAssignmentSchema = assignmentExpectationSchema.extend({
  matchScore: z.number().min(0).max(100).default(75),
  warnings: z.array(z.string()).default([]),
});

export const softQualityThresholdsSchema = z.object({
  coveragePercentage: z.number().min(0).max(100).optional(),
  preferenceSatisfaction: z.number().min(0).max(100).optional(),
  fairnessOfAssignedHours: z.number().min(0).max(100).optional(),
  maximumOvertimeHours: z.number().nonnegative().optional(),
  maximumUndesirableShiftSpread: z.number().nonnegative().optional(),
  maximumUnfilledShifts: z.number().int().nonnegative().optional(),
  maximumRuntimeMs: z.number().positive().optional(),
}).strict();

export const evaluationCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  input: z.object({
    workers: z.array(workerSchema),
    shifts: z.array(shiftSchema),
    existingAssignments: z.array(seededAssignmentSchema).default([]),
    cancelledWorkerIds: z.array(z.string()).default([]),
  }).strict(),
  expectedStatus: z.enum(["success", "partial", "impossible", "invalid"]),
  requiredAssignments: z.array(assignmentExpectationSchema).default([]),
  forbiddenAssignments: z.array(assignmentExpectationSchema).default([]),
  expectedUnfilledShifts: z.array(z.string()).default([]),
  expectedWarnings: z.array(z.string()).default([]),
  expectedHardViolationCodes: z.array(z.string()).default([]),
  maximumAllowedHardViolations: z.number().int().nonnegative().default(0),
  minimumSoftQualityThresholds: softQualityThresholdsSchema.default({}),
  timeoutMs: z.number().int().positive().default(5_000),
}).strict();

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationStatus = EvaluationCase["expectedStatus"];
export type AssignmentExpectation = z.infer<typeof assignmentExpectationSchema>;

export type ValidationIssue = {
  severity: "hard" | "soft";
  code: string;
  explanation: string;
  workerId?: string;
  shiftId?: string;
  expected: unknown;
  actual: unknown;
};

export type EvaluationMetrics = {
  coveragePercentage: number;
  preferenceSatisfaction: number;
  fairnessOfAssignedHours: number;
  overtimeUsageHours: number;
  undesirableShiftSpread: number;
  unfilledShiftCount: number;
  schedulingRuntimeMs: number;
  hardConstraintViolationCount: number;
  averageMatchScore: number;
};

export type EvaluationCaseResult = {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  expectedStatus: EvaluationStatus;
  actualStatus: EvaluationStatus;
  runtimeMs: number;
  crashed: boolean;
  timedOut: boolean;
  error?: string;
  issues: ValidationIssue[];
  expectationFailures: string[];
  metrics: EvaluationMetrics;
  expected: {
    requiredAssignments: AssignmentExpectation[];
    forbiddenAssignments: AssignmentExpectation[];
    unfilledShiftIds: string[];
    warningFragments: string[];
  };
  actual: {
    assignments: Array<Pick<ScheduleAssignment, "workerId" | "shiftId" | "startTime" | "endTime" | "matchScore" | "warnings">>;
    unfilledShiftIds: string[];
    warnings: string[];
  };
};

export type EvaluationReport = {
  schemaVersion: 1;
  generatedAt: string;
  seed: number;
  schedulerEntryPoint: "src/lib/scheduler.ts#generateOptimizedSchedule";
  filters: { caseId?: string; category?: string };
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    hardViolations: number;
    averageRuntimeMs: number;
    averageCoveragePercentage: number;
    averagePreferenceSatisfaction: number;
    averageFairnessOfAssignedHours: number;
  };
  cases: EvaluationCaseResult[];
};
