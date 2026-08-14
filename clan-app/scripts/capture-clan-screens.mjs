import puppeteer from 'puppeteer-core';

async function captureClanDepartment() {
  console.log('📸 Launching Headless Chrome to capture Clan Department Screens...');
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

  // 1. Click Clan Tab to open Clan Selector Hub
  await page.click('.dock-nav-item[data-tab="clan"]');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/clan-1-selector-hub.png' });
  console.log('✅ Captured clan-1-selector-hub.png');

  // 2. Click on Global Clan Card to open Clan Chat Room
  await page.click('.clan-hub-card');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/home/user/clan-2-chat-room.png' });
  console.log('✅ Captured clan-2-chat-room.png');

  // 3. Open Leader Management Drawer
  await page.evaluate(() => {
    window.openClanSettingsDrawer();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-3-leader-drawer.png' });
  console.log('✅ Captured clan-3-leader-drawer.png');

  // 4. Open Message Report & Block Modal
  await page.evaluate(() => {
    window.closeModal('modal-clan-manage');
    window.openReportBlockModal('أحمد', 'السلام عليكم يا رفاق');
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/clan-4-report-block.png' });
  console.log('✅ Captured clan-4-report-block.png');

  await browser.close();
  console.log('🎉 Done capturing all Clan Department screens!');
}

captureClanDepartment().catch((err) => {
  console.error('❌ Capture error:', err);
  process.exit(1);
});
