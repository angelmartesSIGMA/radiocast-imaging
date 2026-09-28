import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StudioLoader from "@/components/studio/StudioLoader";
import { UUID_RE } from "@/lib/api";

export const metadata: Metadata = { title: "Studio · Radiocast Imaging" };

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return <StudioLoader sessionId={id} />;
}
