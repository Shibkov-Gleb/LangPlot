import { TheoryPage } from '@/components/theory-page';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TheoryPage slug={slug} />;
}
