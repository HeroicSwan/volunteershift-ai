"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Download, FilterX, MapPin, Pencil, Plus, Trash2, Upload, UsersRound } from "lucide-react";
import { CsvImportDialog } from "@/components/csv/import-dialog";
import { ShiftFormDialog } from "@/components/shifts/shift-form-dialog";
import { useVolunteerMatcherData } from "@/components/data-provider";
import { SeedDataButton } from "@/components/seed-data-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { buildShiftsTemplate, csvExportFilename, downloadCsv, parseShiftsCsv, shiftsToCsv } from "@/lib/csv";
import { formatDate, formatTime } from "@/lib/utils";
import { SHIFT_PRIORITIES, type Shift, type ShiftInput, type ShiftPriority } from "@/types";

const priorityTone = {
  Urgent: "clay",
  High: "clay",
  Normal: "sage",
  Low: "oat",
} as const;

function paidStaffRule(shift: Shift) {
  if (shift.minPaidStaff !== undefined && shift.maxPaidStaff !== undefined) {
    return `${shift.minPaidStaff}–${shift.maxPaidStaff} paid staff`;
  }
  if (shift.minPaidStaff !== undefined) return `At least ${shift.minPaidStaff} paid staff`;
  if (shift.maxPaidStaff !== undefined) return `Up to ${shift.maxPaidStaff} paid staff`;
  return null;
}

function ShiftActions({ shift, onEdit, onDelete }: { shift: Shift; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <IconButton type="button" aria-label={`Edit ${shift.title}`} onClick={onEdit}>
        <Pencil size={16} />
      </IconButton>
      <ConfirmDialog
        trigger={
          <IconButton type="button" aria-label={`Delete ${shift.title}`} className="hover:text-terracotta-dark">
            <Trash2 size={16} />
          </IconButton>
        }
        title={`Delete ${shift.title}?`}
        description="This removes the shift and any schedule assignments connected to it. This action cannot be undone."
        confirmLabel="Delete shift"
        onConfirm={onDelete}
      />
    </div>
  );
}

export default function ShiftsPage() {
  const { shifts, workers, hydrated, addShift, updateShift, deleteShift, importShifts } = useVolunteerMatcherData();
  const [dateFilter, setDateFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<ShiftPriority | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift>();

  const roleOptions = useMemo(
    () => [...new Set([...shifts.map((shift) => shift.requiredRole), ...workers.flatMap((worker) => worker.roles)])].sort(),
    [shifts, workers],
  );
  const existingShiftKeys = useMemo(
    () => new Set(shifts.map((shift) => `${shift.title.trim().toLowerCase()}|${shift.date}|${shift.startTime}`)),
    [shifts],
  );
  const filteredShifts = useMemo(
    () =>
      [...shifts]
        .filter(
          (shift) =>
            (!dateFilter || shift.date === dateFilter) &&
            (!roleFilter || shift.requiredRole === roleFilter) &&
            (!priorityFilter || shift.priority === priorityFilter),
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [dateFilter, priorityFilter, roleFilter, shifts],
  );

  if (!hydrated) {
    return <PageLoading label="Loading shifts" />;
  }

  function openAddForm() {
    setEditingShift(undefined);
    setFormOpen(true);
  }

  function openEditForm(shift: Shift) {
    setEditingShift(shift);
    setFormOpen(true);
  }

  function saveShift(input: ShiftInput) {
    if (editingShift) updateShift(editingShift.id, input);
    else addShift(input);
  }

  function clearFilters() {
    setDateFilter("");
    setRoleFilter("");
    setPriorityFilter("");
  }

  function exportCsv() {
    downloadCsv(csvExportFilename("shifts"), shiftsToCsv(shifts));
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Shifts"
        description="Manage staffing needs, required roles, locations, and priority."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {shifts.length > 0 && <Badge tone="moss" className="min-h-10 px-4 text-sm">{shifts.length} shifts</Badge>}
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={16} /> Import CSV
            </Button>
            {shifts.length > 0 && (
              <Button variant="secondary" onClick={exportCsv}>
                <Download size={16} /> Export CSV
              </Button>
            )}
            <Button onClick={openAddForm}>
              <Plus size={17} /> Add shift
            </Button>
          </div>
        }
      />

      {shifts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Add your first shift"
          description="Create a shift with its date, time, location, required role, staffing target, and priority."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={openAddForm}>
                <Plus size={17} /> Add shift
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={17} /> Import CSV
              </Button>
              <SeedDataButton variant="secondary" />
            </div>
          }
        />
      ) : (
        <>
          <Card className="p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
              <div>
                <label htmlFor="filter-shift-date" className="mb-2 block text-xs font-semibold text-ink-soft">Date</label>
                <Input id="filter-shift-date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
              </div>
              <div>
                <label htmlFor="filter-shift-role" className="mb-2 block text-xs font-semibold text-ink-soft">Role</label>
                <Select id="filter-shift-role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="">All roles</option>
                  {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="filter-shift-priority" className="mb-2 block text-xs font-semibold text-ink-soft">Priority</label>
                <Select
                  id="filter-shift-priority"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value as ShiftPriority | "")}
                >
                  <option value="">All priorities</option>
                  {SHIFT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 xl:justify-end">
                <p className="text-xs font-semibold text-ink-soft">{filteredShifts.length} of {shifts.length} shown</p>
                {(dateFilter || roleFilter || priorityFilter) && (
                  <Button variant="quiet" onClick={clearFilters}>
                    <FilterX size={16} /> Clear
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {filteredShifts.length === 0 ? (
            <EmptyState
              icon={FilterX}
              title="No shifts match these filters"
              description="Try another date, role, or priority, or clear the filters to see every shift."
              action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredShifts.map((shift) => (
                <Card key={shift.id} className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={priorityTone[shift.priority]}>{shift.priority} priority</Badge>
                        <Badge tone="sage">{shift.requiredRole}</Badge>
                        {shift.staffingMode === "daily_roster" && <Badge tone="sage">Daily roster</Badge>}
                        {(shift.requiredSupervisors ?? (shift.requiresSupervisor ? 1 : 0)) > 0 && (
                          <Badge tone="moss">{shift.requiredSupervisors ?? 1} manager{(shift.requiredSupervisors ?? 1) === 1 ? "" : "s"} per day</Badge>
                        )}
                        {paidStaffRule(shift) && <Badge tone="oat">{paidStaffRule(shift)}</Badge>}
                      </div>
                      <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-ink">{shift.title}</h2>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="rounded-2xl bg-moss px-3.5 py-3 text-center text-sand">
                        <span className="block text-lg font-semibold leading-none">{formatDate(shift.date, { day: "2-digit", month: undefined, year: undefined })}</span>
                        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-sand/80">{formatDate(shift.date, { month: "short", day: undefined, year: undefined })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 text-sm text-ink-soft sm:grid-cols-2">
                    <p className="flex items-center gap-2"><Clock3 size={16} className="text-moss" />{formatTime(shift.startTime)}–{formatTime(shift.endTime)}</p>
                    <p className="flex items-center gap-2 sm:justify-end"><UsersRound size={16} className="text-moss" />{shift.requiredWorkers} {shift.staffingMode === "daily_roster" ? "people on roster" : "workers needed"}</p>
                    <p className="flex items-center gap-2 sm:col-span-2"><MapPin size={16} className="text-moss" />{shift.location}</p>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-4 border-t border-moss/10 pt-4">
                    <p className="max-w-lg text-sm leading-6 text-ink-soft">{shift.notes || "No notes added."}</p>
                    <ShiftActions
                      shift={shift}
                      onEdit={() => openEditForm(shift)}
                      onDelete={() => deleteShift(shift.id)}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ShiftFormDialog
        key={editingShift?.id ?? "new-shift"}
        open={formOpen}
        onOpenChange={setFormOpen}
        shift={editingShift}
        roleOptions={roleOptions}
        onSubmit={saveShift}
      />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityLabel={{ singular: "shift", plural: "shifts" }}
        description="Upload a CSV to add shifts in bulk. Importing clears any generated schedule."
        columnsHint="title, date, startTime, endTime, location, requiredRole, requiredWorkers, requiresSupervisor, staffingMode, requiredSupervisors, maxDailyWorkers, requiredWorkerHours, minPaidStaff, maxPaidStaff, priority, notes"
        templateFilename="shifts-template.csv"
        buildTemplate={buildShiftsTemplate}
        existingCount={shifts.length}
        parseFile={parseShiftsCsv}
        previewColumns={[
          { header: "Title", cell: (row) => row.title },
          { header: "Date", cell: (row) => formatDate(row.date) },
          { header: "Time", cell: (row) => `${formatTime(row.startTime)}–${formatTime(row.endTime)}` },
          { header: "Role", cell: (row) => row.requiredRole },
          { header: "Needed", cell: (row) => row.requiredWorkers },
          { header: "Supervisor", cell: (row) => (row.requiresSupervisor ? "Required" : "—") },
          { header: "Priority", cell: (row) => row.priority },
        ]}
        getDuplicateWarning={(rows) => {
          const count = rows.filter((row) =>
            existingShiftKeys.has(`${row.title.trim().toLowerCase()}|${row.date}|${row.startTime}`),
          ).length;
          return count > 0
            ? `${count} ${count === 1 ? "row matches" : "rows match"} the title, date, and start time of an existing shift and will create duplicates.`
            : null;
        }}
        onImport={importShifts}
      />
    </div>
  );
}
