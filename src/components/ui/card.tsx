import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-moss/15 bg-sand/75 shadow-[0_16px_40px_rgba(96,108,56,0.08)] backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
