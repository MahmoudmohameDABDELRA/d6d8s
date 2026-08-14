import puppeteer from 'puppeteer-core';

async function testCycleBuilder() {
  console.log('📸 Launching Headless Chrome to capture Custom Cycle Builder...');
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

  // 1. Click Focus Tab to open Custom Cycle Builder
  await page.click('.dock-nav-item[data-tab="focus"]');
  await new Promise((r) => setTimeout(r, 600));

  await page.screenshot({ path: '/home/user/focus-1-custom-builder.png' });
  console.log('✅ Captured focus-1-custom-builder.png');

  await browser.close();
  console.log('🎉 Done testing cycle builder!');
}

testCycleBuilder().catch((err) => {
  console.error('❌ Capture error:', err);
  process.exit(1);
});
