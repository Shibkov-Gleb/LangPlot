'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({ title, children, onClose, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog-inner"><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></header>{children}</div></dialog>;
}
