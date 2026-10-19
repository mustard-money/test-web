import fs from 'node:fs';
import path from 'node:path';

import { test as base, expect, type Browser, type Page, type TestInfo } from '@playwright/test';

const Root = path.resolve(import.meta.dirname, '..');
/** Where the device's saved data (local storage) is kept between tests. */
export const DeviceStateFile = path.join(Root, '.generated', 'device-state.json');
/** The account the journey signs up with; generated once per run. */
export const AccountFile = path.join(Root, '.generated', 'account.json');
/** One video per test, named after the test. */
export const VideoDir = path.join(Root, 'videos');

const VideoSize = { width: 1280, height: 800 };

export function account(): { email: string; password: string } {
  return JSON.parse(fs.readFileSync(AccountFile, 'utf8'));
}

/** The test's name as a file name: only characters files can't hold are replaced. */
export function videoName(title: string) {
  return title.replace(/[/\\:*?"<>|]/g, '-').trim();
}

/**
 * Opens a browser context that records video, optionally starting from the
 * saved device state. At the end, the video is saved as `<test name>.webm`
 * (with `suffix` when a test uses more than one device).
 */
async function device(
  browser: Browser,
  testInfo: TestInfo,
  use: (page: Page) => Promise<void>,
  { continueState, suffix = '' }: { continueState: boolean; suffix?: string }
) {
  const videoTmp = path.join(testInfo.outputDir, `video${suffix}`);
  const context = await browser.newContext({
    storageState: continueState && fs.existsSync(DeviceStateFile) ? DeviceStateFile : undefined,
    recordVideo: { dir: videoTmp, size: VideoSize },
    viewport: VideoSize,
  });
  const page = await context.newPage();
  // Delete buttons ask with the browser's confirm dialog; the user says yes.
  page.on('dialog', (dialog) => dialog.accept());
  try {
    await use(page);
  } finally {
    if (continueState) await context.storageState({ path: DeviceStateFile });
    const video = page.video();
    await context.close();
    if (video) {
      await video.saveAs(path.join(VideoDir, `${videoName(testInfo.title)}${suffix}.webm`));
      await video.delete();
    }
  }
}

export const test = base.extend<{ app: Page; newDevice: Page }>({
  /** The user's device, continuing with the data earlier tests left on it. */
  app: async ({ browser }, use, testInfo) => {
    await device(browser, testInfo, use, { continueState: true });
  },
  /** Another device, starting empty (e.g. to check what syncs). */
  newDevice: async ({ browser }, use, testInfo) => {
    await device(browser, testInfo, use, { continueState: false, suffix: ' (second device)' });
  },
});

export { expect };
