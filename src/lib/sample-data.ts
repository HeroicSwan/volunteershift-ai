import { DAYS, type Shift, type VolunteerMatcherData, type Worker } from "../types";

function toLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextMonday() {
  const date = new Date();
  const daysUntil = ((1 - date.getDay() + 7) % 7) || 7;
  date.setDate(date.getDate() + daysUntil);
  return date;
}

// Roster is intentionally over-resourced: every shift has more qualified,
// available workers than it needs, and most routine spots can be covered by
// free volunteers — so the scheduler can reach 100% coverage AND then choose
// the lowest-cost mix (paid staff only where a rule or scarcity requires them).
const workers: Worker[] = [
  {
    id: "worker-1",
    name: "Jordan Lee",
    email: "jordan.lee@example.org",
    phone: "(555) 014-2210",
    workerType: "volunteer",
    roles: ["Welcome Desk", "Food Service"],
    availability: {
      Monday: [{ start: "08:00", end: "13:00" }],
      Wednesday: [{ start: "15:00", end: "20:00" }],
      Friday: [{ start: "08:00", end: "13:00" }],
    },
    preferredDays: ["Monday", "Friday"],
    preferredRoles: ["Welcome Desk"],
    maxShiftsPerWeek: 3,
    desiredHoursPerWeek: 12,
    maxHoursPerWeek: 15,
    reliabilityScore: 4,
    notes: "Prefers morning shifts when possible.",
  },
  {
    id: "worker-2",
    name: "Priya Shah",
    email: "priya.shah@example.org",
    workerType: "volunteer",
    roles: ["Food Service", "Inventory"],
    availability: {
      Monday: [{ start: "08:00", end: "14:00" }],
      Tuesday: [{ start: "09:00", end: "14:00" }],
      Friday: [{ start: "08:00", end: "14:00" }],
    },
    preferredDays: ["Tuesday"],
    preferredRoles: ["Inventory"],
    maxShiftsPerWeek: 3,
    desiredHoursPerWeek: 12,
    maxHoursPerWeek: 15,
    reliabilityScore: 4,
    notes: "Food safety certification on file.",
  },
  {
    id: "worker-3",
    name: "Nia Brooks",
    email: "nia.brooks@example.org",
    workerType: "volunteer",
    roles: ["Welcome Desk", "Inventory", "Food Service", "Event Support"],
    availability: {
      Monday: [{ start: "08:00", end: "13:00" }],
      Tuesday: [{ start: "09:00", end: "14:00" }],
      Wednesday: [{ start: "12:00", end: "20:00" }],
      Thursday: [{ start: "12:00", end: "18:00" }],
    },
    preferredDays: ["Monday", "Wednesday"],
    preferredRoles: ["Welcome Desk"],
    maxShiftsPerWeek: 4,
    desiredHoursPerWeek: 14,
    maxHoursPerWeek: 18,
    reliabilityScore: 5,
    notes: "Bilingual in English and Spanish.",
  },
  {
    id: "worker-4",
    name: "Grace Kim",
    email: "grace.kim@example.org",
    workerType: "volunteer",
    roles: ["Event Support", "Welcome Desk"],
    availability: {
      Wednesday: [{ start: "15:00", end: "20:00" }],
      Thursday: [{ start: "12:00", end: "18:00" }],
      Saturday: [{ start: "09:00", end: "14:00" }],
    },
    preferredDays: ["Thursday"],
    preferredRoles: ["Event Support"],
    maxShiftsPerWeek: 3,
    desiredHoursPerWeek: 10,
    maxHoursPerWeek: 14,
    reliabilityScore: 4,
    notes: "Enjoys event setup and greeting guests.",
  },
  {
    id: "worker-5",
    name: "Maya Thompson",
    email: "maya.thompson@example.org",
    workerType: "paid_employee",
    roles: ["Food Service", "Driver"],
    availability: {
      Monday: [{ start: "08:00", end: "14:00" }],
      Tuesday: [{ start: "09:00", end: "15:00" }],
      Friday: [{ start: "08:00", end: "14:00" }],
      Saturday: [{ start: "07:00", end: "15:00" }],
    },
    preferredDays: ["Saturday"],
    preferredRoles: ["Driver"],
    maxShiftsPerWeek: 5,
    desiredHoursPerWeek: 32,
    maxHoursPerWeek: 40,
    employmentType: "full_time",
    hourlyRate: 19.5,
    reliabilityScore: 5,
    notes: "Has access to a cargo van.",
  },
  {
    id: "worker-6",
    name: "Sam Carter",
    email: "sam.carter@example.org",
    phone: "(555) 019-3482",
    workerType: "paid_employee",
    roles: ["Driver", "Event Support"],
    availability: {
      Thursday: [{ start: "11:00", end: "19:00" }],
      Friday: [{ start: "09:00", end: "15:00" }],
      Saturday: [{ start: "07:00", end: "16:00" }],
    },
    preferredDays: ["Thursday", "Saturday"],
    preferredRoles: ["Event Support"],
    maxShiftsPerWeek: 4,
    desiredHoursPerWeek: 20,
    maxHoursPerWeek: 28,
    employmentType: "part_time",
    hourlyRate: 17,
    reliabilityScore: 3,
    notes: "Can lift up to 40 pounds.",
  },
  {
    id: "worker-7",
    name: "Riley Chen",
    email: "riley.chen@example.org",
    workerType: "paid_employee",
    roles: ["Event Support", "Inventory"],
    availability: {
      Tuesday: [{ start: "09:00", end: "14:00" }],
      Thursday: [{ start: "12:00", end: "18:00" }],
    },
    preferredDays: ["Thursday"],
    preferredRoles: ["Event Support"],
    maxShiftsPerWeek: 4,
    desiredHoursPerWeek: 16,
    maxHoursPerWeek: 22,
    employmentType: "part_time",
    hourlyRate: 16,
    reliabilityScore: 4,
    notes: "Lowest-cost paid backup for Event Support and Inventory.",
  },
  {
    id: "worker-8",
    name: "Alex Rivera",
    email: "alex.rivera@example.org",
    phone: "(555) 010-8824",
    workerType: "supervisor",
    roles: ["Welcome Desk", "Event Support"],
    availability: {
      Wednesday: [{ start: "15:00", end: "20:00" }],
      Thursday: [{ start: "12:00", end: "18:00" }],
    },
    preferredDays: ["Wednesday", "Thursday"],
    preferredRoles: ["Event Support"],
    maxShiftsPerWeek: 5,
    desiredHoursPerWeek: 32,
    maxHoursPerWeek: 40,
    employmentType: "full_time",
    hourlyRate: 24,
    reliabilityScore: 5,
    notes: "Team lead for evening programs.",
  },
  {
    id: "worker-9",
    name: "Devin Park",
    email: "devin.park@example.org",
    workerType: "supervisor",
    roles: ["Event Support", "Welcome Desk", "Food Service"],
    availability: {
      Monday: [{ start: "08:00", end: "14:00" }],
      Wednesday: [{ start: "15:00", end: "20:00" }],
      Thursday: [{ start: "12:00", end: "18:00" }],
      Friday: [{ start: "09:00", end: "15:00" }],
    },
    preferredDays: ["Thursday"],
    preferredRoles: ["Event Support"],
    maxShiftsPerWeek: 4,
    desiredHoursPerWeek: 18,
    maxHoursPerWeek: 24,
    employmentType: "part_time",
    hourlyRate: 22,
    reliabilityScore: 4,
    notes: "Second supervisor so leadership coverage never depends on one person.",
  },
];

export function createTestStaff(): Worker[] {
  const operatingAvailability = Object.fromEntries(
    DAYS.map((day) => [day, [{ start: "08:00", end: "18:00" }]]),
  ) as Worker["availability"];
  const core = [
    ["Test Manager A", "test.manager.a@example.org", "supervisor", "full_time", 25, 40, 40],
    ["Test Manager B", "test.manager.b@example.org", "supervisor", "full_time", 25, 40, 40],
    ["Test Manager C", "test.manager.c@example.org", "supervisor", "full_time", 25, 40, 40],
    ["Test Employee A", "test.employee.a@example.org", "paid_employee", "full_time", 20, 40, 40],
    ["Test Employee B", "test.employee.b@example.org", "paid_employee", "full_time", 20, 40, 40],
    ["Test Employee C", "test.employee.c@example.org", "paid_employee", "full_time", 20, 40, 40],
    ["Test Employee D", "test.employee.d@example.org", "paid_employee", "part_time", 18, 30, 30],
    ["Test Employee E", "test.employee.e@example.org", "paid_employee", "part_time", 18, 30, 30],
  ] as const;
  const paid = core.map(([name, email, workerType, employmentType, hourlyRate, desiredHoursPerWeek, maxHoursPerWeek], index): Worker => ({
    id: `test-company-staff-${index + 1}`,
    name,
    email,
    workerType,
    roles: ["General Operations"],
    availability: operatingAvailability,
    preferredDays: [],
    preferredRoles: ["General Operations"],
    maxShiftsPerWeek: 5,
    desiredHoursPerWeek,
    maxHoursPerWeek,
    employmentType,
    hourlyRate,
    reliabilityScore: 4,
    notes: workerType === "supervisor" ? "Full-time manager in the staggered roster." : `${employmentType === "full_time" ? "Full-time" : "Part-time"} staggered-roster employee.`,
  }));
  const volunteers: Worker[] = [
    {
      id: "test-company-volunteer-1",
      name: "Test Volunteer A",
      email: "test.volunteer.a@example.org",
      workerType: "volunteer",
      roles: ["General Operations"],
      availability: Object.fromEntries(DAYS.map((day) => [day, [{ start: "10:00", end: "14:00" }]])) as Worker["availability"],
      preferredDays: ["Wednesday", "Friday"],
      preferredRoles: ["General Operations"],
      maxShiftsPerWeek: 2,
      desiredHoursPerWeek: 4,
      maxHoursPerWeek: 8,
      reliabilityScore: 4,
      notes: "Prefers a four-hour midday support block.",
    },
    {
      id: "test-company-volunteer-2",
      name: "Test Volunteer B",
      email: "test.volunteer.b@example.org",
      workerType: "volunteer",
      roles: ["General Operations"],
      availability: Object.fromEntries(DAYS.map((day) => [day, [{ start: "10:00", end: "14:00" }]])) as Worker["availability"],
      preferredDays: ["Thursday", "Saturday"],
      preferredRoles: ["General Operations"],
      maxShiftsPerWeek: 2,
      desiredHoursPerWeek: 4,
      maxHoursPerWeek: 8,
      reliabilityScore: 5,
      notes: "Prefers a four-hour midday support block.",
    },
  ];
  return [...paid, ...volunteers];
}

export function createTestStaffShifts(): Shift[] {
  const firstDay = nextMonday();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(date.getDate() + index);
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });

    return {
      id: `test-company-shift-${index + 1}`,
      title: `Daily Operations — ${dayName}`,
      date: toLocalDate(date),
      startTime: "08:00",
      endTime: "18:00",
      location: "Main Company Office",
      requiredRole: "General Operations",
      requiredWorkers: 6,
      requiresSupervisor: true,
      staffingMode: "daily_roster",
      requiredSupervisors: 2,
      maxDailyWorkers: 6,
      requiredWorkerHours: 44,
      minPaidStaff: 5,
      maxPaidStaff: 6,
      priority: "Normal",
      notes: "Daily roster: full-time staff work 8:00–4:00 or 10:00–6:00, part-time staff work 8:00–2:00, with at least two managers and six people scheduled.",
    };
  });
}

const shiftTemplates: Omit<Shift, "date">[] = [
  {
    id: "shift-1",
    title: "Community Pantry Morning",
    startTime: "09:00",
    endTime: "12:00",
    location: "Northside Resource Center",
    requiredRole: "Food Service",
    requiredWorkers: 3,
    requiresSupervisor: false,
    priority: "Normal",
    notes: "Help prepare and distribute grocery boxes.",
  },
  {
    id: "shift-2",
    title: "Donation Intake",
    startTime: "10:00",
    endTime: "13:00",
    location: "Main Warehouse",
    requiredRole: "Inventory",
    requiredWorkers: 2,
    requiresSupervisor: false,
    priority: "Normal",
    notes: "Sort and label incoming donations.",
  },
  {
    id: "shift-3",
    title: "Family Resource Night",
    startTime: "16:00",
    endTime: "19:00",
    location: "East Hall",
    requiredRole: "Welcome Desk",
    requiredWorkers: 2,
    requiresSupervisor: true,
    minPaidStaff: 1,
    priority: "High",
    notes: "Check in guests and share program information.",
  },
  {
    id: "shift-4",
    title: "Benefit Event Setup",
    startTime: "13:00",
    endTime: "17:00",
    location: "Riverside Community Room",
    requiredRole: "Event Support",
    requiredWorkers: 3,
    requiresSupervisor: true,
    minPaidStaff: 1,
    maxPaidStaff: 2,
    priority: "Normal",
    notes: "Arrange tables, signage, and welcome materials.",
  },
  {
    id: "shift-5",
    title: "Mobile Market Pop-up",
    startTime: "09:00",
    endTime: "13:00",
    location: "Eastside Parking Lot",
    requiredRole: "Food Service",
    requiredWorkers: 2,
    requiresSupervisor: false,
    priority: "Normal",
    notes: "Set up and staff the Friday mobile produce market.",
  },
  {
    id: "shift-6",
    title: "Neighborhood Delivery Route",
    startTime: "09:00",
    endTime: "13:00",
    location: "Main Warehouse",
    requiredRole: "Driver",
    requiredWorkers: 2,
    requiresSupervisor: false,
    priority: "Low",
    notes: "Deliver pre-packed grocery boxes to four stops.",
  },
];

// Monday through Saturday — one shift per day, including Friday.
const shiftDayOffsets = [0, 1, 2, 3, 4, 5];

export function createSampleData(): VolunteerMatcherData {
  const weekStart = nextMonday();

  return {
    workers,
    shifts: shiftTemplates.map((shift, index) => ({
      ...shift,
      date: toLocalDate(
        new Date(
          weekStart.getFullYear(),
          weekStart.getMonth(),
          weekStart.getDate() + shiftDayOffsets[index],
        ),
      ),
    })),
    assignments: [],
    isSampleData: true,
  };
}
