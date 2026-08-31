import { redirect, notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function LegacyMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  redirect(`/training/${id}`);
}
