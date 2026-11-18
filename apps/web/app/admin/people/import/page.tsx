import { PageHeader } from "@/components/app-shell";
import { CSV_HEADER } from "@/lib/csv";
import { CsvImport } from "./csv-import";

export default function ImportPeoplePage() {
  return (
    <>
      <PageHeader
        title="Import people (CSV)"
        description={`Columns: ${CSV_HEADER.join(", ")}. role is student when empty. Nothing is created until you confirm the preview.`}
      />
      <CsvImport />
    </>
  );
}
