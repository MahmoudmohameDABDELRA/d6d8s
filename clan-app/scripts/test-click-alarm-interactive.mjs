import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🔍 اختبار النقر المباشر بالماوس واللمس على زر منبه المعركة...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.toString()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Click on [ منبه المهام ] tab in bottom dock
  await page.click('[data-tab="tasks"]');
  await new Promise(r => setTimeout(r, 300));

  // 2. Click on [ منبه المعركة ⏰ ] subtab button
  await page.click('#subtab-alarm-btn');
  await new Promise(r => setTimeout(r, 300));

  const alarmSubTabDisplay = await page.evaluate(() => {
    return {
      alarmViewDisplay: window.getComputedStyle(document.getElementById('view-alarm-subtab')).display,
      tasksViewDisplay: window.getComputedStyle(document.getElementById('view-tasks-subtab')).display,
    };
  });
  console.log('1️⃣ حالة التبديل لمنبه المعركة:', alarmSubTabDisplay);

  // 3. Click on the big button: [ 🔔 تشغيل منبه المعركة الصارم الآن 🦃 ]
  const triggerBtn = await page.$('#view-alarm-subtab button[onclick*="triggerTurkeyAlarmModal"]');
  if (!triggerBtn) {
    console.error('❌ زر تشغيل منبه المعركة غير موجود!');
  } else {
    await triggerBtn.click();
    await new Promise(r => setTimeout(r, 500));

    const modalState = await page.evaluate(() => {
      const modal = document.getElementById('modal-turkey-alarm');
      const style = window.getComputedStyle(modal);
      return {
        modalExists: !!modal,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
      };
    });
    console.log('2️⃣ حالة مودال منبه المعركة بعد النقر:', modalState);
  }

  console.log('Errors logged:', errors);
  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
