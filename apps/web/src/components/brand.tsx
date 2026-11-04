import Link from 'next/link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className={`brand ${compact ? 'compact' : ''}`} aria-label="LangPlot — на главную"><span className="brand-mark" aria-hidden="true"><i/><i/></span><span>lang<span className="brand-light">plot</span><span className="brand-dot">.</span></span></Link>;
}
