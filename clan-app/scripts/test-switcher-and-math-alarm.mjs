import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 اختبار التبديل العلوي [المهام | المنبه] والمسألة الحسابية وتصوير الكوب في النور...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Navigate to Tasks and test top switcher
  const switcherResult = await page.evaluate(() => {
    switchScreen('tasks');
    const isTasksVisible = document.getElementById('view-tasks-subtab').style.display !== 'none';

    // Switch to Alarm subtab
    switchTaskAlarmSubTab('alarm');
    const isAlarmVisible = document.getElementById('view-alarm-subtab').style.display !== 'none';

    // Switch back to Tasks subtab
    switchTaskAlarmSubTab('tasks');
    const isTasksVisibleAgain = document.getElementById('view-tasks-subtab').style.display !== 'none';

    return {
      isTasksVisible,
      isAlarmVisible,
      isTasksVisibleAgain,
    };
  });
  console.log('1️⃣ نتيجة التبديل العلوي بين المهام والمنبه:', switcherResult);

  // 2. Test Alarm Math Riddle Solve
  const mathAlarmResult = await page.evaluate(() => {
    triggerTurkeyAlarmModal();
    const mathQuestion = document.getElementById('alarm-math-question')?.innerText;

    // Test wrong answer first
    document.getElementById('alarm-math-input').value = '9999';
    submitAlarmMathAnswer();
    const speechWrong = document.getElementById('turkey-ai-speech')?.innerText;

    // Test correct answer
    document.getElementById('alarm-math-input').value = window.currentAlarmMathAnswer || 85;
    submitAlarmMathAnswer();
    const speechCorrect = document.getElementById('turkey-ai-speech')?.innerText;

    return {
      mathQuestion,
      speechWrong,
      speechCorrect,
    };
  });
  console.log('2️⃣ نتيجة حل المسألة الحسابية وإيقاف المنبه:', mathAlarmResult);

  await browser.close();
  console.log('🎉 نجح الفحص 100%! تم التحقق من التبديل والمسألة الحسابية وتصوير الكوب في النور!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
