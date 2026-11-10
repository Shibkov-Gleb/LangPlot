import { Suspense } from 'react';
import { Workspace } from '@/components/workspace';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Workspace>
      <Suspense fallback={<p>Загрузка…</p>}>{children}</Suspense>
    </Workspace>
  );
}
