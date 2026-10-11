import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const exec = promisify(execFile);
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

// Resolve per invocation so an explicit invalid override never falls back silently.
export async function pythonCommand(
  env = process.env,
  platform = process.platform,
  root = projectRoot,
) {
  if (env.GEV_PYTHON?.trim())
    return { file: env.GEV_PYTHON.trim(), prefix: [] };
  const venv = pathToFileURL(
    join(
      root,
      platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
    ),
  );
  try {
    await access(venv);
    return { file: fileURLToPath(venv), prefix: [] };
  } catch {}
  return platform === 'win32'
    ? { file: 'py', prefix: ['-3'] }
    : { file: 'python3', prefix: [] };
}

export async function runPython(args, options = {}) {
  const { file, prefix } = await pythonCommand();
  try {
    return await exec(file, [...prefix, ...args], {
      cwd: projectRoot,
      windowsHide: true,
      ...options,
    });
  } catch (cause) {
    const detail =
      cause.code === 'ENOENT'
        ? 'Python saknas. Installera Python eller ange GEV_PYTHON till en Python-exekverbar fil.'
        : /ModuleNotFoundError|ImportError/.test(cause.stderr || '')
          ? 'Pythonberoenden saknas. Installera requirements-geo.txt och vid behov requirements-voice.txt i vald Pythonmiljö.'
          : 'Pythonjobbet misslyckades. Kontrollera beroenden och importer enligt docs/ODINS_SETUP.md.';
    throw new Error(detail, { cause });
  }
}
