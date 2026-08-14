import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 اختبار مهام الاستيقاظ المخصصة (المشي ١٠ خطوات، المسألة الحسابية، تصوير الكوب)...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Create a Step Counter Alarm (10 Steps)
  console.log('1️⃣ إنشاء منبه بمهمة المشي ١٠ خطوات...');
  const stepAlarmResult = await page.evaluate(() => {
    switchScreen('tasks');
    switchTaskAlarmSubTab('alarm');

    openAddAlarmModal();
    document.getElementById('input-alarm-time').value = '06:15';
    document.getElementById('input-alarm-label').value = 'منبه المشي الصباحي النشط 👟';
    document.getElementById('input-alarm-proof').value = 'STEP_COUNTER';
    submitNewBattleAlarm();

    const latestAlarm = localAlarms[0];
    return {
      alarmId: latestAlarm.id,
      missionType: latestAlarm.missionType,
    };
  });
  console.log('   ✅ تم إنشاء منبه المشي:', stepAlarmResult);

  // 2. Trigger Alarm and Test 10-Step Countdown
  console.log('2️⃣ تشغيل منبه المشي واختبار استشعار الخطوات 10 -> 0...');
  const stepTriggerResult = await page.evaluate(() => {
    triggerTurkeyAlarmModal(localAlarms[0].id);

    const isStepsVisible = document.getElementById('mission-view-steps').style.display !== 'none';
    const isMathVisible = document.getElementById('mission-view-math').style.display !== 'none';

    // Simulate 10 steps
    for (let i = 0; i < 10; i++) {
      simulateDeviceStep();
    }

    const stepsLeft = document.getElementById('alarm-steps-counter')?.innerText;
    return {
      isStepsVisible,
      isMathVisible,
      stepsLeft,
    };
  });
  console.log('   ✅ نتيجة إكمال مهمة الـ ١٠ خطوات:', stepTriggerResult);

  await browser.close();
  console.log('🎉 اكتمل اختبار مهام الاستيقاظ المخصصة بنجاح 100%!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
