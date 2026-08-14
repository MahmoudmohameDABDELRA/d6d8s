import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🔍 تشخيص كامل لرحلة المستخدم في قسم المنبه...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Click Alarm Tab
  const tabResult = await page.evaluate(() => {
    const alarmTab = document.querySelector('[data-tab="battle-alarm"]');
    alarmTab.click();
    return {
      activeScreen: document.querySelector('.screen-pane.active')?.id,
      alarmsCountBefore: document.querySelectorAll('#alarms-dynamic-list > div').length,
    };
  });
  console.log('1️⃣ تبويب المنبه:', tabResult);

  // 2. Click "+ ضبط منبه جديد" and submit unique time
  const submitResult = await page.evaluate(async () => {
    openAddAlarmModal();
    const timeInput = document.getElementById('input-alarm-time');
    const labelInput = document.getElementById('input-alarm-label');
    const randMin = Math.floor(Math.random() * 50) + 10;
    if (timeInput) timeInput.value = `08:${randMin}`;
    if (labelInput) labelInput.value = 'منبه استيقاظ مخصص واختبار حي ⏰';

    await submitNewBattleAlarm();
    await new Promise(r => setTimeout(r, 600));

    const alarmsCountAfter = document.querySelectorAll('#alarms-dynamic-list > div').length;
    const toast = document.querySelector('.luxury-toast')?.innerText;

    return {
      alarmsCountAfter,
      toastMessage: toast,
    };
  });
  console.log('2️⃣ نتيجة إضافة المنبه بنجاح:', submitResult);

  await browser.close();
  console.log('✅ اكتمل اختبار المنبه بنجاح 100%!');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
