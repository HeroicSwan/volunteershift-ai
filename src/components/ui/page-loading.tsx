import { Card } from "@/components/ui/card";

export function PageLoading({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="space-y-7" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="space-y-3">
        <div className="h-10 w-56 animate-pulse rounded-2xl bg-sand/60" />
        <div className="h-5 w-full max-w-xl animate-pulse rounded-full bg-sand/45" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="h-36 animate-pulse bg-sand/55" />
        ))}
      </div>
      <Card className="h-72 animate-pulse bg-sand/55" />
    </div>
  );
}
