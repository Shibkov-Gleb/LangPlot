import { LessonPlayer } from '../last-row/lesson-player';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LessonPlayer key={slug} slug={slug} />;
}
