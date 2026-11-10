import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiSpeechProvider, pcmWave } from './gemini-speech';

afterEach(() => vi.unstubAllGlobals());
describe('Gemini speech', () => {
  it('accepts PCM parameters with spaces and an explicit mono channel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'audio/l16; rate=24000; channels=1',
                        data: 'AAAAAA==',
                      },
                    },
                  ],
                },
              },
            ],
          }),
        ),
      ),
    );
    const result = await new GeminiSpeechProvider(
      'local-test-secret',
      'gemini-3.1-flash-tts-preview',
    ).synthesize({ text: 'Here.', voice: 'Achernar', language: 'English' });
    expect(result.bytes.length).toBe(48);
  });
  it('accepts the WAV envelope returned by Gemini 3.1 single requests', async () => {
    const wav = pcmWave(Uint8Array.from([0, 0, 1, 0]), 24000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [{ inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }],
                },
              },
            ],
          }),
        ),
      ),
    );
    const result = await new GeminiSpeechProvider(
      'local-test-secret',
      'gemini-3.1-flash-tts-preview',
    ).synthesize({ text: 'Here.', voice: 'Achernar', language: 'English' });
    expect(Buffer.from(result.bytes)).toEqual(wav);
  });
  it('keeps modern TTS acting directions outside the spoken transcript', async () => {
    const wav = pcmWave(Uint8Array.from([0, 0, 1, 0]), 24000);
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'audio', mime_type: 'audio/wav', data: wav.toString('base64') }],
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await new GeminiSpeechProvider(
      'local-test-secret',
      'gemini-3.8-flash-lite-tts',
    ).synthesize({
      text: 'Here.',
      voice: 'Achernar',
      language: 'English',
      direction: 'Distant and quiet',
    });
    const [url, init] = fetch.mock.calls[0]!;
    const input = JSON.parse(init.body);
    expect(url).toMatch(/\/interactions$/);
    expect(input.input[0].content[0].text).toBe('Here.');
    expect(input.input[0].content[0].annotations[0].style).toContain('Distant and quiet');
    expect(Buffer.from(result.bytes)).toEqual(wav);
  });
  it('wraps 24 kHz mono PCM in a browser-playable WAV header', () => {
    const wav = pcmWave(Uint8Array.from([0, 0, 255, 127]), 24000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(4);
    expect(wav.subarray(44)).toEqual(Buffer.from([0, 0, 255, 127]));
    expect(() => pcmWave(Uint8Array.from([1]), 24000)).toThrow('TTS_INVALID_AUDIO');
  });
  it('sends the key in a server header and preserves the selected voice', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: 'AAAAAA==' } },
                ],
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await new GeminiSpeechProvider('local-test-secret').synthesize({
      text: 'Here.',
      voice: 'Achernar',
      language: 'English',
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).not.toContain('local-test-secret');
    expect(init.headers['x-goog-api-key']).toBe('local-test-secret');
    expect(
      JSON.parse(init.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    ).toBe('Achernar');
    expect(result.contentType).toBe('audio/wav');
    expect(result.bytes.length).toBe(48);
  });
  it('returns a safe retry delay for quota errors and rejects truncated generation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'private provider payload',
              details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '32s' }],
            },
          }),
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] })),
      );
    vi.stubGlobal('fetch', fetch);
    const provider = new GeminiSpeechProvider('local-test-secret');
    const line = { text: 'Here.', language: 'English', voice: 'Achernar' };
    await expect(provider.synthesize(line)).rejects.toMatchObject({
      code: 'TTS_QUOTA',
      retryAfterMs: 32000,
      message: 'TTS_QUOTA',
    });
    await expect(provider.synthesize(line)).rejects.toThrow('TTS_INVALID_AUDIO');
  });
});
