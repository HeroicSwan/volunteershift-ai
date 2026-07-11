"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-moss/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-moss/15 bg-oat p-5 shadow-[0_28px_80px_rgba(55,65,51,0.28)] outline-none sm:p-7">
          <div className="flex items-start justify-between gap-5 border-b border-moss/10 pb-5">
            <div>
              <Dialog.Title className="text-2xl font-semibold tracking-[-0.035em] text-ink">{title}</Dialog.Title>
              <Dialog.Description className="mt-1.5 max-w-xl text-sm leading-6 text-ink-soft">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label="Close dialog" className="shrink-0">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
