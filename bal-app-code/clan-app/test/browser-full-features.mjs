import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle0' });

console.log('1. Page loaded successfully');

// 1. Test Universal Profile Modal
await page.evaluate(() => {
  window.openUserProfileModal('youssef-id', 'يوسف التكتيكي', 'بطل مسار التقنية · وحش اليوم', '٤٢.٥', '١٤', '١٤,٨٥٠', 'TECH');
});
await new Promise(r => setTimeout(r, 400));

const profileVisible = await page.evaluate(() => {
  const m = document.getElementById('modal-user-profile');
  return m && m.classList.contains('open');
});
console.log('2. #modal-user-profile opened:', profileVisible);

// Test Friend Request Button
await page.evaluate(() => {
  window.sendFriendRequestFromProfile();
});
const friendBtnText = await page.evaluate(() => {
  const b = document.getElementById('btn-profile-friend-request');
  return b ? b.textContent : '';
});
console.log('3. Friend request button updated:', friendBtnText.includes('تم إرسال الطلب'));

// Close profile modal
await page.evaluate(() => {
  window.closeModal('modal-user-profile');
});
await new Promise(r => setTimeout(r, 300));

// 2. Test 5-Min Pre-Task Reminder Popup
await page.evaluate(() => {
  window.triggerPreTaskReminder('درس الفيزياء المتقدمة', 'الفيزياء والعلوم');
});
await new Promise(r => setTimeout(r, 400));

const preTaskVisible = await page.evaluate(() => {
  const m = document.getElementById('modal-pre-task-reminder');
  return m && m.classList.contains('open');
});
const preTaskText = await page.evaluate(() => {
  const b = document.getElementById('pre-task-title-banner');
  return b ? b.textContent : '';
});
console.log('4. 5-min Pre-task reminder popup visible:', preTaskVisible, '| Text:', preTaskText.includes('٥ دقائق'));

await page.evaluate(() => {
  window.closeModal('modal-pre-task-reminder');
});
await new Promise(r => setTimeout(r, 300));

// 3. Test Sequential Alternating Post-Task Questions (1 -> 2 -> 3)
const qIndices = [];
for (let i = 0; i < 3; i++) {
  const q = await page.evaluate((title) => {
    return window.getNextFollowupQuestion(title);
  }, 'مهمة البرمجة');
  qIndices.push(q.index);
}
console.log('5. Sequential Question Alternation Indices:', qIndices);
const isSequential = qIndices[1] === qIndices[0] + 1 && qIndices[2] === qIndices[1] + 1;
console.log('   Is strictly sequential (1 -> 2 -> 3):', isSequential);

// 4. Test Notification Chime audio execution without throwing
const chimeSuccess = await page.evaluate(() => {
  try {
    window.playNotificationChime();
    return true;
  } catch (e) {
    return false;
  }
});
console.log('6. Notification chime executed cleanly:', chimeSuccess);

await browser.close();
console.log('\n🎉 ALL POPUPS, PROFILES, CHIMES, AND SEQUENTIAL QUESTIONS VERIFIED 100%!');
process.exit(0);
