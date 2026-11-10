import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pcmWave } from '@langplot/agents';
import { projectRoot } from './voiceover.js';

type Line = { key: string; text: string; speaker: string; voice: string; direction: string };
type Job = { name: string; keys: string[]; processed: boolean };
export async function generateSpeechBatch(
  lines: Line[],
  pending: Line[],
  model: string,
  key: string,
  language: string,
  saveClip: (line: Line, bytes: Uint8Array) => Promise<void>,
  signal: AbortSignal,
) {
  if (!['gemini-3.1-flash-tts-preview', 'gemini-2.5-pro-preview-tts'].includes(model))
    throw Error('TTS_BATCH_MODEL_UNSUPPORTED');
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ model, lines }))
    .digest('hex')
    .slice(0, 24);
  const directory = path.join(projectRoot, '.local/tts');
  mkdirSync(directory, { recursive: true });
  const statePath = path.join(directory, 'batch-' + fingerprint + '.json');
  const state: { jobs: Job[] } = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8'))
    : { jobs: [] };
  const persist = () => {
    writeFileSync(statePath + '.tmp', JSON.stringify(state));
    renameSync(statePath + '.tmp', statePath);
  };
  const request = async (endpoint: string, body?: unknown) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/' + endpoint,
          {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.any([signal, AbortSignal.timeout(body ? 60000 : 300000)]),
          },
        );
        if (!response.ok) throw Error('BATCH_HTTP_' + response.status);
        return await response.json();
      } catch (error) {
        if (signal.aborted || attempt >= 2) throw error;
        await delay(10000 * (attempt + 1), undefined, { signal });
      }
    }
  };
  const covered = new Set(state.jobs.flatMap((j) => j.keys));
  const queue = pending.filter((line) => !covered.has(line.key));
  for (let offset = 0; offset < queue.length; offset += 100) {
    const group = queue.slice(offset, offset + 100);
    const result = await request('models/' + model + ':batchGenerateContent', {
      batch: {
        display_name: 'LangPlot English A2 voices ' + fingerprint + ' ' + offset,
        input_config: {
          requests: {
            requests: group.map((line) => ({
              metadata: { key: line.key },
              request: {
                contents: [
                  {
                    parts: [
                      {
                        text: [
                          'Perform one character line for an English A2 mystery visual novel.',
                          line.direction,
                          'Speak in ' +
                            language +
                            '. Natural measured pace. Read only the exact line below. No introduction, narration, music or sound effects.',
                          'Line:\n' + line.text,
                        ].join('\n'),
                      },
                    ],
                  },
                ],
                generationConfig: {
                  responseModalities: ['AUDIO'],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: line.voice } } },
                },
              },
            })),
          },
        },
      },
    });
    if (!/^batches\/[a-z0-9]+$/.test(result.name)) throw Error('BATCH_INVALID_RESPONSE');
    state.jobs.push({ name: result.name, keys: group.map((line) => line.key), processed: false });
    persist();
    console.log('Submitted batch ' + state.jobs.length + ' (' + group.length + ' lines)');
  }
  const lookup = new Map(lines.map((line) => [line.key, line]));
  while (state.jobs.some((job) => !job.processed)) {
    for (const job of state.jobs.filter((j) => !j.processed)) {
      const result = await request(job.name);
      const status = result.metadata?.state;
      if (['BATCH_STATE_FAILED', 'BATCH_STATE_CANCELLED', 'BATCH_STATE_EXPIRED'].includes(status))
        throw Error('Batch stopped: ' + status);
      if (!result.done) continue;
      const destination = result.response;
      const rows = destination?.inlinedResponses?.inlinedResponses;
      if (!Array.isArray(rows)) throw Error('BATCH_MISSING_INLINE_RESULTS');
      let cursor = 0;
      const encode = async () => {
        while (cursor < rows.length) {
          const row = rows[cursor++];
          const line = lookup.get(row.metadata?.key);
          if (!line) throw Error('BATCH_UNKNOWN_LINE');
          const candidate = row.response?.candidates?.[0];
          const audio = candidate?.content?.parts?.find(
            (p: { inlineData?: unknown }) => p.inlineData,
          )?.inlineData;
          if (row.error || candidate?.finishReason !== 'STOP' || !audio?.data) {
            console.log(
              'Retry individually ' +
                line.key +
                ' (' +
                (row.error?.code ?? candidate?.finishReason ?? 'empty') +
                ')',
            );
            continue;
          }
          const rate = /rate=(\d+)/.exec(audio.mimeType);
          const bytes = Buffer.from(audio.data, 'base64');
          let waveBytes = bytes;
          if (audio.mimeType !== 'audio/wav') {
            if (!rate) throw Error('BATCH_INVALID_AUDIO');
            waveBytes = pcmWave(bytes, Number(rate[1]));
          }
          await saveClip(line, waveBytes);
        }
      };
      await Promise.all(Array.from({ length: 6 }, encode));
      job.processed = true;
      persist();
      console.log('Imported batch ' + job.name);
    }
    console.log(
      'Batches complete ' + state.jobs.filter((j) => j.processed).length + '/' + state.jobs.length,
    );
    if (state.jobs.some((job) => !job.processed)) await delay(30000, undefined, { signal });
  }
}
