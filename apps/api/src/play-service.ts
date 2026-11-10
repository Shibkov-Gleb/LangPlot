import { ContentPackage, GameState, lessonView } from '@langplot/shared';
import { db } from './db.js';
import { ApiError } from './errors.js';
import { sceneSpeech } from './voiceover.js';
export async function ownedPlay(id: string, userId: string) {
  const play = await db.playthrough.findFirst({
    where: { id, userId },
    include: { contentVersion: true },
  });
  if (!play) throw new ApiError(404, 'PLAY_NOT_FOUND', 'Прохождение не найдено.');
  return play;
}
export function playDto(play: Awaited<ReturnType<typeof ownedPlay>>) {
  const c = ContentPackage.parse(play.contentVersion.data),
    state = GameState.parse(play.state);
  return {
    id: play.id,
    language: play.language,
    revision: play.revision,
    runNumber: play.runNumber,
    contentVersion: `${play.contentVersion.packageId}@${play.contentVersion.version}`,
    state,
    ...(c.schemaVersion !== 1
      ? {
          view: {
            ...lessonView(c, state),
            speech: sceneSpeech(
              c.manifest.language,
              c.manifest.level,
              c.scenes.find((scene) => scene.id === state.sceneId),
            ),
          },
        }
      : {}),
  };
}
