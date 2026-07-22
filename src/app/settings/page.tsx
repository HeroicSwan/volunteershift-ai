"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormLabel, Input } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  const desktop = typeof window !== "undefined" ? window.volunteerShiftDesktop : undefined;
  const [configured, setConfigured] = useState(false);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("gpt-5.4-mini");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    desktop.getAiConfig().then((config) => {
      setConfigured(config.configured);
      setSecureStorageAvailable(config.secureStorageAvailable);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
    }).catch(() => setError("Could not read desktop AI settings."));
  }, [desktop]);

  async function save() {
    if (!desktop) return;
    setBusy(true); setStatus(""); setError("");
    try {
      const config = await desktop.saveAiConfig({ apiKey, baseUrl, model });
      setConfigured(config.configured); setSecureStorageAvailable(config.secureStorageAvailable); setApiKey("");
      setStatus("Saved securely. The key is never sent back to this page.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save AI settings.");
    } finally { setBusy(false); }
  }

  async function clear() {
    if (!desktop) return;
    setBusy(true); setStatus(""); setError("");
    try { const config = await desktop.clearAiConfig(); setConfigured(config.configured); setStatus("Stored desktop key removed."); }
    catch { setError("Could not remove the stored key."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-7">
      <PageHeader title="Settings" description="Connect an AI provider for schedule planning without exposing credentials to the app page." />
      {!desktop ? (
        <Card className="p-6 sm:p-8">
          <KeyRound className="text-moss" />
          <h2 className="mt-5 text-xl font-semibold">Desktop settings only</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Secure OS credential storage is available in the installed desktop app. For local web development, use OPENAI_API_KEY in .env.local; it is never committed.</p>
        </Card>
      ) : (
        <Card className="max-w-2xl p-6 sm:p-8">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-moss" /><div><h2 className="text-xl font-semibold">AI provider</h2><p className="mt-1 text-sm text-ink-soft">{configured ? "A provider key is configured." : "No provider key is configured; deterministic scheduling remains available."}</p></div></div>
          <div className="mt-7 space-y-5">
            <div><FormLabel htmlFor="api-key">API key</FormLabel><Input id="api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={configured ? "Enter a new key to replace it" : "sk-…"} /></div>
            <div><FormLabel htmlFor="base-url">API base URL <span className="font-normal text-ink-soft">(optional)</span></FormLabel><Input id="base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></div>
            <div><FormLabel htmlFor="model">Model</FormLabel><Input id="model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-5.4-mini" /></div>
          </div>
          {!secureStorageAvailable && <p className="mt-5 text-sm font-medium text-terracotta-dark" role="alert">OS secure storage is unavailable, so a key cannot be saved on this device.</p>}
          {status && <p className="mt-5 text-sm font-medium text-moss" role="status">{status}</p>}
          {error && <p className="mt-5 text-sm font-medium text-terracotta-dark" role="alert">{error}</p>}
          <div className="mt-7 flex flex-wrap gap-3"><Button onClick={save} disabled={busy || !secureStorageAvailable || apiKey.trim().length < 10}>{busy ? "Saving…" : "Save securely"}</Button>{configured && <Button variant="secondary" onClick={clear} disabled={busy}>Remove stored key</Button>}</div>
          <p className="mt-5 text-xs leading-5 text-ink-soft">The key is encrypted with Electron safeStorage in the main process. This page only receives a configured/not-configured status.</p>
        </Card>
      )}
    </div>
  );
}
