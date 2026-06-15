import { RagDocuments } from "@/components/rag/rag-documents";

export default function RagPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-xl font-semibold">Documents RAG</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gérez les documents utilisés par la recherche contextuelle. Formats acceptés : .txt, .md, .csv.
        </p>
      </div>
      <RagDocuments />
    </div>
  );
}
