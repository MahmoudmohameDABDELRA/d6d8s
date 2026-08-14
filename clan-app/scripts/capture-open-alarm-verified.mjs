import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // Switch to tasks screen, switch to alarm subtab, and click trigger button
  await page.evaluate(() => {
    switchScreen('tasks');
    switchTaskAlarmSubTab('alarm');
    triggerTurkeyAlarmModal();
  });
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: '/home/user/clan-live-alarm-modal-verified.png' });
  console.log('✅ تم التقاط نافذة المنبه وهي مفتوحة بالكامل: clan-live-alarm-modal-verified.png');

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
