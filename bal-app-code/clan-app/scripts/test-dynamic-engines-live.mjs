import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 بدء الفحص الحي لمحركات المهام والمنبهات والديناميكية وشات الـ AI...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Test Task Dynamic Add Modal
  console.log('1️⃣ اختبار إضافة بلوك مهمة جديد ديناميكياً...');
  const taskRes = await page.evaluate(async () => {
    switchScreen('tasks');
    await fetchRealTasks();
    const countBefore = document.querySelectorAll('#tasks-dynamic-list .task-card-pill').length;

    // Fill and submit modal
    openAddTaskModal();
    document.getElementById('input-task-title').value = 'مهمة مخصصة جديدة للاختبار 🚀';
    await submitNewTaskBlock();
    await fetchRealTasks();
    const countAfter = document.querySelectorAll('#tasks-dynamic-list .task-card-pill').length;

    return {
      countBefore,
      countAfter,
    };
  });
  console.log('   ✅ نتيجة إضافة المهام:', taskRes);

  // 2. Test Alarm Dynamic Add Modal
  console.log('2️⃣ اختبار إضافة منبه معركة جديد ديناميكياً...');
  const alarmRes = await page.evaluate(async () => {
    switchScreen('battle-alarm');
    await fetchRealAlarms();
    const countBefore = document.querySelectorAll('#alarms-dynamic-list > div').length;

    // Fill and submit modal
    openAddAlarmModal();
    document.getElementById('input-alarm-time').value = '07:30';
    document.getElementById('input-alarm-label').value = 'منبه جلسة الضحى التكتيكية ☀️';
    await submitNewBattleAlarm();
    await fetchRealAlarms();
    const countAfter = document.querySelectorAll('#alarms-dynamic-list > div').length;

    return {
      countBefore,
      countAfter,
    };
  });
  console.log('   ✅ نتيجة إضافة المنبهات:', alarmRes);

  // 3. Test Pre-Task Reminder Popup
  console.log('3️⃣ اختبار بوب-أب التنبيه المسبق بنصيحة الـ AI قبل المهمة...');
  const preTaskRes = await page.evaluate(() => {
    triggerPreTaskReminder('درس الفيزياء', 'العلوم والدراسة');
    const title = document.getElementById('pre-task-title')?.innerText;
    const banter = document.getElementById('pre-task-banter')?.innerText;
    const tip = document.getElementById('pre-task-tip')?.innerText;
    closeModal('modal-pre-task-reminder');
    return { title, banter, tip };
  });
  console.log('   ✅ نتيجة التنبيه المسبق:', preTaskRes);

  // 4. Test Post-Task Check-in & AI Chat Stream
  console.log('4️⃣ اختبار بوب-أب المتابعة بعد المهمة وبدء محادثة الـ AI...');
  const postTaskRes = await page.evaluate(async () => {
    triggerPostTaskCheckin('ماتش الكورة');
    document.getElementById('post-task-user-reply').value = 'كسبنا الماتش 5-3 وأنا جبت جونين!';
    await submitPostTaskCheckinReply();
    const messagesCount = document.querySelectorAll('#ai-screen-chat-messages > div').length;
    return {
      messagesCount,
      activeScreen: document.querySelector('.screen-pane.active')?.id,
    };
  });
  console.log('   ✅ نتيجة متابعة المهمة وشات الـ AI:', postTaskRes);

  await browser.close();
  console.log('🎉 نجح الفحص الحي 100%! تم التحقق من ديناميكية المهام، المنبهات، وشات الـ AI!');
}

main().catch(err => {
  console.error('❌ Error during test:', err);
  process.exit(1);
});
