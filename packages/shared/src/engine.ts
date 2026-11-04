import type { ContentPackage } from './content';
import type { GameState } from './contracts';

export const technicalFixture: ContentPackage = {
  schemaVersion: 1,
  manifest: {
    id: 'langplot.technical.en',
    version: '1.0.0',
    title: 'Техническая сцена',
    language: 'en',
    level: 'A1',
    status: 'technical',
    description: 'Только проверка интерфейса и сохранения. Не учебный курс.',
  },
  entrySceneId: 'start',
  characters: [
    {
      id: 'assistant',
      name: 'Тестовый собеседник',
      knownFacts: ['Это техническая сцена.', 'Здесь нет сюжета и учебной оценки.'],
    },
  ],
  resources: [],
  learningObjectives: [],
  scenes: [
    {
      id: 'start',
      text: 'Это пространство будущей истории. Пока здесь можно проверить выбор, сохранение и переписку.',
      terminal: false,
      objectiveIds: [],
      choices: [
        {
          id: 'observe',
          label: 'Осмотреть пространство',
          target: 'review',
          setFlags: { observed: true },
          journalEntry: 'Вы проверили выбор «Осмотреть пространство».',
        },
        {
          id: 'continue',
          label: 'Перейти к следующей сцене',
          target: 'review',
          setFlags: { observed: false },
          journalEntry: 'Вы перешли к следующей технической сцене.',
        },
      ],
    },
    {
      id: 'review',
      text: 'Выбор сохранён. Обновите страницу — вы вернётесь сюда. Телефон и журнал доступны в любое время.',
      terminal: false,
      objectiveIds: [],
      choices: [
        {
          id: 'finish',
          label: 'Завершить проверку',
          target: 'end',
          setFlags: { complete: true },
          journalEntry: 'Проверка переходов завершена.',
        },
      ],
    },
    {
      id: 'end',
      text: 'Техническая проверка завершена. Настоящие истории появятся здесь после подготовки и проверки контента.',
      terminal: true,
      objectiveIds: [],
      choices: [],
    },
  ],
};
export function fixtureFor(language: 'en' | 'de'): ContentPackage {
  return {
    ...technicalFixture,
    manifest: { ...technicalFixture.manifest, id: `langplot.technical.${language}`, language },
  };
}
export function initialState(content: ContentPackage): GameState {
  if (!content.entrySceneId) throw new Error('NO_ENTRY_SCENE');
  return {
    sceneId: content.entrySceneId,
    flags: {},
    visited: [content.entrySceneId],
    journal: [],
    choices: [],
  };
}
export function transition(content: ContentPackage, state: GameState, choiceId: string): GameState {
  const scene = content.scenes.find((x) => x.id === state.sceneId);
  const choice = scene?.choices.find((x) => x.id === choiceId);
  if (
    !choice ||
    (choice.condition && (state.flags[choice.condition.flag] ?? false) !== choice.condition.equals)
  )
    throw new Error('INVALID_CHOICE');
  if (!content.scenes.some((x) => x.id === choice.target)) throw new Error('INVALID_TARGET');
  return {
    sceneId: choice.target,
    flags: { ...state.flags, ...choice.setFlags },
    visited: [...new Set([...state.visited, choice.target])],
    journal: choice.journalEntry ? [...state.journal, choice.journalEntry] : state.journal,
    choices: [...state.choices, choice.id],
  };
}
