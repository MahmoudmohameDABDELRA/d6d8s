import puppeteer from 'puppeteer-core';

async function captureAll5Hubs() {
  console.log('📸 Launching Headless Chrome to capture all 5 Hubs in Clan App...');
  const browser = await puppeteer.launch({
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

  // 1. Hub 1: Home
  await page.screenshot({ path: '/home/user/hub-1-home.png' });
  console.log('✅ Captured hub-1-home.png');

  // 2. Hub 2: Focus Setup
  await page.click('.dock-nav-item[data-tab="focus"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: '/home/user/hub-2-focus-config.png' });
  console.log('✅ Captured hub-2-focus-config.png');

  // 3. Hub 3: Progress & 5D Radar
  await page.click('.dock-nav-item[data-tab="progress"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: '/home/user/hub-3-progress-radar.png' });
  console.log('✅ Captured hub-3-progress-radar.png');

  // 4. Hub 4: Clan Selector
  await page.click('.dock-nav-item[data-tab="clan"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: '/home/user/hub-4-clan-selector.png' });
  console.log('✅ Captured hub-4-clan-selector.png');

  // 5. Hub 5: Settings & Profile
  await page.click('.dock-nav-item[data-tab="settings"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: '/home/user/hub-5-settings-profile.png' });
  console.log('✅ Captured hub-5-settings-profile.png');

  await browser.close();
  console.log('🎉 Done capturing all 5 Hubs!');
}

captureAll5Hubs().catch((err) => {
  console.error('❌ Capture error:', err);
  process.exit(1);
});
