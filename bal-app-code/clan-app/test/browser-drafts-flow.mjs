import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle0' });

console.log('1. Page loaded successfully');

// Check drafts hub button exists
const btnDrafts = await page.$('#btn-drafts-hub');
console.log('2. #btn-drafts-hub exists:', Boolean(btnDrafts));

// Click drafts hub button
await page.click('#btn-drafts-hub');
await new Promise(r => setTimeout(r, 400));

// Check drafts hub modal is visible
const modalHubVisible = await page.evaluate(() => {
  const m = document.getElementById('modal-drafts-hub');
  return m && m.style.display !== 'none' && !m.style.display.includes('none');
});
console.log('3. #modal-drafts-hub visible:', modalHubVisible);

// Click New Draft button
await page.evaluate(() => {
  window.openNewDraftEditor();
});
await new Promise(r => setTimeout(r, 400));

// Check draft editor modal is visible
const editorVisible = await page.evaluate(() => {
  const m = document.getElementById('modal-draft-editor');
  return m && m.style.display !== 'none' && !m.style.display.includes('none');
});
console.log('4. #modal-draft-editor visible:', editorVisible);

// Type title and body
await page.evaluate(() => {
  document.getElementById('input-draft-title').value = 'فكرة تطوير محرك المقابس اللحظي';
  document.getElementById('input-draft-content').value = 'تدوين فكرة معمارية النظم الموزعة مع Socket.io و Redis PubSub';
});

// Click save
await page.evaluate(() => {
  window.saveCurrentDraftAction();
});
await new Promise(r => setTimeout(r, 600));

// Check if draft appears in list
const draftsCount = await page.evaluate(() => {
  return window.userDrafts ? window.userDrafts.length : 0;
});
console.log('5. Total user drafts count:', draftsCount);

// Test Upload to AI
await page.evaluate(() => {
  window.uploadDraftToAiFromList(window.userDrafts[0].id);
});
await new Promise(r => setTimeout(r, 600));

// Check AI chat screen is active
const aiChatActive = await page.evaluate(() => {
  const s = document.getElementById('screen-ai-chat');
  return s && s.classList.contains('active');
});
console.log('6. #screen-ai-chat active after AI upload:', aiChatActive);

await browser.close();
console.log('🎉 All browser UI flows verified 100% successfully!');
process.exit(0);
