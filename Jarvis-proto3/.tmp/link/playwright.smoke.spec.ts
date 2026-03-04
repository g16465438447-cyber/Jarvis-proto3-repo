import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('download smoke', async ({ page }) => {
  const outPath = path.resolve('.tmp/link/pw_cli_smoke_download.txt');
  await page.setContent('<a id="download-link" href="data:text/plain;base64,cGxheXdyaWdodC1saW5rLXNtb2tl" download="pw_cli_smoke_download.txt">download</a>');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-link')
  ]);
  await download.saveAs(outPath);
  expect(fs.existsSync(outPath)).toBeTruthy();
});
