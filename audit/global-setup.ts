import { mkdirSync, rmSync } from 'node:fs';
import { OUT, PARTS_DIR } from './common';

// Only resets the per-test result folder; sign-in happens in each test (refresh tokens are single-use).
export default async function globalSetup() {
  rmSync(PARTS_DIR, { recursive: true, force: true });
  mkdirSync(PARTS_DIR, { recursive: true });
  mkdirSync(OUT, { recursive: true });
}
