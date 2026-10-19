import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { AccountFile, DeviceStateFile, VideoDir } from './tests/fixtures';

/**
 * Starts each run with an empty device and a new test account, and waits for
 * the stack to answer.
 */
export default async function globalSetup() {
  fs.rmSync(DeviceStateFile, { force: true });
  fs.mkdirSync(VideoDir, { recursive: true });
  fs.mkdirSync(path.dirname(AccountFile), { recursive: true });
  fs.writeFileSync(
    AccountFile,
    JSON.stringify({
      email: `e2e-${crypto.randomBytes(4).toString('hex')}@example.test`,
      password: crypto.randomBytes(12).toString('hex'),
    })
  );

  const base = process.env.BASE_URL ?? 'http://localhost:18081';
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      // The web app is up and the backend answers through it (401: not signed in).
      const [web, api] = await Promise.all([fetch(base), fetch(`${base}/api/v1/auth/me`)]);
      if (web.ok && api.status === 401) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) throw new Error(`The stack at ${base} didn't come up in time.`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
