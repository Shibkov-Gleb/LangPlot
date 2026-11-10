import type { StudyTopics } from '@langplot/shared';

export function StudyTopicList({ topics }: { topics?: StudyTopics }) {
  if (!topics) return null;
  return (
    <dl className="study-topics">
      <div>
        <dt>Грамматика</dt>
        <dd>{topics.grammar.join(' · ')}</dd>
      </div>
      <div>
        <dt>Лексика</dt>
        <dd>{topics.vocabulary.join(' · ')}</dd>
      </div>
    </dl>
  );
}
