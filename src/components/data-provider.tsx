"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { createSampleData, createTestStaff, createTestStaffShifts } from "@/lib/sample-data";
import { generateOptimizedSchedule } from "@/lib/scheduler";
import {
  getDataSnapshot,
  getServerDataSnapshot,
  saveData,
  subscribeToData,
} from "@/lib/storage";
import type {
  ImportMode,
  ShiftInput,
  VolunteerMatcherData,
  WorkerInput,
} from "@/types";
import type { AiScheduleGeneration } from "@/lib/ai-scheduler";

type DataContextValue = VolunteerMatcherData & {
  hydrated: boolean;
  seedSampleData: () => void;
  generateTestStaff: () => void;
  addWorker: (worker: WorkerInput) => void;
  updateWorker: (id: string, worker: WorkerInput) => void;
  deleteWorker: (id: string) => void;
  addShift: (shift: ShiftInput) => void;
  updateShift: (id: string, shift: ShiftInput) => void;
  deleteShift: (id: string) => void;
  importWorkers: (workers: WorkerInput[], mode: ImportMode) => void;
  importShifts: (shifts: ShiftInput[], mode: ImportMode) => void;
  generateSchedule: () => Promise<AiScheduleGeneration>;
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeToData, getDataSnapshot, getServerDataSnapshot);
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const data = useMemo<VolunteerMatcherData>(() => JSON.parse(snapshot), [snapshot]);

  function seedSampleData() {
    const sampleData = createSampleData();
    saveData(sampleData);
  }

  function generateTestStaff() {
    const sampleData = createSampleData();
    const sampleShiftTitles = new Set(sampleData.shifts.map((shift) => shift.title));
    const hasDemoNonprofitShifts = sampleData.shifts.some((sampleShift) =>
      data.shifts.some((shift) => shift.title === sampleShift.title),
    );
    const existingByEmail = new Map(data.workers.map((worker) => [worker.email.toLowerCase(), worker]));
    const generated = [
      ...(hasDemoNonprofitShifts ? sampleData.workers : []),
      ...createTestStaff(),
    ].map((worker) => ({
      ...worker,
      id: existingByEmail.get(worker.email.toLowerCase())?.id ?? crypto.randomUUID(),
    }));
    const generatedEmails = new Set(generated.map((worker) => worker.email.toLowerCase()));
    const isTestCompanyWorker = (email: string) => email.toLowerCase().startsWith("test.");
    const existingShiftByKey = new Map(data.shifts.map((shift) => [`${shift.title}|${shift.date}`, shift]));
    const existingShiftByTitle = new Map(data.shifts.map((shift) => [shift.title, shift]));
    const generatedShifts = [
      ...(hasDemoNonprofitShifts ? sampleData.shifts : []),
      ...createTestStaffShifts(),
    ].map((shift) => {
      const key = `${shift.title}|${shift.date}`;
      return { ...shift, id: existingShiftByKey.get(key)?.id ?? existingShiftByTitle.get(shift.title)?.id ?? crypto.randomUUID() };
    });
    const generatedShiftKeys = new Set(generatedShifts.map((shift) => `${shift.title}|${shift.date}`));
    const generatedShiftTitles = new Set(generatedShifts.map((shift) => shift.title));

    saveData({
      ...data,
      workers: [
        ...data.workers.filter((worker) => !generatedEmails.has(worker.email.toLowerCase()) && !isTestCompanyWorker(worker.email)),
        ...generated,
      ],
      shifts: [
        ...data.shifts.filter(
          (shift) =>
            !generatedShiftKeys.has(`${shift.title}|${shift.date}`) &&
            !generatedShiftTitles.has(shift.title) &&
            !(hasDemoNonprofitShifts && sampleShiftTitles.has(shift.title)),
        ),
        ...generatedShifts,
      ],
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function addWorker(worker: WorkerInput) {
    saveData({
      ...data,
      workers: [...data.workers, { ...worker, id: crypto.randomUUID() }],
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function updateWorker(id: string, worker: WorkerInput) {
    saveData({
      ...data,
      workers: data.workers.map((item) => (item.id === id ? { ...worker, id } : item)),
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function deleteWorker(id: string) {
    saveData({
      ...data,
      workers: data.workers.filter((worker) => worker.id !== id),
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function addShift(shift: ShiftInput) {
    saveData({
      ...data,
      shifts: [...data.shifts, { ...shift, id: crypto.randomUUID() }],
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function updateShift(id: string, shift: ShiftInput) {
    saveData({
      ...data,
      shifts: data.shifts.map((item) => (item.id === id ? { ...shift, id } : item)),
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function deleteShift(id: string) {
    saveData({
      ...data,
      shifts: data.shifts.filter((shift) => shift.id !== id),
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function importWorkers(items: WorkerInput[], mode: ImportMode) {
    const imported = items.map((item) => ({ ...item, id: crypto.randomUUID() }));
    saveData({
      ...data,
      workers: mode === "replace" ? imported : [...data.workers, ...imported],
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  function importShifts(items: ShiftInput[], mode: ImportMode) {
    const imported = items.map((item) => ({ ...item, id: crypto.randomUUID() }));
    saveData({
      ...data,
      shifts: mode === "replace" ? imported : [...data.shifts, ...imported],
      assignments: [],
      scheduleGeneratedAt: undefined,
      isSampleData: false,
    });
  }

  async function generateSchedule() {
    let generated: AiScheduleGeneration;
    try {
      const response = await fetch("/api/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workers: data.workers, shifts: data.shifts }),
      });
      if (!response.ok) throw new Error("Schedule API request failed");
      generated = (await response.json()) as AiScheduleGeneration;
    } catch {
      generated = {
        result: generateOptimizedSchedule(data.workers, data.shifts),
        source: "deterministic",
        warning: "The AI scheduling service could not be reached, so the deterministic safety scheduler was used.",
      };
    }
    saveData({
      ...data,
      assignments: generated.result.assignments,
      scheduleGeneratedAt: new Date().toISOString(),
      scheduleGenerationSource: generated.source,
      scheduleGenerationWarning: generated.warning,
    });
    return generated;
  }

  return (
    <DataContext.Provider
      value={{
        ...data,
        hydrated,
        seedSampleData,
        generateTestStaff,
        addWorker,
        updateWorker,
        deleteWorker,
        addShift,
        updateShift,
        deleteShift,
        importWorkers,
        importShifts,
        generateSchedule,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useVolunteerMatcherData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useVolunteerMatcherData must be used inside DataProvider");
  }
  return context;
}
