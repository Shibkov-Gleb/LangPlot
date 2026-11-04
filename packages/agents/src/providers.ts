export interface SpeechProvider {
  readonly status: 'ready'|'not-configured';
  synthesize(input: { text: string; language: string; voice: string }, signal?: AbortSignal): Promise<{ bytes: Uint8Array; contentType: 'audio/mpeg'|'audio/wav' }>;
}
export class UnconfiguredSpeechProvider implements SpeechProvider {
  readonly status = 'not-configured';
  async synthesize(): Promise<never> { throw new Error('TTS_NOT_CONFIGURED'); }
}
export interface FileStorage {
  readonly status: 'ready'|'not-configured';
  put(path: string, bytes: Uint8Array): Promise<void>;
  read(path: string): Promise<Uint8Array>;
}
