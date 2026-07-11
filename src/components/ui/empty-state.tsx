import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex min-h-80 flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-sage/25 text-moss">
        <Icon size={25} strokeWidth={1.8} />
      </div>
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}
