import path from 'node:path';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const dataDirectory = path.join(process.cwd(), 'data');
const seedPath = path.join(dataDirectory, 'seed.json');
const runtimePath = path.join(dataDirectory, 'runtime-store.json');

export async function ensureRuntimeStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await access(runtimePath);
  } catch {
    await copyFile(seedPath, runtimePath);
  }
}

export async function readStore() {
  await ensureRuntimeStore();
  const raw = await readFile(runtimePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeStore(store) {
  await writeFile(runtimePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}
