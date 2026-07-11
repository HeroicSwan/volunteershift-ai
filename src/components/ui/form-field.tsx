import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const fieldStyles =
  "min-h-11 w-full rounded-2xl border border-moss/20 bg-sand/70 px-3.5 text-sm text-ink outline-none transition duration-300 placeholder:text-ink-soft/60 focus:border-moss/45 focus:ring-3 focus:ring-sage/20";

export function FormLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-2 block text-sm font-semibold text-ink", className)} {...props} />;
}

export function FormError({ children }: { children?: string }) {
  return children ? <p className="mt-1.5 text-xs font-medium text-terracotta-dark" role="alert">{children}</p> : null;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldStyles, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldStyles, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldStyles, "min-h-28 resize-y py-3", className)} {...props} />;
}
