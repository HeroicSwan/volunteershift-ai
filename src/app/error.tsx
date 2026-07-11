"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="flex min-h-96 flex-col items-center justify-center px-6 py-14 text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-2xl bg-terracotta/15 text-terracotta-dark">
        <AlertTriangle size={25} strokeWidth={1.8} />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-ink">This page could not load</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">
        Your workspace data is still stored in this browser. Try the page again to continue planning.
      </p>
      <Button className="mt-6" onClick={reset}>
        <RefreshCw size={16} /> Try again
      </Button>
    </Card>
  );
}
