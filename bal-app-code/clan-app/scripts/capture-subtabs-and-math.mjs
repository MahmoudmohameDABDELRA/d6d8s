import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('📸 التقاط صور التبديل العلوي والمنبه الحسابي الصارم...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Tasks Subtab
  await page.evaluate(() => {
    switchScreen('tasks');
    switchTaskAlarmSubTab('tasks');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-live-tasks-subtab.png' });
  console.log('✅ تم التقاط تبويب المهام والجدول: clan-live-tasks-subtab.png');

  // 2. Alarm Subtab
  await page.evaluate(() => {
    switchTaskAlarmSubTab('alarm');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-live-alarm-subtab.png' });
  console.log('✅ تم التقاط تبويب منبه المعركة: clan-live-alarm-subtab.png');

  // 3. Turkey Alarm Modal with Math Riddle
  await page.evaluate(() => {
    triggerTurkeyAlarmModal();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-live-math-alarm.png' });
  console.log('✅ تم التقاط مودال المسألة الحسابية الصارمة للمنبه: clan-live-math-alarm.png');

  await browser.close();
  console.log('🎉 اكتمل التقاط الصور بنجاح 100%!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
