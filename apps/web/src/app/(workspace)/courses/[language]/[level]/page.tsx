import { CoursePage } from '@/components/course-page';
export default async function Page({
  params,
}: {
  params: Promise<{ language: string; level: string }>;
}) {
  const { language, level } = await params;
  return <CoursePage language={language} level={level} />;
}
