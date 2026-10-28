import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'leader-ts-'));
try {
  for (const [index, source] of process.argv.slice(2).entries()) {
    const target = path.join(directory, `${index}.mjs`);
    fs.writeFileSync(target, stripTypeScriptTypes(fs.readFileSync(source, 'utf8'), { mode: 'transform' }));
    const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8', timeout: 15000 });
    if (result.status !== 0) throw new Error(`${source}: ${result.stderr || result.error}`);
  }
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
