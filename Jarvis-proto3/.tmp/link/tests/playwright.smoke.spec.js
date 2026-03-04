const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('download smoke', async ({ page }) => {
  const outPath = path.resolve('.tmp/link/playwright_cli_download.txt');
  await page.setContent('<a id="download-link" href="data:text/plain;base64,cGxheXdyaWdodC1saW5rLXNtb2tl" download="playwright_cli_download.txt">download</a>');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-link')
  ]);
  await download.saveAs(outPath);
  expect(fs.existsSync(outPath)).toBeTruthy();
});
