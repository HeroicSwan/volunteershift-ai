import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "sage" | "clay" | "moss" | "oat";

export function Badge({
  className,
  tone = "sage",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "sage" && "bg-sage/20 text-ink",
        tone === "clay" && "bg-terracotta/15 text-terracotta-dark",
        tone === "moss" && "bg-moss text-sand",
        tone === "oat" && "bg-oat/70 text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}
