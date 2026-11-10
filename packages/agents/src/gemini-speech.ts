import type { SpeechProvider } from './providers.js';

export class SpeechError extends Error {
  constructor(
    public code: string,
    public retryAfterMs = 0,
  ) {
    super(code);
  }
}
function waveAudio(data: string) {
  const bytes = Buffer.from(data, 'base64');
  if (
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE' ||
    bytes.length < 46
  )
    throw new SpeechError('TTS_INVALID_AUDIO');
  return { bytes, contentType: 'audio/wav' as const };
}

export function pcmWave(pcm: Uint8Array, sampleRate: number) {
  if (!pcm.length || pcm.length % 2 || sampleRate < 8000 || sampleRate > 96000)
    throw new SpeechError('TTS_INVALID_AUDIO');
  const bytes = Buffer.alloc(44 + pcm.length);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + pcm.length, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(pcm.length, 40);
  bytes.set(pcm, 44);
  return bytes;
}

export class GeminiSpeechProvider implements SpeechProvider {
  readonly status = 'ready';
  constructor(
    private key: string,
    private model = 'gemini-2.5-flash-preview-tts',
  ) {
    if (!key) throw new SpeechError('TTS_NOT_CONFIGURED');
    if (!/^gemini-[a-z0-9.-]+tts[a-z0-9-]*$/.test(model))
      throw new SpeechError('TTS_INVALID_MODEL');
  }
  async synthesize(
    input: { text: string; language: string; voice: string; direction?: string },
    signal?: AbortSignal,
  ) {
    if (!input.text.trim() || input.text.length > 4000 || !/^[A-Za-z]+$/.test(input.voice))
      throw new SpeechError('TTS_INVALID_INPUT');
    const timeout = AbortSignal.timeout(90000);
    const modern = this.model.startsWith('gemini-3.8-');
    const style = [
      input.direction ?? 'Natural clear conversational delivery.',
      'Speak in ' +
        input.language +
        '. Natural measured pace for an A2 learner. No music or sound effects.',
    ].join(' ');
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/' +
        (modern ? 'interactions' : 'models/' + this.model + ':generateContent'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify(
          modern
            ? {
                model: this.model,
                input: [
                  {
                    type: 'user_input',
                    content: [
                      {
                        type: 'text',
                        text: input.text,
                        annotations: [{ type: 'speech_metadata', style }],
                      },
                    ],
                  },
                ],
                response_format: { type: 'audio' },
                generation_config: { speech_config: [{ voice: input.voice }] },
              }
            : {
                contents: [
                  {
                    parts: [
                      {
                        text: [
                          'Perform one character line for an English A2 mystery visual novel.',
                          input.direction ?? 'Natural clear conversational delivery.',
                          'Speak in ' +
                            input.language +
                            '. Use a measured, natural pace accessible to A2 learners. Keep the wording exactly. No introduction, narration, music or sound effects.',
                          'Read only the following line:\n' + input.text,
                        ].join('\n'),
                      },
                    ],
                  },
                ],
                generationConfig: {
                  responseModalities: ['AUDIO'],
                  speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } },
                  },
                },
              },
        ),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
    const result = await response.json();
    if (!response.ok) {
      const retry = result.error?.details?.find((d: { '@type'?: string }) =>
        d['@type']?.endsWith('RetryInfo'),
      )?.retryDelay;
      const wait = Number.parseFloat(retry ?? response.headers.get('retry-after') ?? '60') * 1000;
      // Keep provider payloads and credentials out of logs and public errors.
      throw new SpeechError(
        response.status === 429
          ? 'TTS_QUOTA'
          : response.status >= 500
            ? 'TTS_UNAVAILABLE'
            : 'TTS_ACCESS_' + response.status,
        Number.isFinite(wait) ? wait : 60000,
      );
    }
    if (modern) {
      const block = result.steps
        ?.flatMap(
          (s: { content?: { type: string; data?: string; mime_type?: string }[] }) =>
            s.content ?? [],
        )
        .find((p: { type: string }) => p.type === 'audio');
      if (result.status !== 'completed' || !block?.data || block.mime_type !== 'audio/wav')
        throw new SpeechError('TTS_INVALID_AUDIO');
      return waveAudio(block.data);
    }
    const candidate = result.candidates?.[0];
    const audio = candidate?.content?.parts?.find(
      (p: { inlineData?: unknown }) => p.inlineData,
    )?.inlineData;
    if (
      candidate?.finishReason === 'STOP' &&
      audio?.mimeType === 'audio/wav' &&
      typeof audio.data === 'string'
    )
      return waveAudio(audio.data);
    const mime = audio?.mimeType ?? '';
    const rate = /(?:^|;)\s*rate=(\d+)(?:;|$)/i.exec(mime);
    const channels = /(?:^|;)\s*channels=(\d+)(?:;|$)/i.exec(mime);
    if (
      candidate?.finishReason !== 'STOP' ||
      !/^audio\/l16\s*;/i.test(mime) ||
      !rate ||
      (channels && channels[1] !== '1') ||
      typeof audio?.data !== 'string'
    )
      throw new SpeechError('TTS_INVALID_AUDIO');
    const bytes = pcmWave(Buffer.from(audio.data, 'base64'), Number(rate[1]));
    return { bytes, contentType: 'audio/wav' as const };
  }
}
