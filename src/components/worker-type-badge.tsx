import { Badge } from "@/components/ui/badge";
import { WORKER_TYPE_LABELS, type WorkerType } from "@/types";

const workerTypeTone = {
  volunteer: "sage",
  paid_employee: "oat",
  supervisor: "moss",
} as const;

export function WorkerTypeBadge({
  workerType,
  className,
}: {
  workerType: WorkerType;
  className?: string;
}) {
  return (
    <Badge tone={workerTypeTone[workerType]} className={className}>
      {WORKER_TYPE_LABELS[workerType]}
    </Badge>
  );
}
