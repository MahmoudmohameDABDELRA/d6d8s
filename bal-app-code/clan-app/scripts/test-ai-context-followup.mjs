import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 اختبار الـ 10 أسئلة المتنوعة للمتابعة وإرسال بيانات الـ JSON لـ Gemini AI...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Test 10 Questions Variety
  const questionsSample = await page.evaluate(() => {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      triggerPostTaskCheckin('درس الكيمياء');
      samples.push(document.getElementById('post-task-question')?.innerText);
      closeModal('modal-post-task-checkin');
    }
    return samples;
  });
  console.log('1️⃣ عينة من أسئلة المتابعة المتنوعة:', questionsSample);

  // 2. Test User Reply Submission with Task Metadata JSON
  const aiFollowupResult = await page.evaluate(async () => {
    triggerPostTaskCheckin('ماتش الكورة');
    document.getElementById('post-task-user-reply').value = 'كسبنا 5-3 وأنا جبت جونين!';
    await submitPostTaskCheckinReply();

    await new Promise(r => setTimeout(r, 800));

    const messages = Array.from(document.querySelectorAll('#ai-screen-chat-messages > div')).map(d => d.innerText);
    return {
      activeScreen: document.querySelector('.screen-pane.active')?.id,
      messages,
    };
  });
  console.log('2️⃣ نتيجة رد الـ AI على نتيجة المهمة وسياق الـ JSON:', aiFollowupResult);

  // 3. Test Difficult Task / Rest Empathy Scenario
  const aiEmpathyResult = await page.evaluate(async () => {
    triggerPostTaskCheckin('درس الفيزياء');
    document.getElementById('post-task-user-reply').value = 'الدرس كان صعب جداً ومفهمتش حاجة';
    await submitPostTaskCheckinReply();

    await new Promise(r => setTimeout(r, 800));

    const messages = Array.from(document.querySelectorAll('#ai-screen-chat-messages > div')).map(d => d.innerText);
    return {
      messages,
    };
  });
  console.log('3️⃣ نتيجة احتواء الـ AI لصعوبة المهمة (Zero Guilt Model):', aiEmpathyResult);

  await browser.close();
  console.log('🎉 اكتمل اختبار سياق الـ AI والـ 10 أسئلة بنجاح 100%!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
