"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parsePeopleCsv, type CsvPreviewRow } from "@/lib/csv";
import { importPeople, type ImportResult } from "../actions";

export function CsvImport() {
  const [rows, setRows] = useState<CsvPreviewRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [pending, start] = useTransition();
  const valid = rows.filter((r): r is Extract<CsvPreviewRow, { ok: true }> => r.ok);

  async function onFile(file: File | undefined) {
    setResults(null);
    if (!file) return;
    const parsed = parsePeopleCsv(await file.text());
    setRows(parsed.rows);
    setHeaderErrors(parsed.headerErrors);
  }

  function confirmImport() {
    start(async () => {
      const res = await importPeople(valid.map((r) => r.value));
      (res.ok ? toast.success : toast.error)(res.message);
      setResults(res.results);
    });
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="block text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1"
      />
      {headerErrors.map((e) => (
        <p key={e} className="text-sm text-destructive">
          {e}
        </p>
      ))}
      {rows.length > 0 && !results && (
        <>
          <p className="text-sm">
            {valid.length} valid · {rows.length - valid.length} with errors (skipped)
          </p>
          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Student no.</TableHead>
                  <TableHead>Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.line} className={r.ok ? undefined : "bg-red-50"}>
                    <TableCell>{r.line}</TableCell>
                    <TableCell>{r.ok ? r.value.email : r.raw.email}</TableCell>
                    <TableCell>{r.ok ? r.value.full_name : r.raw.full_name}</TableCell>
                    <TableCell>{r.ok ? r.value.role : r.raw.role}</TableCell>
                    <TableCell>{r.ok ? r.value.student_no ?? "—" : r.raw.student_no}</TableCell>
                    <TableCell>{r.ok ? <Pill tone="green">ok</Pill> : <span className="text-xs text-destructive">{r.errors.join("; ")}</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button onClick={confirmImport} disabled={pending || valid.length === 0}>
            {pending ? "Importing…" : `Create ${valid.length} accounts`}
          </Button>
        </>
      )}
      {results && (
        <div className="space-y-2">
          <p className="text-sm">Set-password links are shown once. Copy them now.</p>
          <ul className="divide-y rounded-lg border text-sm">
            {results.map((r) => (
              <li key={r.email} className="grid gap-1 px-3 py-2">
                <span>
                  {r.email} {r.ok ? <Pill tone="green">created</Pill> : <Pill tone="red">{r.message}</Pill>}
                </span>
                {r.link && <code className="overflow-x-auto text-xs text-muted-foreground">{r.link}</code>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
