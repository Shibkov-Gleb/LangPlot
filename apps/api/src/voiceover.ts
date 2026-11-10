import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const voiceDirectory = path.join(projectRoot, 'apps/web/public/assets/voices/en-a2');
export const voiceManifestPath = path.join(voiceDirectory, 'manifest.json');
export const VoiceClip = z.object({
  text: z.string().min(1),
  speaker: z.string().regex(/^[a-z]+$/),
  voice: z.string(),
  direction: z.string(),
  model: z.string(),
  path: z.string().regex(/^assets\/voices\/en-a2\/[a-f0-9]{24}\.mp3$/),
  bytes: z.number().int().positive(),
  duration: z.number().positive(),
});
export const VoiceManifest = z.object({
  schemaVersion: z.literal(1),
  clips: z.record(z.string(), VoiceClip),
});
export type VoiceManifest = z.infer<typeof VoiceManifest>;
export const voiceKey = (speaker: string, text: string) =>
  createHash('sha256')
    .update(speaker + '\0' + text)
    .digest('hex')
    .slice(0, 24);
let loaded: VoiceManifest | undefined;
let loadedAt = 0;
export function sceneSpeech(
  language: string,
  level: string,
  scene?: { layout?: string; speakerId?: string; text: string },
) {
  if (language !== 'en' || level !== 'A2' || scene?.layout !== 'line' || !scene.speakerId)
    return undefined;
  if (!existsSync(voiceManifestPath)) return undefined;
  const changedAt = statSync(voiceManifestPath).mtimeMs;
  if (!loaded || changedAt !== loadedAt) {
    loaded = VoiceManifest.parse(JSON.parse(readFileSync(voiceManifestPath, 'utf8')));
    loadedAt = changedAt;
  }
  const clip = loaded.clips[voiceKey(scene.speakerId, scene.text)];
  return clip && clip.text === scene.text && clip.speaker === scene.speakerId
    ? '/' + clip.path
    : undefined;
}
