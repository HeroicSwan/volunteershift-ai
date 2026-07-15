import { DAYS, type DayOfWeek } from "../../src/types";
import { evaluationCaseSchema, type EvaluationCase } from "../schema";
import { TEST_WEEK, availability, evaluationCase, paid, shift, supervisor, worker } from "./factories";

const cases: EvaluationCase[] = [];

for (let index = 0; index < 5; index += 1) {
  const shiftId = `a-manager-unavailable-${index + 1}-shift`;
  cases.push(evaluationCase(
    `a-manager-unavailable-${index + 1}`,
    "A-conflicting-hard-constraints",
    {
      workers: [supervisor(`a-manager-${index + 1}`, { availability: availability(["Tuesday"]) })],
      shifts: [shift(shiftId, { requiresSupervisor: true, requiredRole: "Manager", date: TEST_WEEK[0] })],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
    {
      expectedStatus: "impossible",
      expectedUnfilledShifts: [shiftId],
      expectedHardViolationCodes: ["REQUIRED_SUPERVISOR_MISSING"],
      minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 },
    },
  ));
}

for (let index = 0; index < 5; index += 1) {
  const shiftId = `a-manager-at-hour-cap-${index + 1}-shift`;
  cases.push(evaluationCase(
    `a-manager-at-hour-cap-${index + 1}`,
    "A-conflicting-hard-constraints",
    {
      workers: [supervisor(`a-capped-manager-${index + 1}`, { maxHoursPerWeek: 0, desiredHoursPerWeek: 0 })],
      shifts: [shift(shiftId, { requiresSupervisor: true, requiredRole: "Manager" })],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
    {
      expectedStatus: "impossible",
      expectedUnfilledShifts: [shiftId],
      expectedHardViolationCodes: ["REQUIRED_SUPERVISOR_MISSING"],
      minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 },
    },
  ));
}

for (let index = 0; index < 5; index += 1) {
  const urgentId = `a-overlap-urgent-${index + 1}`;
  const routineId = `a-overlap-routine-${index + 1}`;
  cases.push(evaluationCase(
    `a-only-worker-double-booking-${index + 1}`,
    "A-conflicting-hard-constraints",
    {
      workers: [worker(`a-only-worker-${index + 1}`)],
      shifts: [
        shift(urgentId, { priority: "Urgent", startTime: "09:00", endTime: "13:00" }),
        shift(routineId, { priority: "Normal", startTime: "10:00", endTime: "14:00" }),
      ],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
    {
      expectedStatus: "partial",
      requiredAssignments: [{ workerId: `a-only-worker-${index + 1}`, shiftId: urgentId }],
      expectedUnfilledShifts: [routineId],
      minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 },
    },
  ));
}

for (let scenario = 0; scenario < 10; scenario += 1) {
  const workers = [
    supervisor(`b-${scenario}-lead-a`, { roles: ["Manager", "Pantry", "Welcome", "General Support"] }),
    supervisor(`b-${scenario}-lead-b`, { roles: ["Manager", "Pantry", "Welcome", "General Support"] }),
    ...Array.from({ length: 16 }, (_, index) => paid(`b-${scenario}-staff-${index + 1}`, {
      employmentType: index < 8 ? "full_time" : "part_time",
      roles: ["Pantry", "Welcome", "General Support"],
      desiredHoursPerWeek: index < 8 ? 32 : 20,
      maxHoursPerWeek: index < 8 ? 40 : 28,
    })),
  ];
  const shifts = TEST_WEEK.flatMap((date, day) => [
    shift(`b-${scenario}-pantry-${day + 1}`, { date, startTime: "09:00", endTime: "13:00", requiredRole: "Pantry", requiredWorkers: 2 }),
    shift(`b-${scenario}-welcome-${day + 1}`, { date, startTime: "14:00", endTime: "18:00", requiredRole: "Welcome", requiredWorkers: 2, requiresSupervisor: true, minPaidStaff: 1, priority: day % 3 === 0 ? "High" : "Normal" }),
  ]);
  cases.push(evaluationCase(
    `b-realistic-mixed-week-${scenario + 1}`,
    "B-high-complexity-realistic-weeks",
    { workers, shifts, existingAssignments: [], cancelledWorkerIds: [] },
    { minimumSoftQualityThresholds: { coveragePercentage: 100, fairnessOfAssignedHours: 45, maximumOvertimeHours: 0 } },
  ));
}

for (let index = 0; index < 5; index += 1) {
  cases.push(evaluationCase(
    `c-touching-endpoints-${index + 1}`,
    "C-dense-overlaps",
    {
      workers: [worker(`c-endpoint-worker-${index + 1}`)],
      shifts: [
        shift(`c-endpoint-open-${index + 1}`, { startTime: "09:00", endTime: "11:00" }),
        shift(`c-endpoint-close-${index + 1}`, { startTime: "11:00", endTime: "13:00" }),
      ],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  ));
}

for (let index = 0; index < 5; index += 1) {
  cases.push(evaluationCase(
    `c-one-minute-overlap-${index + 1}`,
    "C-dense-overlaps",
    {
      workers: [worker(`c-minute-a-${index + 1}`), worker(`c-minute-b-${index + 1}`)],
      shifts: [
        shift(`c-minute-first-${index + 1}`, { startTime: "09:00", endTime: "12:00" }),
        shift(`c-minute-second-${index + 1}`, { startTime: "11:59", endTime: "15:00" }),
      ],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  ));
}

const invalidTimes = [
  ["12:00", "12:00"],
  ["17:00", "09:00"],
  ["25:00", "26:00"],
] as const;
invalidTimes.forEach(([startTime, endTime], index) => {
  const shiftId = `c-invalid-time-${index + 1}-shift`;
  cases.push(evaluationCase(
    `c-invalid-time-${index + 1}`,
    "C-dense-overlaps",
    { workers: [paid(`c-invalid-worker-${index + 1}`)], shifts: [shift(shiftId, { startTime, endTime })], existingAssignments: [], cancelledWorkerIds: [] },
    { expectedStatus: "invalid", expectedUnfilledShifts: [shiftId], expectedHardViolationCodes: ["INVALID_SHIFT_TIME"], minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 } },
  ));
});

cases.push(evaluationCase(
  "c-duplicate-shift-identifiers",
  "C-dense-overlaps",
  {
    workers: [worker("c-duplicate-id-a"), worker("c-duplicate-id-b")],
    shifts: [shift("c-duplicate-shift", { startTime: "09:00", endTime: "11:00" }), shift("c-duplicate-shift", { startTime: "13:00", endTime: "15:00" })],
    existingAssignments: [],
    cancelledWorkerIds: [],
  },
  {
    expectedStatus: "invalid",
    expectedUnfilledShifts: ["c-duplicate-shift"],
    expectedHardViolationCodes: ["DUPLICATE_SHIFT_ID", "MINIMUM_COVERAGE_NOT_MET"],
    minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 },
  },
));

cases.push(evaluationCase(
  "c-extremely-long-operating-window",
  "C-dense-overlaps",
  {
    workers: Array.from({ length: 4 }, (_, index) => paid(`c-long-${index + 1}`, { availability: availability(["Monday"], "00:00", "23:59") })),
    shifts: [shift("c-long-window", { startTime: "00:00", endTime: "23:59" })],
    existingAssignments: [],
    cancelledWorkerIds: [],
  },
));

for (let cycle = 0; cycle < 3; cycle += 1) {
  const day = DAYS[cycle] as DayOfWeek;
  const date = TEST_WEEK[cycle];
  const noneId = `d-empty-${cycle + 1}`;
  cases.push(evaluationCase(
    `d-empty-availability-${cycle + 1}`,
    "D-availability-traps",
    { workers: [worker(`d-none-${cycle + 1}`, { availability: {} })], shifts: [shift(noneId, { date })], existingAssignments: [], cancelledWorkerIds: [] },
    { expectedStatus: "impossible", expectedUnfilledShifts: [noneId], minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 } },
  ));
  cases.push(evaluationCase(
    `d-exact-availability-boundaries-${cycle + 1}`,
    "D-availability-traps",
    { workers: [worker(`d-exact-${cycle + 1}`, { availability: availability([day], "09:00", "13:00") })], shifts: [shift(`d-exact-shift-${cycle + 1}`, { date })], existingAssignments: [], cancelledWorkerIds: [] },
  ));
  cases.push(evaluationCase(
    `d-split-availability-second-window-${cycle + 1}`,
    "D-availability-traps",
    {
      workers: [worker(`d-split-${cycle + 1}`, { availability: { [day]: [{ start: "08:00", end: "10:00" }, { start: "13:00", end: "17:00" }] } })],
      shifts: [shift(`d-split-shift-${cycle + 1}`, { date, startTime: "13:00", endTime: "17:00" })],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  ));
  cases.push(evaluationCase(
    `d-overlapping-availability-order-${cycle + 1}`,
    "D-availability-traps",
    {
      workers: [worker(`d-overlap-${cycle + 1}`, { availability: { [day]: [{ start: "09:00", end: "10:00" }, { start: "09:00", end: "13:00" }] } })],
      shifts: [shift(`d-overlap-shift-${cycle + 1}`, { date, startTime: "09:00", endTime: "13:00" })],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  ));
}

for (let cycle = 0; cycle < 3; cycle += 1) {
  cases.push(evaluationCase(
    `e-fractional-volunteer-${cycle + 1}`,
    "E-hours-and-overtime",
    { workers: [worker(`e-vol-${cycle + 1}`, { maxHoursPerWeek: 3.5, desiredHoursPerWeek: 3.5 })], shifts: [shift(`e-vol-shift-${cycle + 1}`, { startTime: "09:00", endTime: "12:30" })], existingAssignments: [], cancelledWorkerIds: [] },
  ));
  cases.push(evaluationCase(
    `e-fractional-paid-${cycle + 1}`,
    "E-hours-and-overtime",
    { workers: [paid(`e-paid-${cycle + 1}`)], shifts: [shift(`e-paid-shift-${cycle + 1}`, { startTime: "09:00", endTime: "16:15" })], existingAssignments: [], cancelledWorkerIds: [] },
  ));
  cases.push(evaluationCase(
    `e-long-shift-relay-${cycle + 1}`,
    "E-hours-and-overtime",
    { workers: [paid(`e-relay-a-${cycle + 1}`, { availability: availability(["Monday"], "09:00", "21:00") }), paid(`e-relay-b-${cycle + 1}`, { availability: availability(["Monday"], "09:00", "21:00") })], shifts: [shift(`e-relay-shift-${cycle + 1}`, { startTime: "09:00", endTime: "20:45" })], existingAssignments: [], cancelledWorkerIds: [] },
  ));
  cases.push(evaluationCase(
    `e-week-boundary-reset-${cycle + 1}`,
    "E-hours-and-overtime",
    {
      workers: [paid(`e-weekly-${cycle + 1}`, { maxHoursPerWeek: 8, desiredHoursPerWeek: 8, maxShiftsPerWeek: 1 })],
      shifts: [shift(`e-week-one-${cycle + 1}`, { startTime: "09:00", endTime: "17:00" }), shift(`e-week-two-${cycle + 1}`, { date: "2026-10-12", startTime: "09:00", endTime: "17:00" })],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  ));
  const overtimeShifts = TEST_WEEK.slice(0, 6).map((date, index) => shift(`e-overtime-${cycle + 1}-${index + 1}`, { date, startTime: "09:00", endTime: "17:00", priority: index === 5 ? "Low" : "Normal" }));
  cases.push(evaluationCase(
    `e-paid-forty-hour-ceiling-${cycle + 1}`,
    "E-hours-and-overtime",
    { workers: [paid(`e-overtime-worker-${cycle + 1}`, { maxHoursPerWeek: 48, desiredHoursPerWeek: 48, maxShiftsPerWeek: 6 })], shifts: overtimeShifts, existingAssignments: [], cancelledWorkerIds: [] },
    { expectedStatus: "partial", expectedUnfilledShifts: [overtimeShifts[5].id], minimumSoftQualityThresholds: { maximumUnfilledShifts: 1, maximumOvertimeHours: 0 } },
  ));
}

for (let index = 0; index < 5; index += 1) {
  cases.push(evaluationCase(
    `f-multiple-roles-${index + 1}`,
    "F-qualification-traps",
    { workers: [worker(`f-multi-${index + 1}`, { roles: ["Pantry", "Driver", "Welcome"] })], shifts: [shift(`f-driver-shift-${index + 1}`, { requiredRole: "Driver" })], existingAssignments: [], cancelledWorkerIds: [] },
  ));
  const shiftId = `f-case-sensitive-shift-${index + 1}`;
  cases.push(evaluationCase(
    `f-case-sensitive-role-${index + 1}`,
    "F-qualification-traps",
    { workers: [worker(`f-case-${index + 1}`, { roles: ["driver"] })], shifts: [shift(shiftId, { requiredRole: "Driver" })], existingAssignments: [], cancelledWorkerIds: [] },
    { expectedStatus: "impossible", expectedUnfilledShifts: [shiftId], minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 } },
  ));
}

for (let scenario = 0; scenario < 10; scenario += 1) {
  const workers = ["avery", "blake", "cameron", "devon"].map((name) => paid(`g-${scenario}-${name}`, { employmentType: "part_time", desiredHoursPerWeek: 8, maxHoursPerWeek: 8, maxShiftsPerWeek: 2 }));
  const shifts = TEST_WEEK.slice(0, 4).flatMap((date, day) => [
    shift(`g-${scenario}-morning-${day + 1}`, { date, startTime: "09:00", endTime: "13:00" }),
    shift(`g-${scenario}-afternoon-${day + 1}`, { date, startTime: "13:00", endTime: "17:00" }),
  ]);
  cases.push(evaluationCase(
    `g-equivalent-worker-fairness-${scenario + 1}`,
    "G-fairness-and-preferences",
    { workers, shifts, existingAssignments: [], cancelledWorkerIds: [] },
    { minimumSoftQualityThresholds: { coveragePercentage: 100, fairnessOfAssignedHours: 95, maximumOvertimeHours: 0 } },
  ));
}

for (let index = 0; index < 10; index += 1) {
  const primaryId = `h-primary-${index + 1}`;
  const shiftId = `h-cancelled-shift-${index + 1}`;
  const hasBackup = index % 2 === 0;
  cases.push(evaluationCase(
    `h-worker-cancellation-${index + 1}`,
    "H-cancellation-and-repair",
    {
      workers: [worker(primaryId), ...(hasBackup ? [worker(`h-backup-${index + 1}`)] : [])],
      shifts: [shift(shiftId)],
      existingAssignments: [],
      cancelledWorkerIds: [primaryId],
    },
    hasBackup
      ? { forbiddenAssignments: [{ workerId: primaryId, shiftId }] }
      : { expectedStatus: "impossible", expectedUnfilledShifts: [shiftId], forbiddenAssignments: [{ workerId: primaryId, shiftId }], minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 } },
  ));
}

for (let index = 0; index < 2; index += 1) {
  const workerId = `i-valid-worker-${index + 1}`;
  const shiftId = `i-valid-shift-${index + 1}`;
  cases.push(evaluationCase(
    `i-valid-existing-assignment-${index + 1}`,
    "I-existing-and-manual-assignments",
    { workers: [worker(workerId)], shifts: [shift(shiftId)], existingAssignments: [{ workerId, shiftId, matchScore: 80, warnings: [] }], cancelledWorkerIds: [] },
    { requiredAssignments: [{ workerId, shiftId }] },
  ));
}

for (let index = 0; index < 2; index += 1) {
  const workerId = `i-unavailable-worker-${index + 1}`;
  const shiftId = `i-unavailable-shift-${index + 1}`;
  cases.push(evaluationCase(
    `i-unavailable-existing-assignment-${index + 1}`,
    "I-existing-and-manual-assignments",
    { workers: [worker(workerId, { availability: {} })], shifts: [shift(shiftId)], existingAssignments: [{ workerId, shiftId, matchScore: 80, warnings: [] }], cancelledWorkerIds: [] },
    { expectedStatus: "invalid", expectedHardViolationCodes: ["WORKER_UNAVAILABLE"] },
  ));
}

for (let index = 0; index < 2; index += 1) {
  const workerId = `i-overlap-worker-${index + 1}`;
  const firstId = `i-overlap-first-${index + 1}`;
  const secondId = `i-overlap-second-${index + 1}`;
  cases.push(evaluationCase(
    `i-overlapping-existing-assignments-${index + 1}`,
    "I-existing-and-manual-assignments",
    {
      workers: [worker(workerId)],
      shifts: [shift(firstId), shift(secondId, { startTime: "10:00", endTime: "14:00" })],
      existingAssignments: [{ workerId, shiftId: firstId, matchScore: 80, warnings: [] }, { workerId, shiftId: secondId, matchScore: 80, warnings: [] }],
      cancelledWorkerIds: [],
    },
    { expectedStatus: "invalid", expectedHardViolationCodes: ["OVERLAPPING_ASSIGNMENTS"] },
  ));
}

for (let index = 0; index < 2; index += 1) {
  const workerId = `i-hours-worker-${index + 1}`;
  const shiftId = `i-hours-shift-${index + 1}`;
  cases.push(evaluationCase(
    `i-existing-assignment-over-hours-${index + 1}`,
    "I-existing-and-manual-assignments",
    { workers: [paid(workerId, { maxHoursPerWeek: 2, desiredHoursPerWeek: 2 })], shifts: [shift(shiftId)], existingAssignments: [{ workerId, shiftId, matchScore: 80, warnings: [] }], cancelledWorkerIds: [] },
    {
      expectedStatus: "invalid",
      expectedHardViolationCodes: ["MAX_WEEKLY_HOURS_EXCEEDED"],
      minimumSoftQualityThresholds: { maximumOvertimeHours: 2 },
    },
  ));
}

for (let index = 0; index < 2; index += 1) {
  cases.push(evaluationCase(
    `j-duplicate-worker-id-${index + 1}`,
    "J-malformed-and-hostile-input",
    {
      workers: [worker(`j-duplicate-worker-${index + 1}`), worker(`j-duplicate-worker-${index + 1}`)],
      shifts: [shift(`j-duplicate-worker-shift-${index + 1}`)],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
    {
      expectedStatus: "invalid",
      expectedUnfilledShifts: [`j-duplicate-worker-shift-${index + 1}`],
      expectedHardViolationCodes: ["DUPLICATE_WORKER_ID", "MINIMUM_COVERAGE_NOT_MET"],
      minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 },
    },
  ));
  cases.push(evaluationCase(
    `j-duplicate-shift-id-${index + 1}`,
    "J-malformed-and-hostile-input",
    {
      workers: [worker(`j-duplicate-shift-worker-a-${index + 1}`), worker(`j-duplicate-shift-worker-b-${index + 1}`)],
      shifts: [shift(`j-duplicate-shift-${index + 1}`, { startTime: "09:00", endTime: "11:00" }), shift(`j-duplicate-shift-${index + 1}`, { startTime: "13:00", endTime: "15:00" })],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
    {
      expectedStatus: "invalid",
      expectedUnfilledShifts: [`j-duplicate-shift-${index + 1}`],
      expectedHardViolationCodes: ["DUPLICATE_SHIFT_ID", "MINIMUM_COVERAGE_NOT_MET"],
      minimumSoftQualityThresholds: { maximumUnfilledShifts: 1 },
    },
  ));
  cases.push(evaluationCase(
    `j-empty-input-${index + 1}`,
    "J-malformed-and-hostile-input",
    { workers: [], shifts: [], existingAssignments: [], cancelledWorkerIds: [] },
  ));
  cases.push(evaluationCase(
    `j-unicode-and-scriptlike-text-${index + 1}`,
    "J-malformed-and-hostile-input",
    {
      workers: [worker(`j-unicode-${index + 1}`, { name: `Zoë 李 🚲 <script>alert(${index})</script>`, notes: "x".repeat(2_000) })],
      shifts: [shift(`j-unicode-shift-${index + 1}`, { title: `Café accueil 🧡 ${index + 1}` })],
      existingAssignments: [],
      cancelledWorkerIds: [],
    },
  ));
  const zeroId = `j-zero-required-${index + 1}`;
  cases.push(evaluationCase(
    `j-zero-required-workers-${index + 1}`,
    "J-malformed-and-hostile-input",
    { workers: [worker(`j-zero-worker-${index + 1}`)], shifts: [shift(zeroId, { requiredWorkers: 0 })], existingAssignments: [], cancelledWorkerIds: [] },
    { expectedStatus: "invalid", expectedHardViolationCodes: ["INVALID_REQUIRED_WORKERS"] },
  ));
}

if (cases.length < 100) throw new Error(`Adversarial suite requires at least 100 scenarios; found ${cases.length}`);

export const adversarialCases = evaluationCaseSchema.array().parse(cases);
