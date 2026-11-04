'use client';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="standalone-state">
      <h1>Не удалось открыть страницу.</h1>
      <p>Попробуйте загрузить её ещё раз.</p>
      <button className="button primary" onClick={reset}>
        Повторить
      </button>
    </main>
  );
}
