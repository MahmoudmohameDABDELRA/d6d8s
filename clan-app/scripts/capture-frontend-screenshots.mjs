import puppeteer from 'puppeteer-core';

async function capture() {
  console.log('📸 Launching Headless Chrome to capture real rendered screenshots...');
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

  // Navigate to live app
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  // 1. Capture Screen 1: Home Hub
  const homePath = '/home/user/rendered-screen1-home.png';
  await page.screenshot({ path: homePath });
  console.log(`✅ Captured Screen 1 (Home Hub) at: ${homePath}`);

  // 2. Click Focus Tab to switch to Screen 2: Focus HUD
  await page.click('.dock-nav-item[data-tab="focus"]');
  await new Promise((r) => setTimeout(r, 800));

  // Capture Screen 2: Focus HUD
  const focusPath = '/home/user/rendered-screen2-focus.png';
  await page.screenshot({ path: focusPath });
  console.log(`✅ Captured Screen 2 (Focus HUD) at: ${focusPath}`);

  await browser.close();
  console.log('🎉 Done capturing screenshots!');
}

capture().catch((err) => {
  console.error('❌ Capture error:', err);
  process.exit(1);
});
