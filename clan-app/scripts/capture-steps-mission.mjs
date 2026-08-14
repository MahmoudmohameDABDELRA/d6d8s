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

  await page.evaluate(() => {
    switchScreen('tasks');
    switchTaskAlarmSubTab('alarm');
    openAddAlarmModal();
    document.getElementById('input-alarm-time').value = '06:15';
    document.getElementById('input-alarm-label').value = 'منبه المشي الصباحي النشط 👟';
    document.getElementById('input-alarm-proof').value = 'STEP_COUNTER';
    submitNewBattleAlarm();

    triggerTurkeyAlarmModal(localAlarms[0].id);
    simulateDeviceStep();
    simulateDeviceStep();
    simulateDeviceStep();
  });
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: '/home/user/clan-live-alarm-steps-mission.png' });
  console.log('✅ تم التقاط نافذة مهمة المشي والـ 10 خطوات: clan-live-alarm-steps-mission.png');

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
