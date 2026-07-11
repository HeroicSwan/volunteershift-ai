"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Download, RefreshCw, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { downloadCsv, type CsvImportResult } from "@/lib/csv";
import { cn } from "@/lib/utils";
import type { ImportMode } from "@/types";

const PREVIEW_ROW_LIMIT = 8;
const ERROR_ROW_LIMIT = 12;

export type CsvPreviewColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
};

type LoadedCsv<T> = {
  fileName: string;
  result: CsvImportResult<T>;
};

export function CsvImportDialog<T>({
  open,
  onOpenChange,
  entityLabel,
  description,
  columnsHint,
  templateFilename,
  buildTemplate,
  existingCount,
  parseFile,
  previewColumns,
  getDuplicateWarning,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: { singular: string; plural: string };
  description: string;
  columnsHint: string;
  templateFilename: string;
  buildTemplate: () => string;
  existingCount: number;
  parseFile: (text: string) => CsvImportResult<T>;
  previewColumns: Array<CsvPreviewColumn<T>>;
  getDuplicateWarning?: (rows: T[]) => string | null;
  onImport: (rows: T[], mode: ImportMode) => void;
}) {
  const [loaded, setLoaded] = useState<LoadedCsv<T> | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const [dragActive, setDragActive] = useState(false);

  const inputId = `csv-file-input-${entityLabel.plural}`;
  const validRows = loaded?.result.rows ?? [];
  const importCount = validRows.length;
  const importLabel = `Import ${importCount} ${importCount === 1 ? entityLabel.singular : entityLabel.plural}`;
  const duplicateWarning =
    mode === "append" && importCount > 0 && getDuplicateWarning ? getDuplicateWarning(validRows) : null;

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setLoaded(null);
      setMode("append");
      setDragActive(false);
    }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    try {
      setLoaded({ fileName: file.name, result: parseFile(await file.text()) });
    } catch {
      setLoaded({
        fileName: file.name,
        result: {
          fileError: "Could not read that file. Choose a plain CSV file and try again.",
          rows: [],
          rowErrors: [],
        },
      });
    }
  }

  function downloadTemplate() {
    downloadCsv(templateFilename, buildTemplate());
  }

  function runImport() {
    if (importCount === 0) return;
    onImport(validRows, existingCount > 0 ? mode : "append");
    handleOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Import ${entityLabel.plural}`}
      description={description}
    >
      {!loaded ? (
        <div className="mt-6 space-y-4">
          <input
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              loadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              loadFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-moss/25 bg-sand/55 px-6 py-10 text-center transition duration-300 hover:border-moss/45 hover:bg-sand/80",
              dragActive && "border-moss bg-sage/15",
            )}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-sage/25 text-moss">
              <Upload size={22} strokeWidth={1.8} />
            </span>
            <span className="text-sm font-semibold text-ink">Choose a CSV file or drag it here</span>
            <span className="max-w-md text-xs leading-5 text-ink-soft">
              Separate multiple values inside a cell with semicolons, e.g. Monday;Thursday.
            </span>
          </label>
          <div className="rounded-3xl bg-sand/55 p-4">
            <p className="text-xs font-semibold text-ink">Expected columns</p>
            <p className="mt-1.5 text-xs leading-5 text-ink-soft">{columnsHint}</p>
          </div>
          <Button type="button" variant="quiet" onClick={downloadTemplate}>
            <Download size={16} /> Download sample template
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold text-ink">{loaded.fileName}</p>
            <Button type="button" variant="quiet" onClick={() => setLoaded(null)}>
              <RefreshCw size={15} /> Choose a different file
            </Button>
          </div>

          {loaded.result.fileError ? (
            <div className="rounded-3xl border border-terracotta/25 bg-terracotta/10 p-5">
              <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-terracotta-dark">
                <AlertTriangle size={17} className="mt-1 shrink-0" /> {loaded.result.fileError}
              </p>
              <Button type="button" variant="secondary" className="mt-4" onClick={downloadTemplate}>
                <Download size={16} /> Download sample template
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={importCount > 0 ? "moss" : "oat"}>
                  {importCount} {importCount === 1 ? "row" : "rows"} ready to import
                </Badge>
                {loaded.result.rowErrors.length > 0 && (
                  <Badge tone="clay">
                    {loaded.result.rowErrors.length} {loaded.result.rowErrors.length === 1 ? "row" : "rows"} with errors
                  </Badge>
                )}
              </div>

              {loaded.result.rowErrors.length > 0 && (
                <div className="rounded-3xl border border-terracotta/25 bg-terracotta/10 p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-terracotta-dark">
                    <AlertTriangle size={16} />
                    {loaded.result.rowErrors.length === 1
                      ? "1 row has errors and will be skipped"
                      : `${loaded.result.rowErrors.length} rows have errors and will be skipped`}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {loaded.result.rowErrors.slice(0, ERROR_ROW_LIMIT).map((error) => (
                      <li key={error.row} className="text-xs leading-5 text-ink">
                        <span className="font-semibold">Row {error.row}:</span> {error.messages.join(" ")}
                      </li>
                    ))}
                  </ul>
                  {loaded.result.rowErrors.length > ERROR_ROW_LIMIT && (
                    <p className="mt-2 text-xs font-semibold text-ink-soft">
                      +{loaded.result.rowErrors.length - ERROR_ROW_LIMIT} more rows with errors.
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-ink-soft">
                    Fix these rows in your spreadsheet and import the file again to include them.
                  </p>
                </div>
              )}

              {duplicateWarning && (
                <p className="flex items-start gap-2 rounded-3xl bg-ochre/15 px-4 py-3 text-xs leading-5 text-ink">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-ochre" /> {duplicateWarning}
                </p>
              )}

              {importCount > 0 && (
                <div className="overflow-hidden rounded-3xl border border-moss/15">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="border-b border-moss/10 bg-sage/10 text-xs font-semibold text-ink-soft">
                        <tr>
                          {previewColumns.map((column) => (
                            <th key={column.header} scope="col" className="whitespace-nowrap px-4 py-3">
                              {column.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-moss/10 bg-sand/40">
                        {validRows.slice(0, PREVIEW_ROW_LIMIT).map((row, index) => (
                          <tr key={index}>
                            {previewColumns.map((column) => (
                              <td key={column.header} className="whitespace-nowrap px-4 py-3 text-sm text-ink">
                                {column.cell(row)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importCount > PREVIEW_ROW_LIMIT && (
                    <p className="border-t border-moss/10 bg-sand/40 px-4 py-2.5 text-xs font-semibold text-ink-soft">
                      +{importCount - PREVIEW_ROW_LIMIT} more {entityLabel.plural} not shown in this preview.
                    </p>
                  )}
                </div>
              )}

              {importCount > 0 && existingCount > 0 && (
                <fieldset>
                  <legend className="text-sm font-semibold text-ink">How should these rows be added?</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        {
                          value: "append",
                          title: "Add to existing",
                          detail: `Keep your current ${existingCount} ${existingCount === 1 ? entityLabel.singular : entityLabel.plural} and add the new rows.`,
                        },
                        {
                          value: "replace",
                          title: "Replace all",
                          detail: `Delete your current ${existingCount} ${existingCount === 1 ? entityLabel.singular : entityLabel.plural} before importing.`,
                        },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={mode === option.value}
                        onClick={() => setMode(option.value)}
                        className={cn(
                          "rounded-2xl border p-4 text-left transition duration-300",
                          mode === option.value ? "border-moss bg-sage/15" : "border-moss/15 bg-sand/55 hover:border-moss/30",
                        )}
                      >
                        <span className="block text-sm font-semibold text-ink">{option.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-ink-soft">{option.detail}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          )}

          <div className="sticky bottom-0 -mx-5 flex justify-end gap-3 border-t border-moss/10 bg-oat/95 px-5 py-4 backdrop-blur-xl sm:-mx-7 sm:px-7">
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
              <X size={16} /> Cancel
            </Button>
            {mode === "replace" && existingCount > 0 && importCount > 0 ? (
              <ConfirmDialog
                trigger={
                  <Button type="button">
                    <Upload size={16} /> {importLabel}
                  </Button>
                }
                title={`Replace all ${existingCount} ${entityLabel.plural}?`}
                description={`This deletes your current ${entityLabel.plural} before importing and cannot be undone.`}
                confirmLabel="Replace and import"
                onConfirm={runImport}
              />
            ) : (
              <Button type="button" onClick={runImport} disabled={importCount === 0}>
                <Upload size={16} /> {importCount === 0 ? "Nothing to import" : importLabel}
              </Button>
            )}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
