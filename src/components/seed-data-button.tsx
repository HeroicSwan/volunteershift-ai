"use client";

import { FlaskConical, Sprout } from "lucide-react";
import { useVolunteerMatcherData } from "@/components/data-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ButtonVariant } from "@/components/ui/button";

export function SeedDataButton({
  compact = false,
  variant = "primary",
}: {
  compact?: boolean;
  variant?: ButtonVariant;
}) {
  const { seedSampleData, workers, shifts, isSampleData } = useVolunteerMatcherData();
  const hasWorkspaceData = workers.length > 0 || shifts.length > 0;

  const trigger = (
    <Button
      variant={variant}
      onClick={hasWorkspaceData ? undefined : seedSampleData}
      className={compact ? "w-full" : undefined}
    >
      <Sprout size={17} />
      {isSampleData ? "Reload demo data" : "Load demo nonprofit"}
    </Button>
  );

  if (hasWorkspaceData) {
    return (
      <ConfirmDialog
        trigger={trigger}
        title={isSampleData ? "Reload the latest demo data?" : "Replace this workspace with demo data?"}
        description={
          isSampleData
            ? "This refreshes the sample nonprofit workspace with the latest workers and shifts, and clears the current generated schedule. Generate again afterward to see the new plan."
            : "This replaces the current workers, shifts, and generated schedule with the sample nonprofit workspace. This action cannot be undone."
        }
        confirmLabel={isSampleData ? "Reload demo data" : "Load demo data"}
        onConfirm={seedSampleData}
      />
    );
  }

  return trigger;
}

export function GenerateTestStaffButton({
  compact = false,
  variant = "secondary",
}: {
  compact?: boolean;
  variant?: ButtonVariant;
}) {
  const { generateTestStaff } = useVolunteerMatcherData();

  return (
    <Button variant={variant} onClick={generateTestStaff} className={compact ? "w-full" : undefined}>
      <FlaskConical size={17} /> Generate test company data
    </Button>
  );
}
