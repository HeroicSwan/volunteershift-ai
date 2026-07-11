"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormError, FormLabel, Input, Textarea } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import {
  COMMON_ROLES,
  SHIFT_PRIORITIES,
  type Shift,
  type ShiftInput,
} from "@/types";

const optionalCount = z
  .string()
  .trim()
  .refine((value) => !value || /^\d+$/.test(value), "Enter a whole number or leave blank.");

const shiftFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    endTime: z.string().min(1, "End time is required."),
    location: z.string().trim().min(1, "Location is required."),
    requiredRole: z.string().trim().min(1, "Required role is required."),
    requiredWorkers: z.number().int().min(1, "Enter at least 1 worker.").max(100, "Enter 100 or fewer workers."),
    requiresSupervisor: z.boolean(),
    staffingMode: z.enum(["continuous", "daily_roster"]),
    requiredSupervisors: optionalCount,
    maxDailyWorkers: optionalCount,
    requiredWorkerHours: optionalCount,
    minPaidStaff: optionalCount,
    maxPaidStaff: optionalCount,
    priority: z.enum(SHIFT_PRIORITIES),
    notes: z.string().trim().max(500, "Notes must be 500 characters or fewer."),
  })
  .refine(({ startTime, endTime }) => !startTime || !endTime || endTime > startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  })
  .superRefine(({ requiredWorkers, requiredSupervisors, minPaidStaff, maxPaidStaff }, context) => {
    const min = minPaidStaff ? Number(minPaidStaff) : undefined;
    const max = maxPaidStaff ? Number(maxPaidStaff) : undefined;
    const managers = requiredSupervisors ? Number(requiredSupervisors) : 0;
    if (managers > requiredWorkers) {
      context.addIssue({ code: "custom", message: "Cannot exceed the daily roster size.", path: ["requiredSupervisors"] });
    }
    if (min !== undefined && Number.isInteger(requiredWorkers) && min > requiredWorkers) {
      context.addIssue({
        code: "custom",
        message: "Cannot exceed the workers needed.",
        path: ["minPaidStaff"],
      });
    }
    if (min !== undefined && max !== undefined && min > max) {
      context.addIssue({
        code: "custom",
        message: "Must be at least the minimum paid staff.",
        path: ["maxPaidStaff"],
      });
    }
  });

type ShiftFormValues = z.infer<typeof shiftFormSchema>;

function getDefaultValues(shift?: Shift): ShiftFormValues {
  return {
    title: shift?.title ?? "",
    date: shift?.date ?? "",
    startTime: shift?.startTime ?? "",
    endTime: shift?.endTime ?? "",
    location: shift?.location ?? "",
    requiredRole: shift?.requiredRole ?? "",
    requiredWorkers: shift?.requiredWorkers ?? 1,
    requiresSupervisor: shift?.requiresSupervisor ?? false,
    staffingMode: shift?.staffingMode ?? "continuous",
    requiredSupervisors: String(shift?.requiredSupervisors ?? (shift?.requiresSupervisor ? 1 : 0)),
    maxDailyWorkers: shift?.maxDailyWorkers !== undefined ? String(shift.maxDailyWorkers) : "",
    requiredWorkerHours: shift?.requiredWorkerHours !== undefined ? String(shift.requiredWorkerHours) : "",
    minPaidStaff: shift?.minPaidStaff !== undefined ? String(shift.minPaidStaff) : "",
    maxPaidStaff: shift?.maxPaidStaff !== undefined ? String(shift.maxPaidStaff) : "",
    priority: shift?.priority ?? "Normal",
    notes: shift?.notes ?? "",
  };
}

function toShiftInput(values: ShiftFormValues): ShiftInput {
  return {
    title: values.title,
    date: values.date,
    startTime: values.startTime,
    endTime: values.endTime,
    location: values.location,
    requiredRole: values.requiredRole,
    requiredWorkers: values.requiredWorkers,
    requiresSupervisor: values.staffingMode === "daily_roster" ? Number(values.requiredSupervisors || 0) > 0 : values.requiresSupervisor,
    staffingMode: values.staffingMode,
    requiredSupervisors: values.requiredSupervisors ? Number(values.requiredSupervisors) : 0,
    maxDailyWorkers: values.maxDailyWorkers ? Number(values.maxDailyWorkers) : undefined,
    requiredWorkerHours: values.requiredWorkerHours ? Number(values.requiredWorkerHours) : undefined,
    minPaidStaff: values.minPaidStaff ? Number(values.minPaidStaff) : undefined,
    maxPaidStaff: values.maxPaidStaff ? Number(values.maxPaidStaff) : undefined,
    priority: values.priority,
    notes: values.notes,
  };
}

export function ShiftFormDialog({
  open,
  onOpenChange,
  shift,
  roleOptions,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: Shift;
  roleOptions: string[];
  onSubmit: (shift: ShiftInput) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: getDefaultValues(shift),
  });
  const availableRoles = [...new Set([...COMMON_ROLES, ...roleOptions])].sort();
  const staffingMode = useWatch({ control, name: "staffingMode" });

  function submit(values: ShiftFormValues) {
    onSubmit(toShiftInput(values));
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={shift ? "Edit shift" : "Add shift"}
      description="Define when and where help is needed, the required role, staffing target, and staffing rules."
    >
      <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-5">
        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <div>
            <FormLabel htmlFor="shift-title">Shift title</FormLabel>
            <Input id="shift-title" {...register("title")} />
            <FormError>{errors.title?.message}</FormError>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <FormLabel htmlFor="shift-date">Date</FormLabel>
              <Input id="shift-date" type="date" {...register("date")} />
              <FormError>{errors.date?.message}</FormError>
            </div>
            <div>
              <FormLabel htmlFor="shift-start">Start time</FormLabel>
              <Input id="shift-start" type="time" {...register("startTime")} />
              <FormError>{errors.startTime?.message}</FormError>
            </div>
            <div>
              <FormLabel htmlFor="shift-end">End time</FormLabel>
              <Input id="shift-end" type="time" {...register("endTime")} />
              <FormError>{errors.endTime?.message}</FormError>
            </div>
          </div>
          <div className="mt-4">
            <FormLabel htmlFor="shift-location">Location</FormLabel>
            <Input id="shift-location" {...register("location")} />
            <FormError>{errors.location?.message}</FormError>
          </div>
        </section>

        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div>
              <FormLabel htmlFor="required-role">Required role</FormLabel>
              <Input id="required-role" list="required-role-options" {...register("requiredRole")} />
              <datalist id="required-role-options">
                {availableRoles.map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
              <FormError>{errors.requiredRole?.message}</FormError>
            </div>
            <div>
              <FormLabel htmlFor="required-workers">Workers needed</FormLabel>
              <Input
                id="required-workers"
                type="number"
                min={1}
                max={100}
                {...register("requiredWorkers", { valueAsNumber: true })}
              />
              <FormError>{errors.requiredWorkers?.message}</FormError>
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-ink">Priority</legend>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SHIFT_PRIORITIES.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      aria-pressed={field.value === priority}
                      onClick={() => field.onChange(priority)}
                      className={cn(
                        "rounded-2xl border px-3 py-2.5 text-xs font-semibold transition duration-300",
                        field.value === priority
                          ? "border-moss bg-moss text-sand"
                          : "border-moss/15 bg-sand/55 text-ink-soft hover:border-moss/30",
                      )}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              )}
            />
          </fieldset>
        </section>

        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-ink">Staffing rules</h3>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            These requirements are enforced when the schedule is generated.
          </p>

          <Controller
            control={control}
            name="staffingMode"
            render={({ field }) => (
              <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Staffing mode">
                {[
                  ["continuous", "Continuous coverage"],
                  ["daily_roster", "Daily roster"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={field.value === value}
                    onClick={() => field.onChange(value)}
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 text-xs font-semibold transition duration-300",
                      field.value === value ? "border-moss bg-moss text-sand" : "border-moss/15 bg-sand/55 text-ink-soft",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          />

          {staffingMode === "continuous" && <Controller
            control={control}
            name="requiresSupervisor"
            render={({ field }) => (
              <button
                type="button"
                role="switch"
                aria-checked={field.value}
                onClick={() => field.onChange(!field.value)}
                className={cn(
                  "mt-4 flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition duration-300",
                  field.value ? "border-moss bg-sage/15" : "border-moss/15 bg-sand/55 hover:border-moss/30",
                )}
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">Requires supervisor</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-soft">
                    At least one Supervisor / Lead must be assigned to this shift.
                  </span>
                </span>
                <span
                  className={cn(
                    "h-6 w-11 shrink-0 rounded-full p-1 transition duration-300",
                    field.value ? "bg-moss" : "bg-sage/30",
                  )}
                >
                  <span
                    className={cn(
                      "block size-4 rounded-full bg-sand transition duration-300",
                      field.value && "translate-x-5",
                    )}
                  />
                </span>
              </button>
            )}
          />}

          {staffingMode === "daily_roster" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <FormLabel htmlFor="required-supervisors">Managers per day</FormLabel>
                <Input id="required-supervisors" inputMode="numeric" {...register("requiredSupervisors")} />
                <FormError>{errors.requiredSupervisors?.message}</FormError>
              </div>
              <div>
                <FormLabel htmlFor="max-daily-workers">Daily roster cap</FormLabel>
                <Input id="max-daily-workers" inputMode="numeric" placeholder="Same as needed" {...register("maxDailyWorkers")} />
                <FormError>{errors.maxDailyWorkers?.message}</FormError>
              </div>
              <div>
                <FormLabel htmlFor="required-worker-hours">Target worker-hours</FormLabel>
                <Input id="required-worker-hours" inputMode="numeric" placeholder="Optional" {...register("requiredWorkerHours")} />
                <FormError>{errors.requiredWorkerHours?.message}</FormError>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <FormLabel htmlFor="min-paid-staff">Min paid staff <span className="font-normal text-ink-soft">(optional)</span></FormLabel>
              <Input id="min-paid-staff" inputMode="numeric" placeholder="No minimum" {...register("minPaidStaff")} />
              <FormError>{errors.minPaidStaff?.message}</FormError>
            </div>
            <div>
              <FormLabel htmlFor="max-paid-staff">Max paid staff <span className="font-normal text-ink-soft">(optional)</span></FormLabel>
              <Input id="max-paid-staff" inputMode="numeric" placeholder="No maximum" {...register("maxPaidStaff")} />
              <FormError>{errors.maxPaidStaff?.message}</FormError>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-sand/55 p-4 sm:p-5">
          <FormLabel htmlFor="shift-notes">Notes</FormLabel>
          <Textarea id="shift-notes" {...register("notes")} />
          <FormError>{errors.notes?.message}</FormError>
        </section>

        <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-moss/10 bg-oat/95 px-5 py-4 backdrop-blur-xl sm:-mx-7 sm:px-7">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            <X size={16} /> Cancel
          </Button>
          <Button type="submit">
            <Save size={16} /> {shift ? "Save changes" : "Add shift"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
