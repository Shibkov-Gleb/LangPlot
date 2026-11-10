import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
} from 'node:fs';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { PlayablePackage } from '@langplot/shared';
import { GeminiSpeechProvider, SpeechError } from '@langplot/agents';
import { generateSpeechBatch } from './tts-batch.js';
import { replaceAudioFile } from './tts-files.js';
import {
  projectRoot,
  voiceDirectory,
  voiceKey,
  voiceManifestPath,
  VoiceManifest,
} from './voiceover.js';

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith('--' + name + '='))?.split('=')[1];
const selected = option('lesson');
const dryRun = args.includes('--dry-run');
const concurrency = z.coerce
  .number()
  .int()
  .min(1)
  .max(8)
  .parse(option('concurrency') ?? 3);
const limit = z.coerce.number().int().positive().optional().parse(option('limit'));
const profiles = z
  .object({
    model: z.string(),
    language: z.string(),
    voices: z.record(z.string(), z.object({ voice: z.string(), direction: z.string() })),
  })
  .parse(
    JSON.parse(readFileSync(path.join(projectRoot, 'content/courses/en-a2-voices.json'), 'utf8')),
  );
const model = process.env.GEMINI_TTS_MODEL || profiles.model;
const catalog = JSON.parse(
  readFileSync(path.join(projectRoot, 'content/courses/catalog.json'), 'utf8'),
);
const slugs: string[] = catalog
  .filter((c: { language: string; level: string }) => c.language === 'en' && c.level === 'A2')
  .flatMap((c: { sections: { lessons: { slug: string; routes?: { slug: string }[] }[] }[] }) =>
    c.sections.flatMap((s) => s.lessons.flatMap((l) => (l.routes ?? [l]).map((r) => r.slug))),
  );
if (selected && !slugs.includes(selected)) throw Error('Unknown lesson slug');
const lines = [
  ...new Map(
    slugs
      .filter((slug) => !selected || slug === selected)
      .flatMap((slug) => {
        const content = PlayablePackage.parse(
          JSON.parse(
            readFileSync(path.join(projectRoot, 'content/lessons', slug + '.json'), 'utf8'),
          ),
        );
        return content.scenes
          .filter((s) => s.layout === 'line' && s.speakerId)
          .map((s) => {
            const profile = profiles.voices[s.speakerId!];
            if (!profile) throw Error('Missing voice for ' + s.speakerId);
            return [
              voiceKey(s.speakerId!, s.text),
              {
                key: voiceKey(s.speakerId!, s.text),
                text: s.text,
                speaker: s.speakerId!,
                ...profile,
              },
            ] as const;
          });
      }),
  ).values(),
];
mkdirSync(voiceDirectory, { recursive: true });
const manifest = existsSync(voiceManifestPath)
  ? VoiceManifest.parse(JSON.parse(readFileSync(voiceManifestPath, 'utf8')))
  : ({ schemaVersion: 1 as const, clips: {} } as VoiceManifest);
function ready(line: (typeof lines)[number]) {
  const clip = manifest.clips[line.key];
  return (
    clip &&
    clip.text === line.text &&
    clip.model === model &&
    clip.voice === line.voice &&
    clip.direction === line.direction &&
    existsSync(path.join(projectRoot, 'apps/web/public', clip.path))
  );
}
const missing = lines.filter((line) => !ready(line));
console.log(
  JSON.stringify({
    lines: lines.length,
    ready: lines.length - missing.length,
    pending: missing.length,
    characters: missing.reduce((sum, l) => sum + l.text.length, 0),
    model,
  }),
);
if (dryRun || !missing.length) process.exit(0);
const key = process.env.GEMINI_API_KEY || process.env.GEMINI_API || process.env.GOOGLE_API_KEY;
if (!key) throw Error('Set GEMINI_API_KEY or GEMINI_API in .env');
const ffmpeg =
  process.env.FFMPEG_PATH ||
  path.join(projectRoot, '.local/audio-tools/node_modules/ffmpeg-static/ffmpeg.exe');
if (!existsSync(ffmpeg))
  throw Error('Install ffmpeg-static in .local/audio-tools or set FFMPEG_PATH');
const lockPath = path.join(voiceDirectory, '.generation-lock');
const lock = openSync(lockPath, 'wx');
const provider = new GeminiSpeechProvider(key, model);
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
const queue = missing.slice(0, limit ?? missing.length);
let cursor = 0,
  completed = 0,
  failure: string | undefined;
let saving = Promise.resolve();
function saveManifest() {
  saving = saving.then(async () => {
    writeFileSync(voiceManifestPath + '.tmp', JSON.stringify(manifest, null, 2) + '\n');
    await replaceAudioFile(voiceManifestPath + '.tmp', voiceManifestPath);
  });
  return saving;
}
const execFile = promisify(execFileCallback);
async function saveClip(line: (typeof lines)[number], waveBytes: Uint8Array) {
  if (ready(line)) return;
  const wav = path.join(voiceDirectory, line.key + '.wav.tmp');
  writeFileSync(wav, waveBytes);
  const filename =
    createHash('sha256')
      .update(line.key + model + line.voice + line.direction)
      .digest('hex')
      .slice(0, 24) + '.mp3';
  const destination = path.join(voiceDirectory, filename);
  try {
    await execFile(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        wav,
        '-af',
        'loudnorm=I=-18:TP=-2:LRA=7',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '64k',
        '-f',
        'mp3',
        destination + '.tmp',
      ],
      { windowsHide: true },
    );
    const bytes = readFileSync(destination + '.tmp').length;
    if (bytes < 400) throw Error('Empty encoded audio');
    await replaceAudioFile(destination + '.tmp', destination);
    const pcmBytes = new DataView(waveBytes.buffer, waveBytes.byteOffset).getUint32(40, true);
    const sampleRate = new DataView(waveBytes.buffer, waveBytes.byteOffset).getUint32(24, true);
    manifest.clips[line.key] = {
      ...line,
      model,
      path: 'assets/voices/en-a2/' + filename,
      bytes,
      duration: pcmBytes / (2 * sampleRate),
    };
    await saveManifest();
    console.log(
      'Generated ' + ++completed + '/' + queue.length + ' ' + line.speaker + ' ' + line.key,
    );
  } finally {
    unlinkSync(wav);
  }
}
async function worker() {
  while (!failure && !controller.signal.aborted && cursor < queue.length) {
    const line = queue[cursor++]!;
    if (ready(line)) continue;
    try {
      let audio: Awaited<ReturnType<typeof provider.synthesize>> | undefined;
      for (let attempt = 0; !audio; attempt++) {
        try {
          audio = await provider.synthesize(
            { ...line, language: profiles.language },
            controller.signal,
          );
        } catch (e) {
          const networkFailure =
            e instanceof TypeError || (e instanceof Error && e.name === 'TimeoutError');
          if (
            (!networkFailure &&
              (!(e instanceof SpeechError) ||
                !['TTS_QUOTA', 'TTS_UNAVAILABLE', 'TTS_INVALID_AUDIO'].includes(e.code))) ||
            attempt >= 2
          )
            throw e;
          const wait =
            e instanceof SpeechError && e.code === 'TTS_QUOTA'
              ? Math.max(10000, e.retryAfterMs)
              : 2000 * (attempt + 1);
          console.log(
            'Retry ' +
              (e instanceof SpeechError ? e.code : 'TTS_NETWORK') +
              ' in ' +
              Math.ceil(wait / 1000) +
              's',
          );
          await delay(wait, undefined, { signal: controller.signal });
        }
      }
      await saveClip(line, audio.bytes);
    } catch (e) {
      failure =
        e instanceof SpeechError
          ? e.code
          : controller.signal.aborted
            ? 'CANCELLED'
            : 'TTS_GENERATION_FAILED';
      console.error(
        'Stopped: ' +
          failure +
          '. ' +
          (e instanceof Error ? e.message.replaceAll(key!, '[redacted]') : '') +
          '. Completed files are saved. Re-run the same command to resume.',
      );
    }
  }
}
try {
  if (args.includes('--batch')) {
    await generateSpeechBatch(
      lines,
      queue,
      model,
      key,
      profiles.language,
      saveClip,
      controller.signal,
    );
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
} finally {
  closeSync(lock);
  unlinkSync(lockPath);
}
console.log(
  JSON.stringify({
    generated: completed,
    remaining: lines.filter((l) => !ready(l)).length,
    failure,
  }),
);
if (failure || controller.signal.aborted) process.exitCode = 1;
