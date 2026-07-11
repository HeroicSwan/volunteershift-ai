"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Lightbulb,
  Mail,
  MessageSquareText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  AiAssistantInput,
  AiAssistantResult,
  ReminderDraft,
} from "@/types";

type CopyStatus = {
  key: string;
  state: "copied" | "error";
};

function CopyButton({
  copyKey,
  label,
  text,
  status,
  onCopy,
}: {
  copyKey: string;
  label: string;
  text: string;
  status: CopyStatus | null;
  onCopy: (key: string, text: string) => void;
}) {
  const active = status?.key === copyKey ? status.state : undefined;

  return (
    <Button type="button" variant="secondary" onClick={() => onCopy(copyKey, text)}>
      {active === "copied" ? <Check size={15} /> : <Clipboard size={15} />}
      {active === "copied" ? "Copied" : active === "error" ? "Copy failed" : label}
    </Button>
  );
}

function ReminderCard({
  reminder,
  assignmentCount,
  copyStatus,
  onCopy,
}: {
  reminder: ReminderDraft;
  assignmentCount: number;
  copyStatus: CopyStatus | null;
  onCopy: (key: string, text: string) => void;
}) {
  const emailText = `Subject: ${reminder.emailSubject}\n\n${reminder.emailBody}`;

  return (
    <details className="group overflow-hidden rounded-3xl border border-moss/15 bg-sand/75 shadow-[0_16px_40px_rgba(96,108,56,0.08)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-sage/10 px-5 py-4 marker:content-none">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">{reminder.workerName}</h3>
          <p className="mt-1 truncate text-xs text-ink-soft">{reminder.email}</p>
        </div>
        <Badge tone="sage">{assignmentCount} assignment{assignmentCount === 1 ? "" : "s"}</Badge>
        <ChevronDown size={18} className="shrink-0 text-moss group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="space-y-5 border-t border-moss/10 p-5">
        <section>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Mail size={16} className="text-moss" /> Email draft
          </div>
          <div className="mt-3 rounded-3xl bg-sand/65 p-4">
            <p className="text-xs font-semibold text-ink-soft">Subject</p>
            <p className="mt-1 text-sm font-semibold text-ink">{reminder.emailSubject}</p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{reminder.emailBody}</p>
          </div>
          <div className="mt-3">
            <CopyButton
              copyKey={`${reminder.workerId}-email`}
              label="Copy email"
              text={emailText}
              status={copyStatus}
              onCopy={onCopy}
            />
          </div>
        </section>

        <section className="border-t border-moss/10 pt-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageSquareText size={16} className="text-moss" /> SMS draft
          </div>
          <p className="mt-3 rounded-3xl bg-sage/10 p-4 text-sm leading-6 text-ink-soft">{reminder.smsBody}</p>
          <div className="mt-3">
            <CopyButton
              copyKey={`${reminder.workerId}-sms`}
              label="Copy SMS"
              text={reminder.smsBody}
              status={copyStatus}
              onCopy={onCopy}
            />
          </div>
        </section>
      </div>
    </details>
  );
}

export function AiAssistantSections({ input }: { input: AiAssistantInput }) {
  const [assistant, setAssistant] = useState<AiAssistantResult>();
  const [error, setError] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssistant() {
      try {
        const response = await fetch("/api/ai-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("The schedule assistant could not load.");
        const result = (await response.json()) as AiAssistantResult;
        setAssistant(result);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError("The schedule assistant could not load. Your generated schedule is still available below.");
      }
    }

    loadAssistant();
    return () => controller.abort();
  }, [input, retryCount]);

  function retry() {
    setAssistant(undefined);
    setError(undefined);
    setRetryCount((count) => count + 1);
  }

  async function copyMessage(key: string, text: string) {
    let copied = false;

    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Clipboard timeout")), 800)),
      ]);
      copied = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    }

    setCopyStatus({ key, state: copied ? "copied" : "error" });
  }

  if (error) {
    return (
      <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-terracotta/15 text-terracotta-dark">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 className="font-semibold text-ink">AI Summary unavailable</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">{error}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={retry}>
          <RefreshCw size={16} /> Retry
        </Button>
      </Card>
    );
  }

  if (!assistant) {
    return (
      <div className="space-y-5" aria-live="polite" aria-label="Loading AI schedule summary">
        <Card className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 animate-pulse place-items-center rounded-2xl bg-sage/25 text-moss">
              <Sparkles size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Preparing AI Summary</h2>
              <p className="mt-1 text-sm text-ink-soft">Reviewing coverage, workload, and reminder details.</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-4 w-full animate-pulse rounded-full bg-sage/15" />
            <div className="h-4 w-4/5 animate-pulse rounded-full bg-sage/15" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-sage/15" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="p-5 sm:p-7" aria-labelledby="ai-summary-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-moss" />
              <h2 id="ai-summary-heading" className="text-xl font-semibold tracking-[-0.03em] text-ink">AI Summary</h2>
            </div>
            <p className="mt-2 text-sm text-ink-soft">A coordinator-ready explanation of this generated schedule.</p>
          </div>
          <Badge tone={assistant.source === "openai" ? "moss" : "sage"}>
            {assistant.source === "openai" ? "OpenAI-assisted" : "Built-in assistant"}
          </Badge>
        </div>

        {assistant.warning && (
          <p className="mt-5 flex gap-2 rounded-3xl bg-ochre/15 px-4 py-3 text-xs leading-5 text-ink">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-ochre" /> {assistant.warning}
          </p>
        )}

        <p className="mt-6 text-sm leading-7 text-ink-soft sm:text-base">{assistant.explanation}</p>

        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          <section className="rounded-3xl bg-terracotta/10 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <AlertTriangle size={17} className="text-terracotta-dark" /> Risks and gaps
            </div>
            <ul className="mt-4 space-y-3">
              {assistant.risks.map((risk) => (
                <li key={risk} className="flex gap-2.5 text-sm leading-6 text-ink-soft">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-terracotta" /> {risk}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl bg-sage/15 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Lightbulb size={17} className="text-moss" /> Suggested next actions
            </div>
            <ul className="mt-4 space-y-3">
              {assistant.nextActions.map((action) => (
                <li key={action} className="flex gap-2.5 text-sm leading-6 text-ink-soft">
                  <CheckCircle2 size={15} className="mt-1 shrink-0 text-moss" /> {action}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Card>

      <section className="space-y-4" aria-labelledby="reminder-drafts-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="reminder-drafts-heading" className="text-xl font-semibold tracking-[-0.03em] text-ink">Reminder Drafts</h2>
            <p className="mt-1 text-sm text-ink-soft">Drafts only—nothing has been emailed or texted.</p>
          </div>
          <Badge tone="oat">{assistant.reminders.length} workers</Badge>
        </div>

        {assistant.reminders.length === 0 ? (
          <Card className="p-6 text-sm text-ink-soft">No reminder drafts were created because no workers are assigned.</Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {assistant.reminders.map((reminder) => (
              <ReminderCard
                key={reminder.workerId}
                reminder={reminder}
                assignmentCount={input.assignments.filter((assignment) => assignment.workerId === reminder.workerId).length}
                copyStatus={copyStatus}
                onCopy={copyMessage}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
