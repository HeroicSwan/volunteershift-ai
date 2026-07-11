import { toLocalIsoDate } from "./utils";
import {
  AVAILABILITY_BLOCKS,
  AVAILABILITY_TIMES,
  DAYS,
  EMPLOYMENT_TYPE_LABELS,
  SHIFT_PRIORITIES,
  WORKER_TYPE_LABELS,
  isPaidWorker,
  type AvailabilityBlock,
  type DayOfWeek,
  type EmploymentType,
  type ScheduleAssignment,
  type Shift,
  type ShiftInput,
  type TimeBlock,
  type Worker,
  type WorkerInput,
  type WorkerType,
} from "../types";

export type CsvRowError = {
  row: number;
  messages: string[];
};

export type CsvImportResult<T> = {
  fileError?: string;
  rows: T[];
  rowErrors: CsvRowError[];
};

export const WORKER_CSV_FIELDS = [
  "name",
  "email",
  "phone",
  "workerType",
  "roles",
  "availableDays",
  "availableTimeBlocks",
  "preferredDays",
  "preferredRoles",
  "maxShiftsPerWeek",
  "desiredHoursPerWeek",
  "maxHoursPerWeek",
  "employmentType",
  "hourlyRate",
  "reliabilityScore",
  "notes",
] as const;

const WORKER_IMPORT_FIELDS = [...WORKER_CSV_FIELDS, "hoursPerWeek"] as const;

// workerType, hourlyRate, and reliabilityScore are optional columns so CSV
// files exported before the Worker upgrade still import cleanly.
const WORKER_REQUIRED_FIELDS = [
  "name",
  "email",
  "phone",
  "roles",
  "availableDays",
  "availableTimeBlocks",
  "preferredDays",
  "preferredRoles",
  "maxShiftsPerWeek",
  "notes",
];

export const SHIFT_CSV_FIELDS = [
  "title",
  "date",
  "startTime",
  "endTime",
  "location",
  "requiredRole",
  "requiredWorkers",
  "requiresSupervisor",
  "staffingMode",
  "requiredSupervisors",
  "maxDailyWorkers",
  "requiredWorkerHours",
  "minPaidStaff",
  "maxPaidStaff",
  "priority",
  "notes",
] as const;

const SHIFT_REQUIRED_FIELDS = [
  "title",
  "date",
  "startTime",
  "endTime",
  "location",
  "requiredRole",
  "requiredWorkers",
  "priority",
  "notes",
];

const SHIFT_HEADER_ALIASES: Record<string, string> = {
  requiredvolunteers: "requiredWorkers",
};

export const SCHEDULE_CSV_FIELDS = [
  "date",
  "startTime",
  "endTime",
  "shiftTitle",
  "location",
  "requiredRole",
  "volunteerName",
  "volunteerEmail",
  "matchScore",
  "reasons",
  "warnings",
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WORKER_TYPE_ALIASES: Record<string, WorkerType> = {
  volunteer: "volunteer",
  paidemployee: "paid_employee",
  paidstaff: "paid_employee",
  paid: "paid_employee",
  employee: "paid_employee",
  supervisor: "supervisor",
  supervisorlead: "supervisor",
  lead: "supervisor",
};

const EMPLOYMENT_TYPE_ALIASES: Record<string, EmploymentType> = {
  parttime: "part_time",
  parttimeemployee: "part_time",
  fulltime: "full_time",
  fulltimeemployee: "full_time",
};

export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function isEmptyRow(cells: string[]) {
  return cells.every((cell) => cell.trim() === "");
}

function escapeCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([String.fromCharCode(0xfeff), content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function csvExportFilename(prefix: string) {
  return `${prefix}-${toLocalIsoDate(new Date())}.csv`;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readHeader(cells: string[], fields: readonly string[], aliases: Record<string, string>) {
  const fieldByNormalized = new Map(fields.map((field) => [normalizeHeader(field), field]));
  for (const [alias, field] of Object.entries(aliases)) fieldByNormalized.set(alias, field);
  const columnIndex = new Map<string, number>();

  cells.forEach((cell, index) => {
    const field = fieldByNormalized.get(normalizeHeader(cell));
    if (field && !columnIndex.has(field)) columnIndex.set(field, index);
  });

  return columnIndex;
}

function headerError(missing: string[]) {
  return `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Download the sample template to see the expected format.`;
}

function splitList(value: string) {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchOption<T extends string>(value: string, options: readonly T[]) {
  const normalized = value.trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized);
}

function parseIntCell(value: string) {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined;
}

function parseRateCell(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : undefined;
}

function parseScoreCell(value: string) {
  const trimmed = value.trim();
  if (!/^\d(\.\d)?$/.test(trimmed)) return undefined;
  const score = Number(trimmed);
  return score >= 1 && score <= 5 ? score : undefined;
}

function parseBoolCell(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0", ""].includes(normalized)) return false;
  return undefined;
}

function parseWorkerTypeCell(value: string) {
  return WORKER_TYPE_ALIASES[normalizeHeader(value)];
}

function parseEmploymentTypeCell(value: string) {
  return EMPLOYMENT_TYPE_ALIASES[normalizeHeader(value)];
}

function parseDateCell(value: string) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!iso && !us) return undefined;

  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(us![3]), Number(us![1]), Number(us![2])];
  const date = new Date(year, month - 1, day);
  const isRealDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  return isRealDate ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined;
}

function parseTimeCell(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i.exec(value.trim());
  if (!match) return undefined;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minutes > 59) return undefined;

  if (meridiem) {
    if (hours < 1 || hours > 12) return undefined;
    if (meridiem === "p" && hours !== 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return undefined;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type ParsedTable = {
  fileError?: string;
  columnIndex: Map<string, number>;
  dataRows: Array<{ row: number; cells: string[] }>;
};

function readTable(
  text: string,
  fields: readonly string[],
  required: readonly string[] = fields,
  aliases: Record<string, string> = {},
): ParsedTable {
  const empty = { columnIndex: new Map<string, number>(), dataRows: [] };
  const table = parseCsv(text);
  const headerRowIndex = table.findIndex((cells) => !isEmptyRow(cells));

  if (headerRowIndex === -1) {
    return { ...empty, fileError: "The file is empty." };
  }

  const columnIndex = readHeader(table[headerRowIndex], fields, aliases);
  const missing = required.filter((field) => !columnIndex.has(field));
  if (missing.length > 0) {
    return { ...empty, fileError: headerError(missing) };
  }

  const dataRows = table
    .map((cells, index) => ({ row: index + 1, cells }))
    .slice(headerRowIndex + 1)
    .filter(({ cells }) => !isEmptyRow(cells));

  if (dataRows.length === 0) {
    return { ...empty, columnIndex, fileError: "No data rows found below the header row." };
  }

  return { columnIndex, dataRows };
}

function cellReader(cells: string[], columnIndex: Map<string, number>) {
  return (field: string) => {
    const index = columnIndex.get(field);
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };
}

export function parseWorkersCsv(text: string): CsvImportResult<WorkerInput> {
  const { fileError, columnIndex, dataRows } = readTable(text, WORKER_IMPORT_FIELDS, WORKER_REQUIRED_FIELDS);
  if (fileError) return { fileError, rows: [], rowErrors: [] };

  const rows: WorkerInput[] = [];
  const rowErrors: CsvRowError[] = [];

  for (const { row, cells } of dataRows) {
    const getCell = cellReader(cells, columnIndex);
    const errors: string[] = [];

    const name = getCell("name");
    if (!name) errors.push("Name is required.");

    const email = getCell("email");
    if (!email) errors.push("Email is required.");
    else if (!EMAIL_PATTERN.test(email)) errors.push(`"${email}" is not a valid email address.`);

    const typeCell = getCell("workerType");
    const workerType = typeCell ? parseWorkerTypeCell(typeCell) : "volunteer";
    if (!workerType) {
      errors.push(`"${typeCell}" is not a valid worker type. Use Volunteer, Paid Employee, or Supervisor.`);
    }

    const roles: string[] = [];
    for (const item of splitList(getCell("roles"))) {
      if (!roles.some((role) => role.toLowerCase() === item.toLowerCase())) roles.push(item);
    }
    if (roles.length === 0) errors.push("List at least one role.");

    const availableDays: DayOfWeek[] = [];
    const dayItems = splitList(getCell("availableDays"));
    if (dayItems.length === 0) errors.push("List at least one available day.");
    for (const item of dayItems) {
      const day = matchOption(item, DAYS);
      if (!day) errors.push(`"${item}" is not a valid day. Use full day names like Monday.`);
      else if (!availableDays.includes(day)) availableDays.push(day);
    }

    const availableBlocks: AvailabilityBlock[] = [];
    const blockItems = splitList(getCell("availableTimeBlocks"));
    if (blockItems.length === 0) errors.push("List at least one time block (Morning, Afternoon, or Evening).");
    for (const item of blockItems) {
      const block = matchOption(item, AVAILABILITY_BLOCKS);
      if (!block) errors.push(`"${item}" is not a valid time block. Use Morning, Afternoon, or Evening.`);
      else if (!availableBlocks.includes(block)) availableBlocks.push(block);
    }

    const preferredDays: DayOfWeek[] = [];
    for (const item of splitList(getCell("preferredDays"))) {
      const day = matchOption(item, DAYS);
      if (!day) errors.push(`Preferred day "${item}" is not a valid day. Use full day names like Monday.`);
      else if (!preferredDays.includes(day)) preferredDays.push(day);
    }

    const preferredRoles: string[] = [];
    for (const item of splitList(getCell("preferredRoles"))) {
      const role = roles.find((candidate) => candidate.toLowerCase() === item.toLowerCase());
      if (!role) errors.push(`Preferred role "${item}" is not listed in roles.`);
      else if (!preferredRoles.includes(role)) preferredRoles.push(role);
    }

    const maxShiftsPerWeek = parseIntCell(getCell("maxShiftsPerWeek"));
    if (maxShiftsPerWeek === undefined || maxShiftsPerWeek < 1 || maxShiftsPerWeek > 14) {
      errors.push("Max shifts per week must be a whole number between 1 and 14.");
    }

    const legacyHoursCell = getCell("hoursPerWeek");
    const defaultHours = Math.min(40, (maxShiftsPerWeek ?? 1) * 4);
    const desiredHoursCell = getCell("desiredHoursPerWeek") || legacyHoursCell;
    const maxHoursCell = getCell("maxHoursPerWeek") || legacyHoursCell;
    const desiredHoursPerWeek = desiredHoursCell ? parseRateCell(desiredHoursCell) : defaultHours;
    const maxHoursPerWeek = maxHoursCell ? parseRateCell(maxHoursCell) : defaultHours;
    if (desiredHoursPerWeek === undefined || desiredHoursPerWeek < 1 || desiredHoursPerWeek > 40) {
      errors.push("Desired hours per week must be a number between 1 and 40.");
    }
    if (maxHoursPerWeek === undefined || maxHoursPerWeek < 1 || maxHoursPerWeek > 40) {
      errors.push("Maximum hours per week must be a number between 1 and 40.");
    }
    if (
      desiredHoursPerWeek !== undefined &&
      maxHoursPerWeek !== undefined &&
      desiredHoursPerWeek > maxHoursPerWeek
    ) {
      errors.push("Desired hours cannot exceed maximum hours.");
    }

    const employmentCell = getCell("employmentType");
    const employmentType = employmentCell
      ? parseEmploymentTypeCell(employmentCell)
      : workerType && isPaidWorker(workerType)
        ? "part_time"
        : undefined;
    if (employmentCell && !employmentType) {
      errors.push(`"${employmentCell}" is not a valid employment status. Use Part-time or Full-time.`);
    } else if (workerType && isPaidWorker(workerType) && columnIndex.has("employmentType") && !employmentCell) {
      errors.push("Employment status is required for paid staff.");
    }
    if (employmentType === "part_time" && maxHoursPerWeek !== undefined && maxHoursPerWeek > 30) {
      errors.push("Part-time staff maximum hours cannot exceed 30 per week.");
    }

    const rateCell = getCell("hourlyRate");
    const hourlyRate = rateCell ? parseRateCell(rateCell) : undefined;
    if (rateCell && hourlyRate === undefined) {
      errors.push(`"${rateCell}" is not a valid hourly rate. Use a number like 18.50.`);
    }

    const scoreCell = getCell("reliabilityScore");
    const reliabilityScore = scoreCell ? parseScoreCell(scoreCell) : undefined;
    if (scoreCell && reliabilityScore === undefined) {
      errors.push(`"${scoreCell}" is not a valid reliability score. Use a number from 1 to 5.`);
    }

    const notes = getCell("notes");
    if (notes.length > 500) errors.push("Notes must be 500 characters or fewer.");

    if (errors.length > 0) {
      rowErrors.push({ row, messages: errors });
      continue;
    }

    rows.push({
      name,
      email,
      phone: getCell("phone") || undefined,
      workerType: workerType!,
      roles,
      availability: Object.fromEntries(
        availableDays.map((day) => [day, availableBlocks.map((block) => ({ ...AVAILABILITY_TIMES[block] }))]),
      ),
      preferredDays,
      preferredRoles,
      maxShiftsPerWeek: maxShiftsPerWeek!,
      desiredHoursPerWeek: desiredHoursPerWeek!,
      maxHoursPerWeek: maxHoursPerWeek!,
      employmentType,
      hourlyRate,
      reliabilityScore,
      notes,
    });
  }

  return { rows, rowErrors };
}

export function parseShiftsCsv(text: string): CsvImportResult<ShiftInput> {
  const { fileError, columnIndex, dataRows } = readTable(
    text,
    SHIFT_CSV_FIELDS,
    SHIFT_REQUIRED_FIELDS,
    SHIFT_HEADER_ALIASES,
  );
  if (fileError) return { fileError, rows: [], rowErrors: [] };

  const rows: ShiftInput[] = [];
  const rowErrors: CsvRowError[] = [];

  for (const { row, cells } of dataRows) {
    const getCell = cellReader(cells, columnIndex);
    const errors: string[] = [];

    const title = getCell("title");
    if (!title) errors.push("Title is required.");

    const dateCell = getCell("date");
    const date = parseDateCell(dateCell);
    if (!date) errors.push(dateCell ? `"${dateCell}" is not a valid date. Use YYYY-MM-DD.` : "Date is required.");

    const startCell = getCell("startTime");
    const startTime = parseTimeCell(startCell);
    if (!startTime) {
      errors.push(startCell ? `"${startCell}" is not a valid start time. Use 24-hour HH:MM.` : "Start time is required.");
    }

    const endCell = getCell("endTime");
    const endTime = parseTimeCell(endCell);
    if (!endTime) {
      errors.push(endCell ? `"${endCell}" is not a valid end time. Use 24-hour HH:MM.` : "End time is required.");
    }
    if (startTime && endTime && endTime <= startTime) errors.push("End time must be after the start time.");

    const location = getCell("location");
    if (!location) errors.push("Location is required.");

    const requiredRole = getCell("requiredRole");
    if (!requiredRole) errors.push("Required role is required.");

    const requiredWorkers = parseIntCell(getCell("requiredWorkers"));
    if (requiredWorkers === undefined || requiredWorkers < 1 || requiredWorkers > 100) {
      errors.push("Workers needed must be a whole number between 1 and 100.");
    }

    const supervisorCell = getCell("requiresSupervisor");
    const requiresSupervisor = parseBoolCell(supervisorCell);
    if (requiresSupervisor === undefined) {
      errors.push(`"${supervisorCell}" is not a valid requires-supervisor value. Use yes or no.`);
    }

    const staffingModeCell = getCell("staffingMode").toLowerCase().replaceAll(" ", "_");
    const staffingMode = staffingModeCell === "daily_roster" ? "daily_roster" : "continuous";
    if (staffingModeCell && !["continuous", "daily_roster"].includes(staffingModeCell)) {
      errors.push(`"${getCell("staffingMode")}" is not a valid staffing mode. Use Continuous or Daily roster.`);
    }
    const requiredSupervisorsCell = getCell("requiredSupervisors");
    const requiredSupervisors = requiredSupervisorsCell ? parseIntCell(requiredSupervisorsCell) : (requiresSupervisor ? 1 : 0);
    if (requiredSupervisors === undefined || requiredSupervisors < 0 || requiredSupervisors > (requiredWorkers ?? 0)) {
      errors.push("Required supervisors must be between 0 and the workers needed.");
    }
    const maxDailyWorkersCell = getCell("maxDailyWorkers");
    const maxDailyWorkers = maxDailyWorkersCell ? parseIntCell(maxDailyWorkersCell) : undefined;
    if (maxDailyWorkersCell && (maxDailyWorkers === undefined || maxDailyWorkers < (requiredWorkers ?? 1))) {
      errors.push("Maximum daily workers must be at least the workers needed.");
    }
    const requiredWorkerHoursCell = getCell("requiredWorkerHours");
    const requiredWorkerHours = requiredWorkerHoursCell ? parseRateCell(requiredWorkerHoursCell) : undefined;
    if (requiredWorkerHoursCell && (requiredWorkerHours === undefined || requiredWorkerHours < 1)) {
      errors.push("Required worker-hours must be a positive number.");
    }

    const minPaidCell = getCell("minPaidStaff");
    const minPaidStaff = minPaidCell ? parseIntCell(minPaidCell) : undefined;
    if (minPaidCell && minPaidStaff === undefined) {
      errors.push(`"${minPaidCell}" is not a valid minimum paid staff count. Use a whole number.`);
    }

    const maxPaidCell = getCell("maxPaidStaff");
    const maxPaidStaff = maxPaidCell ? parseIntCell(maxPaidCell) : undefined;
    if (maxPaidCell && maxPaidStaff === undefined) {
      errors.push(`"${maxPaidCell}" is not a valid maximum paid staff count. Use a whole number.`);
    }

    if (minPaidStaff !== undefined && requiredWorkers !== undefined && minPaidStaff > requiredWorkers) {
      errors.push("Minimum paid staff cannot exceed the workers needed.");
    }
    if (minPaidStaff !== undefined && maxPaidStaff !== undefined && minPaidStaff > maxPaidStaff) {
      errors.push("Minimum paid staff cannot exceed the maximum paid staff.");
    }

    const priorityCell = getCell("priority");
    const priority = priorityCell
      ? (matchOption(priorityCell, SHIFT_PRIORITIES) ?? (priorityCell.toLowerCase() === "medium" ? "Normal" : undefined))
      : "Normal";
    if (!priority) errors.push(`"${priorityCell}" is not a valid priority. Use Low, Normal, High, or Urgent.`);

    const notes = getCell("notes");
    if (notes.length > 500) errors.push("Notes must be 500 characters or fewer.");

    if (errors.length > 0) {
      rowErrors.push({ row, messages: errors });
      continue;
    }

    rows.push({
      title,
      date: date!,
      startTime: startTime!,
      endTime: endTime!,
      location,
      requiredRole,
      requiredWorkers: requiredWorkers!,
      requiresSupervisor: requiresSupervisor!,
      staffingMode,
      requiredSupervisors: requiredSupervisors!,
      maxDailyWorkers,
      requiredWorkerHours,
      minPaidStaff,
      maxPaidStaff,
      priority: priority!,
      notes,
    });
  }

  return { rows, rowErrors };
}

function getBlockLabel(block: TimeBlock): AvailabilityBlock {
  const hour = Number(block.start.split(":")[0]);
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function workersToCsv(workers: Worker[]): string {
  const rows = workers.map((worker) => {
    const availableDays = DAYS.filter((day) => (worker.availability[day] ?? []).length > 0);
    const blockLabels = new Set(
      availableDays.flatMap((day) => (worker.availability[day] ?? []).map(getBlockLabel)),
    );

    return [
      worker.name,
      worker.email,
      worker.phone ?? "",
      WORKER_TYPE_LABELS[worker.workerType],
      worker.roles.join(";"),
      availableDays.join(";"),
      AVAILABILITY_BLOCKS.filter((block) => blockLabels.has(block)).join(";"),
      worker.preferredDays.join(";"),
      worker.preferredRoles.join(";"),
      worker.maxShiftsPerWeek,
      worker.desiredHoursPerWeek,
      worker.maxHoursPerWeek,
      isPaidWorker(worker.workerType) && worker.employmentType
        ? EMPLOYMENT_TYPE_LABELS[worker.employmentType]
        : "",
      worker.hourlyRate ?? "",
      worker.reliabilityScore ?? "",
      worker.notes,
    ];
  });

  return toCsv([[...WORKER_CSV_FIELDS], ...rows]);
}

export function shiftsToCsv(shifts: Shift[]): string {
  const rows = [...shifts]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title))
    .map((shift) => [
      shift.title,
      shift.date,
      shift.startTime,
      shift.endTime,
      shift.location,
      shift.requiredRole,
      shift.requiredWorkers,
      shift.requiresSupervisor ? "yes" : "no",
      shift.staffingMode === "daily_roster" ? "Daily roster" : "Continuous",
      shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0),
      shift.maxDailyWorkers ?? "",
      shift.requiredWorkerHours ?? "",
      shift.minPaidStaff ?? "",
      shift.maxPaidStaff ?? "",
      shift.priority,
      shift.notes,
    ]);

  return toCsv([[...SHIFT_CSV_FIELDS], ...rows]);
}

export function scheduleToCsv(assignments: ScheduleAssignment[]): string {
  const rows = [...assignments]
    .sort(
      (a, b) =>
        a.shift.date.localeCompare(b.shift.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.shift.title.localeCompare(b.shift.title) ||
        a.worker.name.localeCompare(b.worker.name),
    )
    .map((assignment) => [
      assignment.shift.date,
      assignment.startTime,
      assignment.endTime,
      assignment.shift.title,
      assignment.shift.location,
      assignment.shift.requiredRole,
      assignment.worker.name,
      assignment.worker.email,
      assignment.matchScore,
      assignment.reasons.join("; "),
      assignment.warnings.join("; "),
    ]);

  return toCsv([[...SCHEDULE_CSV_FIELDS], ...rows]);
}

function upcomingMonday() {
  const date = new Date();
  const daysUntil = ((1 - date.getDay() + 7) % 7) || 7;
  date.setDate(date.getDate() + daysUntil);
  return date;
}

export function buildWorkersTemplate(): string {
  return toCsv([
    [...WORKER_CSV_FIELDS],
    [
      "Jordan Lee",
      "jordan.lee@example.org",
      "(555) 014-2210",
      "Volunteer",
      "Welcome Desk;Food Service",
      "Monday;Thursday",
      "Morning;Afternoon",
      "Monday",
      "Welcome Desk",
      "2",
      "8",
      "10",
      "",
      "",
      "4",
      "Prefers morning shifts.",
    ],
    [
      "Maya Thompson",
      "maya.thompson@example.org",
      "",
      "Paid Employee",
      "Driver",
      "Saturday;Sunday",
      "Morning",
      "Saturday",
      "Driver",
      "3",
      "32",
      "40",
      "Full-time",
      "19.50",
      "5",
      "Has access to a cargo van.",
    ],
    [
      "Alex Rivera",
      "alex.rivera@example.org",
      "",
      "Supervisor",
      "Event Support;Welcome Desk",
      "Wednesday;Thursday",
      "Afternoon;Evening",
      "Wednesday",
      "Event Support",
      "4",
      "32",
      "40",
      "Full-time",
      "24",
      "5",
      "Team lead for evening programs.",
    ],
  ]);
}

export function buildShiftsTemplate(): string {
  const monday = upcomingMonday();
  const wednesday = new Date(monday);
  wednesday.setDate(wednesday.getDate() + 2);

  return toCsv([
    [...SHIFT_CSV_FIELDS],
    [
      "Community Pantry Morning",
      toLocalIsoDate(monday),
      "09:00",
      "12:00",
      "Northside Resource Center",
      "Food Service",
      "3",
      "no",
      "Continuous",
      "0",
      "",
      "",
      "",
      "",
      "Urgent",
      "Help prepare and distribute grocery boxes.",
    ],
    [
      "Family Resource Night",
      toLocalIsoDate(wednesday),
      "16:00",
      "19:00",
      "East Hall",
      "Welcome Desk",
      "2",
      "yes",
      "Continuous",
      "1",
      "",
      "",
      "1",
      "2",
      "High",
      "Check in guests and share program information.",
    ],
  ]);
}
