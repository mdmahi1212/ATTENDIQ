"use client";

import { useState, type ReactNode } from "react";
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Server pages pre-render cells; sort/search values stay plain so the table can sort/filter them. */
export type DataRow = {
  id: string;
  cells: Record<string, ReactNode>;
  sort?: Record<string, string | number>;
  search?: string;
};
export type DataColumn = { id: string; header: string; sortable?: boolean; className?: string };

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

export function DataTable({
  columns,
  rows,
  searchPlaceholder = "Search…",
  empty = "Nothing here yet.",
}: {
  columns: DataColumn[];
  rows: DataRow[];
  searchPlaceholder?: string;
  empty?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [tableColumns] = useState(() => [
    {
      id: "__search",
      accessorFn: (r: DataRow) => r.search ?? "",
      enableSorting: false,
      enableGlobalFilter: true,
    },
    ...columns.map((c) => ({
      id: c.id,
      header: c.header,
      accessorFn: (r: DataRow) => r.sort?.[c.id] ?? "",
      enableSorting: c.sortable ?? false,
      enableGlobalFilter: false,
      sortFn: "alphanumeric" as const,
      cell: (ctx: { row: { original: DataRow } }) => ctx.row.original.cells[c.id] ?? null,
    })),
  ]);

  const table = useTable({
    features,
    columns: tableColumns,
    data: rows,
    getRowId: (r: DataRow) => r.id,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
  });

  const visible = (id: string) => id !== "__search";

  return (
    <div className="space-y-3">
      <Input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label="Search table"
        className="max-w-sm"
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers
                  .filter((h) => visible(h.column.id))
                  .map((header) => {
                    const sorted = header.column.getIsSorted();
                    const col = columns.find((c) => c.id === header.column.id);
                    return (
                      <TableHead key={header.id} className={col?.className}>
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            {col?.header}
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          col?.header
                        )}
                      </TableHead>
                    );
                  })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row
                    .getAllCells()
                    .filter((cell) => visible(cell.column.id))
                    .map((cell) => (
                      <TableCell key={cell.id} className={columns.find((c) => c.id === cell.column.id)?.className}>
                        {row.original.cells[cell.column.id] ?? null}
                      </TableCell>
                    ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {table.getRowModel().rows.length} of {rows.length} rows
      </p>
    </div>
  );
}
