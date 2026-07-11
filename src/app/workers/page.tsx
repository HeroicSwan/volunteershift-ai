"use client";

import { useMemo, useState } from "react";
import { Download, Mail, Pencil, Phone, Plus, Search, SearchX, Star, Trash2, Upload, UsersRound, X } from "lucide-react";
import { CsvImportDialog } from "@/components/csv/import-dialog";
import { useVolunteerMatcherData } from "@/components/data-provider";
import { GenerateTestStaffButton, SeedDataButton } from "@/components/seed-data-button";
import { WorkerTypeBadge } from "@/components/worker-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoading } from "@/components/ui/page-loading";
import { WorkerFormDialog } from "@/components/workers/worker-form-dialog";
import { cn } from "@/lib/utils";
import {
  buildWorkersTemplate,
  csvExportFilename,
  downloadCsv,
  parseWorkersCsv,
  workersToCsv,
} from "@/lib/csv";
import { EMPLOYMENT_TYPE_LABELS, WORKER_TYPE_LABELS, isPaidWorker, type Worker, type WorkerInput } from "@/types";

type StaffView = "paid" | "volunteers";

function Reliability({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-sm text-ink-soft">Not rated</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
      <Star size={14} className="fill-ochre text-ochre" /> {score}/5
    </span>
  );
}

function formatRate(worker: Worker) {
  if (!isPaidWorker(worker.workerType)) return "—";
  return worker.hourlyRate !== undefined ? `$${worker.hourlyRate.toFixed(2)}/hr` : "Rate not set";
}

function WorkerActions({
  worker,
  onEdit,
  onDelete,
}: {
  worker: Worker;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <IconButton type="button" aria-label={`Edit ${worker.name}`} onClick={onEdit}>
        <Pencil size={16} />
      </IconButton>
      <ConfirmDialog
        trigger={
          <IconButton type="button" aria-label={`Delete ${worker.name}`} className="hover:text-terracotta-dark">
            <Trash2 size={16} />
          </IconButton>
        }
        title={`Delete ${worker.name}?`}
        description="This removes the worker and any schedule assignments connected to them. This action cannot be undone."
        confirmLabel="Delete worker"
        onConfirm={onDelete}
      />
    </div>
  );
}

export default function WorkersPage() {
  const {
    workers,
    hydrated,
    addWorker,
    updateWorker,
    deleteWorker,
    importWorkers,
  } = useVolunteerMatcherData();
  const [searchQuery, setSearchQuery] = useState("");
  const [staffView, setStaffView] = useState<StaffView>("paid");
  const [roleFilter, setRoleFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker>();

  const paidStaffCount = workers.filter((worker) => isPaidWorker(worker.workerType)).length;
  const volunteerCount = workers.filter((worker) => worker.workerType === "volunteer").length;
  const tabWorkers = useMemo(
    () => workers.filter((worker) => (staffView === "paid" ? isPaidWorker(worker.workerType) : worker.workerType === "volunteer")),
    [staffView, workers],
  );
  const roleOptions = useMemo(
    () => [...new Set(tabWorkers.flatMap((worker) => worker.roles))].sort(),
    [tabWorkers],
  );
  const existingEmails = useMemo(
    () => new Set(workers.map((worker) => worker.email.trim().toLowerCase())),
    [workers],
  );
  const filteredWorkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tabWorkers.filter((worker) => {
      const matchesQuery =
        !query ||
        worker.name.toLowerCase().includes(query) ||
        worker.roles.some((role) => role.toLowerCase().includes(query));
      const matchesRole = !roleFilter || worker.roles.includes(roleFilter);
      return matchesQuery && matchesRole;
    });
  }, [roleFilter, searchQuery, tabWorkers]);

  if (!hydrated) {
    return <PageLoading label="Loading staff" />;
  }

  function openAddForm() {
    setEditingWorker(undefined);
    setFormOpen(true);
  }

  function openEditForm(worker: Worker) {
    setEditingWorker(worker);
    setFormOpen(true);
  }

  function saveWorker(input: WorkerInput) {
    if (editingWorker) updateWorker(editingWorker.id, input);
    else addWorker(input);
  }

  function clearFilters() {
    setSearchQuery("");
    setRoleFilter("");
  }

  function exportCsv() {
    downloadCsv(csvExportFilename("workers"), workersToCsv(workers));
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Staff"
        description="Manage your volunteers, paid staff, and supervisors—roles, availability, preferences, and weekly capacity."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {workers.length > 0 && <Badge tone="moss" className="min-h-10 px-4 text-sm">{tabWorkers.length} {staffView === "paid" ? "paid staff" : "volunteers"}</Badge>}
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={16} /> Import CSV
            </Button>
              <GenerateTestStaffButton />
            {workers.length > 0 && (
              <Button variant="secondary" onClick={exportCsv}>
                <Download size={16} /> Export CSV
              </Button>
            )}
            <Button onClick={openAddForm}>
              <Plus size={17} /> Add staff
            </Button>
          </div>
        }
      />

      {workers.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Add your first worker"
          description="Create a profile for a volunteer, paid employee, or supervisor with contact details, roles, and weekly availability."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={openAddForm}>
                <Plus size={17} /> Add staff
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={17} /> Import CSV
              </Button>
              <GenerateTestStaffButton variant="secondary" />
              <SeedDataButton variant="secondary" />
            </div>
          }
        />
      ) : (
        <>
          <div className="max-w-xl rounded-3xl bg-sage/10 p-1" role="tablist" aria-label="Staff type">
            {([
              { value: "paid", label: "Paid Staff", count: paidStaffCount },
              { value: "volunteers", label: "Volunteers", count: volunteerCount },
            ] as const).map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={staffView === tab.value}
                onClick={() => {
                  setStaffView(tab.value);
                  setRoleFilter("");
                }}
                className={cn(
                  "inline-flex min-h-11 w-1/2 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition duration-300",
                  staffView === tab.value ? "bg-sand text-moss shadow-sm" : "text-ink-soft hover:text-moss",
                )}
              >
                {tab.label}
                <span className={cn("rounded-full px-2 py-0.5 text-xs", staffView === tab.value ? "bg-sage/20 text-moss" : "bg-sand/60 text-ink-soft")}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <Card className="p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" size={17} />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name or role"
                  aria-label="Search staff by name or role"
                  className="pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear worker search"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-moss"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter staff by role">
                <option value="">All roles</option>
                {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </Select>
              <p className="text-xs font-semibold text-ink-soft md:text-right">
                {filteredWorkers.length} of {tabWorkers.length} shown
              </p>
            </div>
          </Card>

          {filteredWorkers.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={tabWorkers.length === 0 ? `No ${staffView === "paid" ? "paid staff" : "volunteers"} yet` : "No staff match these filters"}
              description={tabWorkers.length === 0
                ? `Add a ${staffView === "paid" ? "paid staff" : "volunteer"} profile to see them in this tab.`
                : "Try a different name or role, or clear the filters to see the full team."}
              action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <>
              <Card className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-left">
                    <thead className="border-b border-moss/10 bg-sage/10 text-xs font-semibold text-ink-soft">
                      <tr>
                        <th scope="col" className="px-6 py-4">Worker</th>
                        <th scope="col" className="px-5 py-4">Type</th>
                        <th scope="col" className="px-5 py-4">Employment</th>
                        <th scope="col" className="px-5 py-4">Hours/week</th>
                        <th scope="col" className="px-5 py-4">Qualified roles</th>
                        <th scope="col" className="px-5 py-4">Availability</th>
                        <th scope="col" className="px-5 py-4">Reliability</th>
                        <th scope="col" className="px-5 py-4 text-right">Rate</th>
                        <th scope="col" className="px-5 py-4 text-right">Weekly max</th>
                        <th scope="col" className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-moss/10">
                      {filteredWorkers.map((worker) => (
                        <tr key={worker.id} className="transition duration-300 hover:bg-sage/10">
                          <th scope="row" className="px-6 py-5 text-left">
                            <div className="flex items-center gap-3.5">
                              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage/25 text-xs font-bold text-moss">
                                {worker.name.split(" ").map((part) => part[0]).join("")}
                              </span>
                              <div>
                                <p className="font-semibold text-ink">{worker.name}</p>
                                <p className="mt-1 text-xs text-ink-soft">{worker.email}</p>
                              </div>
                            </div>
                          </th>
                          <td className="px-5 py-5">
                            <WorkerTypeBadge workerType={worker.workerType} />
                          </td>
                          <td className="px-5 py-5">
                            {isPaidWorker(worker.workerType) && worker.employmentType ? (
                              <Badge tone="oat">{EMPLOYMENT_TYPE_LABELS[worker.employmentType]}</Badge>
                            ) : <span className="text-sm text-ink-soft">—</span>}
                          </td>
                          <td className="px-5 py-5 text-sm font-semibold text-ink">
                            {worker.desiredHoursPerWeek} desired · {worker.maxHoursPerWeek} max
                          </td>
                          <td className="px-5 py-5">
                            <div className="flex max-w-xs flex-wrap gap-1.5">
                              {worker.roles.map((role) => <Badge key={role}>{role}</Badge>)}
                            </div>
                          </td>
                          <td className="px-5 py-5 text-sm font-medium text-ink">
                            {Object.keys(worker.availability).length} {Object.keys(worker.availability).length === 1 ? "day" : "days"}
                          </td>
                          <td className="px-5 py-5">
                            <Reliability score={worker.reliabilityScore} />
                          </td>
                          <td className="px-5 py-5 text-right text-sm font-semibold text-ink">{formatRate(worker)}</td>
                          <td className="px-5 py-5 text-right text-sm font-semibold text-ink">{worker.maxShiftsPerWeek} shifts</td>
                          <td className="px-6 py-5">
                            <WorkerActions
                              worker={worker}
                              onEdit={() => openEditForm(worker)}
                              onDelete={() => deleteWorker(worker.id)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid min-w-0 gap-4 md:hidden">
                {filteredWorkers.map((worker) => (
                  <Card key={worker.id} className="min-w-0 overflow-hidden p-5">
                    <div className="flex items-start gap-3.5">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sage/25 text-xs font-bold text-moss">
                        {worker.name.split(" ").map((part) => part[0]).join("")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-ink">{worker.name}</h2>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-soft"><Mail size={13} /> {worker.email}</p>
                        {worker.phone && <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft"><Phone size={13} /> {worker.phone}</p>}
                      </div>
                      <WorkerActions
                        worker={worker}
                        onEdit={() => openEditForm(worker)}
                        onDelete={() => deleteWorker(worker.id)}
                      />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      <WorkerTypeBadge workerType={worker.workerType} />
                      {isPaidWorker(worker.workerType) && worker.employmentType && (
                        <Badge tone="oat">{EMPLOYMENT_TYPE_LABELS[worker.employmentType]}</Badge>
                      )}
                      {worker.roles.map((role) => <Badge key={role}>{role}</Badge>)}
                    </div>
                    <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-moss/10 pt-4 text-xs">
                      <div>
                        <dt className="text-ink-soft">Weekly hours</dt>
                        <dd className="mt-1 font-semibold text-ink">{worker.desiredHoursPerWeek} desired / {worker.maxHoursPerWeek} max</dd>
                      </div>
                      <div>
                        <dt className="text-ink-soft">Available</dt>
                        <dd className="mt-1 font-semibold text-ink">
                          {Object.keys(worker.availability).length} {Object.keys(worker.availability).length === 1 ? "day" : "days"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-soft">Weekly max</dt>
                        <dd className="mt-1 font-semibold text-ink">{worker.maxShiftsPerWeek} shifts</dd>
                      </div>
                      <div>
                        <dt className="text-ink-soft">Reliability</dt>
                        <dd className="mt-1"><Reliability score={worker.reliabilityScore} /></dd>
                      </div>
                      {isPaidWorker(worker.workerType) && (
                        <div>
                          <dt className="text-ink-soft">Rate</dt>
                          <dd className="mt-1 font-semibold text-ink">{formatRate(worker)}</dd>
                        </div>
                      )}
                    </dl>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <WorkerFormDialog
        key={editingWorker?.id ?? "new-worker"}
        open={formOpen}
        onOpenChange={setFormOpen}
        worker={editingWorker}
        onSubmit={saveWorker}
      />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityLabel={{ singular: "worker", plural: "workers" }}
        description="Upload a CSV to add volunteers, paid employees, and supervisors in bulk. Importing clears any generated schedule."
        columnsHint="name, email, phone, workerType, roles, availableDays, availableTimeBlocks, preferredDays, preferredRoles, maxShiftsPerWeek, desiredHoursPerWeek, maxHoursPerWeek, employmentType, hourlyRate, reliabilityScore, notes"
        templateFilename="workers-template.csv"
        buildTemplate={buildWorkersTemplate}
        existingCount={workers.length}
        parseFile={parseWorkersCsv}
        previewColumns={[
          { header: "Name", cell: (row) => row.name },
          { header: "Type", cell: (row) => WORKER_TYPE_LABELS[row.workerType] },
          { header: "Email", cell: (row) => row.email },
          { header: "Roles", cell: (row) => row.roles.join(", ") },
          {
            header: "Available",
            cell: (row) => {
              const days = Object.keys(row.availability).length;
              return `${days} ${days === 1 ? "day" : "days"}`;
            },
          },
          { header: "Max/week", cell: (row) => row.maxShiftsPerWeek },
          { header: "Desired/max hours", cell: (row) => `${row.desiredHoursPerWeek}/${row.maxHoursPerWeek}` },
        ]}
        getDuplicateWarning={(rows) => {
          const count = rows.filter((row) => existingEmails.has(row.email.trim().toLowerCase())).length;
          return count > 0
            ? `${count} ${count === 1 ? "row matches" : "rows match"} the email of an existing worker and will create duplicate profiles.`
            : null;
        }}
        onImport={importWorkers}
      />
    </div>
  );
}
