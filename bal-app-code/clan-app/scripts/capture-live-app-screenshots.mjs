import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('📸 التقاط صور حية حقيقية للتطبيق وهو يعمل على 0.0.0.0:3000...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // 1. Capture Home / Focus Screen (Velvet 60-30-10 Palette)
  await page.evaluate(() => {
    switchScreen('home');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-live-1-focus-home.png' });
  console.log('✅ تم التقاط شاشة التركيز والهوم الرئيسية: clan-live-1-focus-home.png');

  // 2. Capture Task Alarm & Timeline Screen
  await page.evaluate(async () => {
    switchScreen('tasks');
    await fetchRealTasks();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-live-2-task-timeline.png' });
  console.log('✅ تم التقاط شاشة منبه المهام والخط الزمني: clan-live-2-task-timeline.png');

  // 3. Capture AI Co-Pilot Dedicated Chat Screen
  await page.evaluate(async () => {
    switchScreen('ai-chat');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-live-3-ai-chat.png' });
  console.log('✅ تم التقاط شاشة المرافق الذكي (Gemini AI): clan-live-3-ai-chat.png');

  // 4. Capture Interactive Domino Game
  await page.evaluate(() => {
    switchScreen('home');
    openDominoGameModal();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-live-4-domino-game.png' });
  console.log('✅ تم التقاط طاولة دومينو التحدي الرباعية: clan-live-4-domino-game.png');

  await browser.close();
  console.log('🎉 تم التقاط جميع الصور الحية بنجاح!');
}

main().catch(err => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
