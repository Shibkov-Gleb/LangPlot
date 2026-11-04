'use client';
import { useEffect } from 'react';
export function RevealController() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: 0.08 });
    document.querySelectorAll('[data-reveal]').forEach(el => { el.classList.add('will-reveal'); observer.observe(el); });
    return () => { observer.disconnect(); document.querySelectorAll('.will-reveal').forEach(el => el.classList.remove('will-reveal')); };
  }, []);
  return null;
}
