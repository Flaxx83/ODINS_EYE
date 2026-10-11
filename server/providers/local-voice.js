import { runPython } from './python-runtime.js';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export function localVoicePlugin() {
  let busy = false;
  const install = (server) => {
    server.middlewares.use('/api/local-voice', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST' || busy) {
        res.statusCode = busy ? 429 : 405;
        res.end(JSON.stringify({ error: 'Röstservern är upptagen' }));
        return;
      }
      busy = true;
      let path;
      try {
        const chunks = [];
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > 12000000) throw Error('Inspelningen är för lång');
          chunks.push(c);
        }
        const dir = new URL('../../work/local-voice/', import.meta.url);
        await mkdir(dir, { recursive: true });
        path = fileURLToPath(new URL(randomUUID() + '.webm', dir));
        await writeFile(path, Buffer.concat(chunks));
        const { stdout } = await runPython(
          [
            fileURLToPath(
              new URL('./local-voice/transcribe.py', import.meta.url),
            ),
            path,
          ],
          { timeout: 120000, windowsHide: true },
        );
        res.end(stdout);
      } catch (e) {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            error: e.message || 'Lokal taligenkänning misslyckades',
          }),
        );
      } finally {
        if (path) await unlink(path).catch(() => {});
        busy = false;
      }
    });
  };
  return {
    name: 'local-whisper',
    configureServer: install,
    configurePreviewServer: install,
  };
}
