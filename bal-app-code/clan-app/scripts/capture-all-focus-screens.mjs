import puppeteer from 'puppeteer-core';

async function captureFocusDepartment() {
  console.log('📸 Launching Headless Chrome to capture all Focus Sub-Screens...');
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
  await new Promise((r) => setTimeout(r, 800));

  // 1. Capture Sub-Screen 1: Focus Config
  await page.click('.dock-nav-item[data-tab="focus"]');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/focus-1-config.png' });
  console.log('✅ Captured focus-1-config.png');

  // 2. Select Squad mode and open Sub-Screen 2: PUBG Squad Lobby
  await page.click('#mode-squad');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#config-launch-btn');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/focus-2-squad-lobby.png' });
  console.log('✅ Captured focus-2-squad-lobby.png');

  // 3. Launch Squad Focus to open Sub-Screen 3: Active Focus HUD
  await page.click('#squad-launch-btn');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/focus-3-hud-lockdown.png' });
  console.log('✅ Captured focus-3-hud-lockdown.png');

  // 4. Trigger Random Focus Check Modal
  await page.evaluate(() => {
    window.triggerRandomFocusCheck();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: '/home/user/focus-5-random-check.png' });
  console.log('✅ Captured focus-5-random-check.png');

  // 5. Close check and trigger Sub-Screen 4: Break & Dopamine Hub
  await page.evaluate(() => {
    window.closeModal('modal-focus-check');
    window.startBreakPeriod();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/focus-4-break-hub.png' });
  console.log('✅ Captured focus-4-break-hub.png');

  await browser.close();
  console.log('🎉 Done capturing all Focus Department sub-screens!');
}

captureFocusDepartment().catch((err) => {
  console.error('❌ Capture error:', err);
  process.exit(1);
});
