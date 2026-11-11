import { transition } from './engine';
import type { PlayablePackage } from './content';
import type { GameState } from './contracts';
import type { LessonView } from './lesson-view';

export const reviewDays = [1, 3, 7, 14, 30];
export const decisionFlag = (content: PlayablePackage) =>
  content.schemaVersion === 2 ? content.lesson.ticketFlag : content.lesson.decisionFlag;
export function lessonContact(content: PlayablePackage, state: GameState) {
  if (content.schemaVersion === 2) return undefined;
  const variant =
    content.schemaVersion === 4
      ? content.lesson.phoneVariants.find(
          (v) => (state.flags[v.when.flag] ?? false) === v.when.equals,
        )
      : undefined;
  return variant
    ? {
        id: variant.contact,
        name: content.characters.find((c) => c.id === variant.contact)!.name,
        role: variant.role,
        context: variant.context,
        openings: variant.openings,
        reply: variant.reply,
      }
    : {
        id: content.lesson.contact,
        name: content.characters.find((c) => c.id === content.lesson.contact)!.name,
        role: content.lesson.contactRole,
        context: content.lesson.phoneContext,
        openings: content.lesson.openings,
        reply: content.lesson.reply,
      };
}
export function lessonScene(
  content: PlayablePackage,
  sceneId: string,
): PlayablePackage['scenes'][number] | undefined {
  const scene = content.scenes.find((s) => s.id === sceneId);
  if (scene || content.schemaVersion !== 4) return scene;
  const template = content.lesson.reviewTemplates.find((t) => 'review.' + t.skill === sceneId);
  if (!template) return undefined;
  return {
    id: sceneId,
    text: template.prompt,
    caption: template.caption,
    phase: 'practice' as const,
    layout: 'task' as const,
    resourceId: content.scenes[0]!.resourceId,
    speakerId: 'lev',
    terminal: false,
    objectiveIds: [],
    marks: [],
    exercise: {
      skill: template.skill,
      correct: 'option-1',
      feedback: template.feedback,
      review: true,
    },
    choices: [template.answer, ...template.wrong].map((label, i) => ({
      id: 'option-' + (i + 1),
      label,
      target: i === 0 ? content.lesson.gate : sceneId,
      setFlags: {},
    })),
  };
}
export function reviewSkills(content: PlayablePackage) {
  return content.schemaVersion === 4
    ? content.lesson.reviewTemplates.map((t) => t.skill)
    : content.scenes.flatMap((s) => (s.exercise?.review ? [s.exercise.skill] : []));
}
function resolveBranches(content: PlayablePackage, state: GameState) {
  let next = state;
  const visited = new Set<string>();
  while (content.scenes.find((s) => s.id === next.sceneId)?.layout === 'branch') {
    if (visited.has(next.sceneId)) throw new Error('BRANCH_LOOP');
    visited.add(next.sceneId);
    const scene = content.scenes.find((s) => s.id === next.sceneId)!;
    const choices = scene.choices.filter(
      (c) => !c.condition || (next.flags[c.condition.flag] ?? false) === c.condition.equals,
    );
    if (choices.length !== 1) throw new Error('AMBIGUOUS_BRANCH');
    next = transition(content, next, choices[0]!.id);
  }
  return next;
}
export function lessonTransition(
  content: PlayablePackage,
  state: GameState,
  choiceId: string,
  dueSkills: string[],
  hasExchange: boolean,
) {
  const scene = lessonScene(content, state.sceneId);
  if (
    !scene ||
    scene.layout === 'gate' ||
    scene.layout === 'branch' ||
    (scene.layout === 'phone' && !hasExchange)
  )
    throw new Error('INVALID_CHOICE');
  const playable = content.scenes.includes(scene)
    ? content
    : { ...content, scenes: [...content.scenes, scene] };
  const next = resolveBranches(content, transition(playable, state, choiceId));
  if (scene.exercise && choiceId !== scene.exercise.correct) {
    return { ...state, feedback: scene.exercise.feedback };
  }
  if (next.sceneId === content.lesson.gate) {
    const queue =
      state.reviewQueue ??
      dueSkills
        .flatMap((skill) => {
          if (content.schemaVersion === 4)
            return content.lesson.reviewTemplates.some((t) => t.skill === skill)
              ? ['review.' + skill]
              : [];
          const review = content.scenes.find(
            (s) => s.exercise?.review && s.exercise.skill === skill,
          );
          return review ? [review.id] : [];
        })
        .slice(0, 2);
    const [first, ...rest] = queue;
    const destination =
      first ??
      (state.flags['review.only']
        ? content.scenes.find((s) => s.terminal)!.id
        : content.lesson.phone);
    return {
      ...next,
      sceneId: destination,
      visited: [...new Set([...next.visited, destination])],
      reviewQueue: rest,
    };
  }
  return state.reviewQueue ? { ...next, reviewQueue: state.reviewQueue } : next;
}
export function phoneOpening(content: PlayablePackage, state: GameState) {
  if (!state.visited.includes(content.lesson.phone)) return undefined;
  const chosen = state.flags[decisionFlag(content)];
  if (content.schemaVersion !== 2) return lessonContact(content, state)!.openings[chosen ? 0 : 1];
  return chosen ? content.lesson.keptOpening : content.lesson.givenOpening;
}
export function lessonView(content: PlayablePackage, state: GameState): LessonView {
  const scene = lessonScene(content, state.sceneId);
  if (!scene) throw new Error('SCENE_NOT_FOUND');
  const resource = (id: string | undefined) => content.resources.find((r) => r.id === id)?.path;
  const setting =
    content.schemaVersion === 4
      ? content.lesson.settingVariants.find(
          (v) => (state.flags[v.when.flag] ?? false) === v.when.equals,
        )
      : undefined;
  const peers = content.scenes.filter(
    (s) => s.phase === scene.phase && s.layout === scene.layout && !s.exercise?.review,
  );
  return {
    title: content.manifest.title,
    postReview: state.flags['review.only'] ?? false,
    phase: scene.phase,
    layout: scene.layout,
    text:
      state.flags['review.only'] && scene.terminal
        ? 'Сверка журнала завершена. Записи расследования сохранены.'
        : scene.layout === 'arrival' && setting
          ? setting.arrivalText
          : scene.text,
    speaker: content.characters.find((c) => c.id === scene.speakerId)?.name,
    backdrop: '/' + resource(setting?.resourceId ?? scene.resourceId),
    ambience: content.lesson.ambienceId ? '/' + resource(content.lesson.ambienceId) : undefined,
    cue: scene.cueId ? '/' + resource(scene.cueId) : undefined,
    dimLights: scene.dimLights,
    portrait: scene.portraitId ? '/' + resource(scene.portraitId) : undefined,
    notes: content.lesson.notes.filter((n) => scene.marks.some((m) => m.note === n.key)),
    marks: scene.marks,
    choices: scene.choices
      .filter(
        (c) => !c.condition || (state.flags[c.condition.flag] ?? false) === c.condition.equals,
      )
      .map((c) => ({ id: c.id, label: c.label })),
    step: Math.max(1, peers.findIndex((s) => s.id === scene.id) + 1),
    steps: peers.length,
    taskNumber: scene.exercise?.number,
    taskTotal: scene.exercise?.total,
    artifact: scene.artifact,
    phoneAvailable: phoneOpening(content, state) !== undefined,
    caption: scene.caption,
    ...(content.schemaVersion !== 2
      ? {
          presentation: {
            ...content.lesson.presentation,
            ...(setting ? { location: setting.location } : {}),
          },
          contact: lessonContact(content, state),
        }
      : {}),
  };
}
