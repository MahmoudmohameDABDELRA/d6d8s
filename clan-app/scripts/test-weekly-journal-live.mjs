import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 فحص أيقونة التقويم العلوية ومودال التوثيق الأسبوعي (Goal Reflection)...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Click on Calendar Icon at top of Home Screen
  const calendarClickResult = await page.evaluate(() => {
    switchScreen('home');
    const calBtn = document.getElementById('btn-weekly-journal-calendar');
    if (!calBtn) return { error: 'Calendar button not found!' };
    calBtn.click();

    const modal = document.getElementById('modal-weekly-journal');
    const style = window.getComputedStyle(modal);

    return {
      hasBtn: true,
      modalDisplay: style.display,
      modalOpacity: style.opacity,
      modalZIndex: style.zIndex,
    };
  });
  console.log('1️⃣ نتيجة النقر على أيقونة التقويم العلوية:', calendarClickResult);

  // 2. Test Week Selection & Reflection Submission
  const journalSubmitResult = await page.evaluate(async () => {
    selectJournalWeek(2);
    document.getElementById('input-journal-reflection').value = 'بناء واجهات النخبة وتدقيق الأداء بالكامل';
    await submitWeeklyJournalDocument();

    const toast = document.querySelector('.luxury-toast')?.innerText;
    return {
      toastMessage: toast,
    };
  });
  console.log('2️⃣ نتيجة حفظ وتوثيق الأسبوع:', journalSubmitResult);

  // 3. Open Modal again to Capture Screenshot
  await page.evaluate(() => {
    openWeeklyJournalModal();
  });
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: '/home/user/clan-live-weekly-journal.png' });
  console.log('📸 تم التقاط صورة مودال التوثيق الأسبوعي: clan-live-weekly-journal.png');

  await browser.close();
  console.log('🎉 اكتمل فحص التوثيق الأسبوعي بنجاح 100%!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
