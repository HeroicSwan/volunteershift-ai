"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormError, FormLabel, Input, Textarea } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import {
  AVAILABILITY_BLOCKS,
  AVAILABILITY_TIMES,
  COMMON_ROLES,
  DAYS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  RELIABILITY_SCORES,
  WORKER_TYPES,
  isPaidWorker,
  type AvailabilityBlock,
  type DayOfWeek,
  type TimeBlock,
  type Worker,
  type WorkerInput,
} from "@/types";

const daySchema = z.enum(DAYS);
const availabilityBlockSchema = z.enum(AVAILABILITY_BLOCKS);

const workerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    email: z.string().trim().email("Enter a valid email address."),
    phone: z.string().trim(),
    workerType: z.enum(WORKER_TYPES),
    hourlyRate: z
      .string()
      .trim()
      .refine((value) => !value || /^\$?\d+(\.\d{1,2})?$/.test(value), "Enter a rate like 18.50."),
    reliabilityScore: z.number().int().min(1).max(5).optional(),
    desiredHoursPerWeek: z.number().min(1, "Enter at least 1 hour.").max(40, "Desired hours cannot exceed 40."),
    maxHoursPerWeek: z.number().min(1, "Enter at least 1 hour.").max(40, "Maximum hours cannot exceed 40."),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    roles: z.array(z.string().trim().min(1)).min(1, "Select or add at least one role."),
    availability: z.record(daySchema, z.array(availabilityBlockSchema)),
    preferredDays: z.array(daySchema),
    preferredRoles: z.array(z.string()),
    maxShiftsPerWeek: z.number().int().min(1, "Enter at least 1 shift.").max(14, "Enter 14 or fewer shifts."),
    notes: z.string().trim().max(500, "Notes must be 500 characters or fewer."),
  })
  .refine(
    ({ availability }) => Object.values(availability).some((blocks) => blocks.length > 0),
    { message: "Select at least one availability block.", path: ["availability"] },
  )
  .refine(({ workerType, employmentType }) => !isPaidWorker(workerType) || employmentType !== undefined, {
    message: "Select part-time or full-time for paid staff.",
    path: ["employmentType"],
  })
  .refine(({ desiredHoursPerWeek, maxHoursPerWeek }) => desiredHoursPerWeek <= maxHoursPerWeek, {
    message: "Maximum hours must be at least the desired hours.",
    path: ["maxHoursPerWeek"],
  })
  .refine(
    ({ workerType, employmentType, maxHoursPerWeek }) =>
      !isPaidWorker(workerType) || employmentType !== "part_time" || maxHoursPerWeek <= 30,
    { message: "Part-time staff must stay at 30 hours or fewer.", path: ["maxHoursPerWeek"] },
  );

type WorkerFormValues = z.infer<typeof workerFormSchema>;

const WORKER_TYPE_OPTIONS = [
  { value: "volunteer", label: "Volunteer", detail: "Unpaid community member" },
  { value: "paid_employee", label: "Paid Employee", detail: "Hourly paid staff member" },
  { value: "supervisor", label: "Supervisor / Lead", detail: "Can oversee and lead shifts" },
] as const;

function emptyAvailability(): Record<DayOfWeek, AvailabilityBlock[]> {
  return {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  };
}

function getBlockLabel(block: TimeBlock): AvailabilityBlock {
  const hour = Number(block.start.split(":")[0]);
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function getDefaultValues(worker?: Worker): WorkerFormValues {
  const availability = emptyAvailability();

  if (worker) {
    DAYS.forEach((day) => {
      availability[day] = [...new Set((worker.availability[day] ?? []).map(getBlockLabel))];
    });
  }

  return {
    name: worker?.name ?? "",
    email: worker?.email ?? "",
    phone: worker?.phone ?? "",
    workerType: worker?.workerType ?? "volunteer",
    hourlyRate: worker?.hourlyRate !== undefined ? String(worker.hourlyRate) : "",
    reliabilityScore: worker?.reliabilityScore,
    roles: worker?.roles ?? [],
    availability,
    preferredDays: worker?.preferredDays ?? [],
    preferredRoles: worker?.preferredRoles ?? [],
    maxShiftsPerWeek: worker?.maxShiftsPerWeek ?? 2,
    desiredHoursPerWeek: worker?.desiredHoursPerWeek ?? ((worker?.maxShiftsPerWeek ?? 2) * 4),
    maxHoursPerWeek: worker?.maxHoursPerWeek ?? ((worker?.maxShiftsPerWeek ?? 2) * 4),
    employmentType: worker?.employmentType,
    notes: worker?.notes ?? "",
  };
}

function RolePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (roles: string[]) => void;
}) {
  const [customRole, setCustomRole] = useState("");
  const options = [...new Set([...COMMON_ROLES, ...value])];

  function toggleRole(role: string) {
    onChange(value.includes(role) ? value.filter((item) => item !== role) : [...value, role]);
  }

  function addCustomRole() {
    const role = customRole.trim();
    if (role && !value.includes(role)) onChange([...value, role]);
    setCustomRole("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((role) => {
          const selected = value.includes(role);
          return (
            <button
              key={role}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleRole(role)}
              className={cn(
                "rounded-full border px-3 py-2 text-xs font-semibold transition duration-300",
                selected
                  ? "border-moss bg-moss text-sand"
                  : "border-moss/15 bg-sand/55 text-ink-soft hover:border-moss/30 hover:text-moss",
              )}
            >
              {role}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          value={customRole}
          onChange={(event) => setCustomRole(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustomRole();
            }
          }}
          placeholder="Add another role"
          aria-label="Custom role"
        />
        <Button type="button" variant="secondary" onClick={addCustomRole} disabled={!customRole.trim()}>
          <Plus size={16} /> Add
        </Button>
      </div>
    </div>
  );
}

function toWorkerInput(values: WorkerFormValues): WorkerInput {
  const availability = Object.fromEntries(
    DAYS.flatMap((day) => {
      const blocks = values.availability[day];
      return blocks.length
        ? [[day, blocks.map((block) => ({ ...AVAILABILITY_TIMES[block] }))]]
        : [];
    }),
  ) as Partial<Record<DayOfWeek, TimeBlock[]>>;
  const paid = isPaidWorker(values.workerType);
  const rate = values.hourlyRate.replace("$", "");

  return {
    name: values.name,
    email: values.email,
    phone: values.phone || undefined,
    workerType: values.workerType,
    desiredHoursPerWeek: values.desiredHoursPerWeek,
    maxHoursPerWeek: values.maxHoursPerWeek,
    employmentType: paid ? values.employmentType : undefined,
    hourlyRate: paid && rate ? Number(rate) : undefined,
    reliabilityScore: values.reliabilityScore,
    roles: values.roles,
    availability,
    preferredDays: values.preferredDays,
    preferredRoles: values.preferredRoles.filter((role) => values.roles.includes(role)),
    maxShiftsPerWeek: values.maxShiftsPerWeek,
    notes: values.notes,
  };
}

export function WorkerFormDialog({
  open,
  onOpenChange,
  worker,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker?: Worker;
  onSubmit: (worker: WorkerInput) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkerFormValues>({
    resolver: zodResolver(workerFormSchema),
    defaultValues: getDefaultValues(worker),
  });
  const selectedRoles = useWatch({ control, name: "roles" });
  const workerType = useWatch({ control, name: "workerType" });

  function submit(values: WorkerFormValues) {
    onSubmit(toWorkerInput(values));
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={worker ? "Edit worker" : "Add worker"}
      description="Record contact details, worker type, qualified roles, preferences, and weekly availability."
    >
      <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-5">
        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-ink">Contact details</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <FormLabel htmlFor="worker-name">Name</FormLabel>
              <Input id="worker-name" autoComplete="name" {...register("name")} />
              <FormError>{errors.name?.message}</FormError>
            </div>
            <div>
              <FormLabel htmlFor="worker-email">Email</FormLabel>
              <Input id="worker-email" type="email" autoComplete="email" {...register("email")} />
              <FormError>{errors.email?.message}</FormError>
            </div>
            <div className="sm:col-span-2">
              <FormLabel htmlFor="worker-phone">Phone <span className="font-normal text-ink-soft">(optional)</span></FormLabel>
              <Input id="worker-phone" type="tel" autoComplete="tel" {...register("phone")} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <FormLabel>Worker type</FormLabel>
          <Controller
            control={control}
            name="workerType"
            render={({ field }) => (
              <div className="grid gap-2 sm:grid-cols-3">
                {WORKER_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={field.value === option.value}
                    onClick={() => field.onChange(option.value)}
                    className={cn(
                      "rounded-2xl border p-3.5 text-left transition duration-300",
                      field.value === option.value
                        ? "border-moss bg-sage/15"
                        : "border-moss/15 bg-sand/55 hover:border-moss/30",
                    )}
                  >
                    <span className="block text-sm font-semibold text-ink">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-ink-soft">{option.detail}</span>
                  </button>
                ))}
              </div>
            )}
          />

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel htmlFor="worker-desired-hours">Desired hours</FormLabel>
                <Input
                  id="worker-desired-hours"
                  type="number"
                  min={1}
                  max={40}
                  step={0.5}
                  {...register("desiredHoursPerWeek", { valueAsNumber: true })}
                />
                <FormError>{errors.desiredHoursPerWeek?.message}</FormError>
              </div>
              <div>
                <FormLabel htmlFor="worker-max-hours">Maximum hours</FormLabel>
                <Input
                  id="worker-max-hours"
                  type="number"
                  min={1}
                  max={40}
                  step={0.5}
                  {...register("maxHoursPerWeek", { valueAsNumber: true })}
                />
                <FormError>{errors.maxHoursPerWeek?.message}</FormError>
              </div>
              <p className="col-span-2 text-xs leading-5 text-ink-soft">
                Desired hours guide fairness. Maximum hours are a hard no-overtime limit.
              </p>
            </div>
            {isPaidWorker(workerType) && (
              <fieldset>
                <legend className="text-sm font-semibold text-ink">Employment status</legend>
                <Controller
                  control={control}
                  name="employmentType"
                  render={({ field }) => (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {EMPLOYMENT_TYPES.map((employmentType) => (
                        <button
                          key={employmentType}
                          type="button"
                          aria-pressed={field.value === employmentType}
                          onClick={() => field.onChange(employmentType)}
                          className={cn(
                            "rounded-2xl border px-3 py-3 text-sm font-semibold transition duration-300",
                            field.value === employmentType
                              ? "border-moss bg-moss text-sand"
                              : "border-moss/15 bg-sand/55 text-ink-soft hover:border-moss/30",
                          )}
                        >
                          {EMPLOYMENT_TYPE_LABELS[employmentType]}
                        </button>
                      ))}
                    </div>
                  )}
                />
                <FormError>{errors.employmentType?.message}</FormError>
              </fieldset>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {isPaidWorker(workerType) && (
              <div>
                <FormLabel htmlFor="worker-rate">Hourly rate <span className="font-normal text-ink-soft">(optional)</span></FormLabel>
                <Input id="worker-rate" inputMode="decimal" placeholder="18.50" {...register("hourlyRate")} />
                <FormError>{errors.hourlyRate?.message}</FormError>
              </div>
            )}
            <div>
              <FormLabel>Reliability score <span className="font-normal text-ink-soft">(optional)</span></FormLabel>
              <Controller
                control={control}
                name="reliabilityScore"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-1.5">
                    {RELIABILITY_SCORES.map((score) => {
                      const selected = field.value === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          aria-pressed={selected}
                          aria-label={`Reliability ${score} of 5`}
                          onClick={() => field.onChange(selected ? undefined : score)}
                          className={cn(
                            "grid size-11 place-items-center rounded-2xl border text-sm font-semibold transition duration-300",
                            selected
                              ? "border-moss bg-moss text-sand"
                              : "border-moss/15 bg-sand/55 text-ink-soft hover:border-moss/30",
                          )}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
              <p className="mt-1.5 text-xs text-ink-soft">1 = often cancels · 5 = always shows up</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <FormLabel>Qualified roles</FormLabel>
          <p className="mb-3 text-xs leading-5 text-ink-soft">Select every role this worker can perform.</p>
          <Controller
            control={control}
            name="roles"
            render={({ field }) => <RolePicker value={field.value} onChange={field.onChange} />}
          />
          <FormError>{errors.roles?.message}</FormError>

          <div className="mt-6 border-t border-moss/10 pt-5">
            <FormLabel>Preferred roles</FormLabel>
            {selectedRoles.length === 0 ? (
              <p className="text-xs text-ink-soft">Select qualified roles first.</p>
            ) : (
              <Controller
                control={control}
                name="preferredRoles"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {selectedRoles.map((role) => {
                      const selected = field.value.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          aria-label={`Prefer ${role}`}
                          aria-pressed={selected}
                          onClick={() =>
                            field.onChange(
                              selected ? field.value.filter((item) => item !== role) : [...field.value, role],
                            )
                          }
                          className={cn(
                            "rounded-full border px-3 py-2 text-xs font-semibold transition duration-300",
                            selected
                              ? "border-terracotta-dark bg-terracotta-dark text-sand"
                              : "border-moss/15 bg-sand/55 text-ink-soft hover:border-moss/30",
                          )}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <FormLabel>Weekly availability</FormLabel>
          <p className="mb-4 text-xs leading-5 text-ink-soft">Choose every time block that can work for each day.</p>
          <div className="space-y-2">
            {DAYS.map((day) => (
              <Controller
                key={day}
                control={control}
                name={`availability.${day}`}
                render={({ field }) => (
                  <div className="grid gap-2 rounded-2xl border border-moss/10 bg-oat/45 p-3 sm:grid-cols-[110px_1fr] sm:items-center">
                    <span className="text-xs font-semibold text-ink">{day}</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {AVAILABILITY_BLOCKS.map((block) => {
                        const selected = field.value.includes(block);
                        return (
                          <button
                            key={block}
                            type="button"
                            aria-label={`${day} ${block}`}
                            aria-pressed={selected}
                            onClick={() =>
                              field.onChange(
                                selected ? field.value.filter((item) => item !== block) : [...field.value, block],
                              )
                            }
                            className={cn(
                              "rounded-xl px-2 py-2 text-[11px] font-semibold transition duration-300",
                              selected ? "bg-moss text-sand" : "bg-sand/65 text-ink-soft hover:bg-sage/25",
                            )}
                          >
                            {block}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              />
            ))}
          </div>
          <FormError>{errors.availability?.message as string | undefined}</FormError>
        </section>

        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <FormLabel>Preferred days</FormLabel>
          <Controller
            control={control}
            name="preferredDays"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const selected = field.value.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-label={`Prefer ${day}`}
                      aria-pressed={selected}
                      onClick={() =>
                        field.onChange(selected ? field.value.filter((item) => item !== day) : [...field.value, day])
                      }
                      className={cn(
                        "rounded-full border px-3 py-2 text-xs font-semibold transition duration-300",
                        selected
                          ? "border-terracotta-dark bg-terracotta-dark text-sand"
                          : "border-moss/15 bg-sand/55 text-ink-soft hover:border-moss/30",
                      )}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            )}
          />

          <div className="mt-5 grid gap-4 sm:grid-cols-[180px_1fr]">
            <div>
              <FormLabel htmlFor="max-shifts">Max shifts per week</FormLabel>
              <Input
                id="max-shifts"
                type="number"
                min={1}
                max={14}
                {...register("maxShiftsPerWeek", { valueAsNumber: true })}
              />
              <FormError>{errors.maxShiftsPerWeek?.message}</FormError>
            </div>
            <div>
              <FormLabel htmlFor="worker-notes">Notes</FormLabel>
              <Textarea id="worker-notes" {...register("notes")} />
              <FormError>{errors.notes?.message}</FormError>
            </div>
          </div>
        </section>

        <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-moss/10 bg-oat/95 px-5 py-4 backdrop-blur-xl sm:-mx-7 sm:px-7">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            <X size={16} /> Cancel
          </Button>
          <Button type="submit">
            <Save size={16} /> {worker ? "Save changes" : "Add worker"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
