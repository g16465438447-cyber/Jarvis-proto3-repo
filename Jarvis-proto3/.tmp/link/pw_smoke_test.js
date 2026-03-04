const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const targetPath = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setContent('<a id="download-link" href="data:text/plain;base64,cGxheXdyaWdodC1saW5rLXNtb2tl" download="playwright_smoke_download.txt">download</a>');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-link')
  ]);
  await download.saveAs(targetPath);
  await browser.close();
  console.log('saved', targetPath, fs.existsSync(targetPath));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
