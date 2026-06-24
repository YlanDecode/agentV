"use client";

import { useParams } from "next/navigation";
import { DocumentUsageDetail } from "@/components/admin/document-usage-detail";

export function DocumentUsagePageContent() {
  const params = useParams<{ documentId: string }>();
  const documentId = Number.parseInt(String(params?.documentId || "").trim(), 10);

  return <DocumentUsageDetail documentId={documentId} />;
}
