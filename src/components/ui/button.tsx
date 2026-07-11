import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export function buttonStyles(variant: ButtonVariant = "primary") {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" &&
      "bg-terracotta-dark text-sand shadow-[0_8px_20px_rgba(68,80,34,0.14)] hover:bg-[#682f19]",
    variant === "secondary" &&
      "border border-moss/20 bg-sand/70 text-ink hover:border-moss/35 hover:bg-sand",
    variant === "quiet" && "text-moss hover:bg-moss/10",
    variant === "danger" && "bg-terracotta-dark text-sand hover:bg-[#682f19]",
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles(variant), className)} {...props} />;
}
