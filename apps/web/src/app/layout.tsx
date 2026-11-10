import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import './globals.css';
import './workspace.css';
import './course.css';
import './player.css';
import './last-row.css';
import './studio.css';

export const metadata: Metadata = {
  title: { default: 'LangPlot — у каждого языка своя история', template: '%s · LangPlot' },
  description:
    'Изучайте язык внутри истории: слушайте, выбирайте и общайтесь. Знакомство с концепцией LangPlot и локальная демоверсия.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          К содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
