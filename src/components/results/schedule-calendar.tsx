"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { cn, formatTime, toLocalIsoDate } from "@/lib/utils";
import type { ScheduleAssignment, WorkerType } from "@/types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_CHIP: Record<WorkerType, string> = {
  supervisor: "border-supervisor/35 bg-supervisor/12 text-supervisor",
  paid_employee: "border-paid/35 bg-paid/12 text-paid",
  volunteer: "border-moss/25 bg-moss/10 text-moss",
};

const LEGEND: { type: WorkerType; label: string; dot: string }[] = [
  { type: "supervisor", label: "Supervisor", dot: "bg-supervisor" },
  { type: "paid_employee", label: "Paid employee", dot: "bg-paid" },
  { type: "volunteer", label: "Volunteer", dot: "bg-moss" },
];

function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function ScheduleCalendar({ assignments }: { assignments: ScheduleAssignment[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleAssignment[]>();
    for (const assignment of assignments) {
      const list = map.get(assignment.shift.date) ?? [];
      list.push(assignment);
      map.set(assignment.shift.date, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          a.worker.name.localeCompare(b.worker.name),
      );
    }
    return map;
  }, [assignments]);

  const scheduleMonth = useMemo(() => {
    const earliest = [...assignments].map((item) => item.shift.date).sort()[0];
    const base = earliest ? parseIsoDate(earliest) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [assignments]);

  const [viewDate, setViewDate] = useState(scheduleMonth);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const cells = useMemo(() => {
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: (Date | null)[] = Array.from({ length: startOffset }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) list.push(new Date(year, month, day));
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  const monthAssignments = assignments.filter((item) => {
    const date = parseIsoDate(item.shift.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  const monthCost = monthAssignments.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(viewDate);
  const todayKey = toLocalIsoDate(new Date());
  const onScheduleMonth = year === scheduleMonth.getFullYear() && month === scheduleMonth.getMonth();

  return (
    <Card className="overflow-hidden p-5 sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarRange size={20} className="text-moss" />
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-ink">Monthly calendar</h2>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {monthAssignments.length} assignment{monthAssignments.length === 1 ? "" : "s"} scheduled in {monthLabel}.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="rounded-2xl bg-sage/15 px-4 py-2.5 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Staff cost this month</p>
            <p className="mt-0.5 text-xl font-semibold tracking-[-0.03em] text-ink">{formatCurrency(monthCost)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
            >
              <ChevronLeft size={18} />
            </IconButton>
            <span className="min-w-[7.5rem] text-center text-sm font-semibold text-ink">{monthLabel}</span>
            <IconButton
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
            >
              <ChevronRight size={18} />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-ink-soft">
        {LEGEND.map(({ type, label, dot }) => (
          <span key={type} className="flex items-center gap-1.5">
            <i className={cn("size-2 rounded-full", dot)} /> {label}
          </span>
        ))}
        {!onScheduleMonth && (
          <button
            type="button"
            onClick={() => setViewDate(scheduleMonth)}
            className="ml-auto font-semibold text-moss hover:text-terracotta"
          >
            Jump to schedule
          </button>
        )}
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                {label}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-2">
            {cells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className="min-h-28 rounded-2xl bg-sand/25" />;
              const key = toLocalIsoDate(date);
              const dayAssignments = byDate.get(key) ?? [];
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-28 flex-col rounded-2xl border p-2 transition duration-300",
                    isToday ? "border-moss bg-sage/15" : "border-moss/10 bg-sand/45",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xs font-semibold", isToday ? "text-moss" : "text-ink")}>
                      {date.getDate()}
                    </span>
                    {dayAssignments.length > 0 && (
                      <span className="text-[10px] font-semibold text-ink-soft">{dayAssignments.length}</span>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {dayAssignments.map((assignment) => (
                      <div
                        key={`${assignment.shiftId}-${assignment.workerId}-${assignment.startTime}`}
                        className={cn("rounded-lg border px-1.5 py-1 leading-tight", TYPE_CHIP[assignment.workerType])}
                        title={`${assignment.worker.name} · ${assignment.shift.title} · ${formatTime(assignment.startTime)}–${formatTime(assignment.endTime)}`}
                      >
                        <span className="block truncate text-[11px] font-semibold">{assignment.worker.name}</span>
                        <span className="block truncate text-[10px] opacity-80">
                          {formatTime(assignment.startTime)}–{formatTime(assignment.endTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
