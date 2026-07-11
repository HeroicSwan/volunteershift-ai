"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactElement } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[90] bg-moss/55 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[100] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-moss/15 bg-oat p-6 shadow-[0_28px_80px_rgba(55,65,51,0.28)] outline-none sm:p-7">
          <span className="grid size-11 place-items-center rounded-2xl bg-terracotta/15 text-terracotta-dark">
            <AlertTriangle size={21} />
          </span>
          <AlertDialog.Title className="mt-5 text-xl font-semibold tracking-[-0.025em] text-ink">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-6 text-ink-soft">
            {description}
          </AlertDialog.Description>
          <div className="mt-7 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
