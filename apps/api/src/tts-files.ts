import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Windows readers and antivirus can briefly hold an open handle on a completed file.
export async function replaceAudioFile(source: string, destination: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') || attempt >= 20) throw error;
      await delay(25 * (attempt + 1));
    }
  }
}
