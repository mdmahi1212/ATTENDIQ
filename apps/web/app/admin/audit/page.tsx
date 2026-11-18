import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changedKeys } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";

const PAGE = 50;
const ENTITIES = ["attendance", "enrollments", "face_profiles", "section_staff", "profiles", "class_sessions"];

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" && ENTITIES.includes(sp.entity) ? sp.entity : undefined;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const supabase = await createClient();
  let q = supabase
    .from("audit_log")
    .select("id, actor, action, entity, entity_id, before, after, reason, at", { count: "exact" })
    .order("at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (entity) q = q.eq("entity", entity);
  const { data, count } = await q;
  const actorIds = [...new Set((data ?? []).map((r) => r.actor).filter((a): a is string => !!a))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const name = new Map((actors ?? []).map((a) => [a.id, a.full_name]));
  const link = (p: Record<string, string | number | undefined>) =>
    "/admin/audit?" + new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

  return (
    <>
      <PageHeader title="Audit log" description="Every change to attendance, enrollments, face profiles, staff and roles (written by database triggers)." />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href={link({})} className={!entity ? "font-semibold underline" : "underline"}>
          all
        </Link>
        {ENTITIES.map((e) => (
          <Link key={e} href={link({ entity: e })} className={entity === e ? "font-semibold underline" : "underline"}>
            {e}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When (KST)</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Changed</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{fmtSeoul(r.at, "MM-dd HH:mm:ss")}</TableCell>
                <TableCell>{r.actor ? name.get(r.actor) ?? r.actor.slice(0, 8) : <Pill>system</Pill>}</TableCell>
                <TableCell>{r.action}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.entity}
                  <br />
                  {r.entity_id?.slice(0, 40)}
                </TableCell>
                <TableCell className="max-w-md text-xs">
                  {changedKeys(r.before, r.after).map((c) => (
                    <div key={c.key}>
                      <strong>{c.key}</strong>: {c.from} → {c.to}
                    </div>
                  ))}
                </TableCell>
                <TableCell className="text-xs">{r.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm">
        {page > 0 && <Link href={link({ entity, page: page - 1 })} className="underline">Newer</Link>}
        <span className="text-muted-foreground">
          Page {page + 1} of {Math.max(1, Math.ceil((count ?? 0) / PAGE))}
        </span>
        {(page + 1) * PAGE < (count ?? 0) && <Link href={link({ entity, page: page + 1 })} className="underline">Older</Link>}
      </div>
    </>
  );
}
