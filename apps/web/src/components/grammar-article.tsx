import type { GrammarGuide, LessonNote } from '@langplot/shared';

export function GrammarArticle({ note, guide }: { note: LessonNote; guide?: GrammarGuide }) {
  const heading = 'grammar-' + note.key;
  return (
    <article className="theory-entry grammar-article" aria-labelledby={heading}>
      <h3 id={heading}>{guide?.title ?? note.title}</h3>
      <p className="grammar-overview">{guide?.overview ?? note.meaning}</p>
      {note.example && (
        <div className="grammar-lesson-example">
          <span>Пример из урока</span>
          <p lang="en">{note.example}</p>
        </div>
      )}
      {guide?.sections.map((section, index) => (
        <section className="grammar-block" key={index} aria-labelledby={heading + '-' + index}>
          <h4 id={heading + '-' + index}>{section.title}</h4>
          {section.paragraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {section.table && (
            <div
              className="grammar-table-scroll"
              role="region"
              aria-label={section.title + ' — таблица'}
              tabIndex={0}
            >
              <table>
                <caption>{section.title}</caption>
                <thead>
                  <tr>
                    {section.table.headers.map((header, i) => (
                      <th scope="col" key={i}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) =>
                        j === 0 ? (
                          <th scope="row" key={j}>
                            {cell}
                          </th>
                        ) : (
                          <td key={j}>{cell}</td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {section.examples.length > 0 && (
            <ul className="grammar-examples">
              {section.examples.map((example, i) => (
                <li key={i}>
                  <p lang="en">{example.en}</p>
                  <p className="grammar-translation">{example.ru}</p>
                  {example.explanation && (
                    <p className="grammar-explanation">{example.explanation}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {!!guide?.mistakes.length && (
        <section className="grammar-block">
          <h4>Частые ошибки</h4>
          <ul className="grammar-mistakes">
            {guide.mistakes.map((mistake, i) => (
              <li key={i}>
                <p>
                  <span className="grammar-label">Ошибка</span> <s lang="en">{mistake.wrong}</s>
                </p>
                <p>
                  <span className="grammar-label">Верно</span>{' '}
                  <strong lang="en">{mistake.right}</strong>
                </p>
                <p className="grammar-explanation">{mistake.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!guide?.recap.length && (
        <section className="grammar-block grammar-recap">
          <h4>Как проверить себя</h4>
          <ol>
            {guide.recap.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
