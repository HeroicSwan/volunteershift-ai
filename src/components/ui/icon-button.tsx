import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-grid size-9 place-items-center rounded-xl border border-moss/15 bg-sand/55 text-ink-soft transition duration-300 hover:border-moss/30 hover:bg-sage/20 hover:text-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss",
        className,
      )}
      {...props}
    />
  );
}
