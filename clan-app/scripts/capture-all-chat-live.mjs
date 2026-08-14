import puppeteer from 'puppeteer-core';

async function captureAllChatLive() {
  console.log('📸 Launching Chrome to capture all Chat Department screens...');
  const browser = await puppeteer.launch({
    executablePath: '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 430,
    height: 920,
    deviceScaleFactor: 2,
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));

  // 1. Click Clan/Chat Tab to open Chat Hub (Screen 1)
  await page.click('.dock-nav-item[data-tab="clan"]');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/chat-live-1-hub.png' });
  console.log('✅ Captured chat-live-1-hub.png');

  // 2. Open Direct 1-on-1 Chat with Youssef (Screen 2)
  await page.click('.conversation-glass-card:first-of-type');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/chat-live-2-direct.png' });
  console.log('✅ Captured chat-live-2-direct.png');

  // 3. Open Discovery Search (Screen 3)
  await page.evaluate(() => {
    window.switchScreen('chat-search');
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/chat-live-3-search.png' });
  console.log('✅ Captured chat-live-3-search.png');

  // 4. Open Requests Tab (Screen 4)
  await page.evaluate(() => {
    window.switchScreen('chat-hub');
    window.switchChatHubTab('requests');
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/chat-live-4-requests.png' });
  console.log('✅ Captured chat-live-4-requests.png');

  await browser.close();
  console.log('🎉 Done capturing all live chat screens!');
}

captureAllChatLive().catch((err) => {
  console.error('❌ Capture error:', err);
  process.exit(1);
});
