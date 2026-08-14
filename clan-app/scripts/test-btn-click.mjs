import puppeteer from 'puppeteer-core';

async function testClick() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  
  // 1. Trigger focus check
  await page.evaluate(() => {
    window.triggerRandomFocusCheck();
  });
  await new Promise(r => setTimeout(r, 300));

  const isOpenBefore = await page.evaluate(() => {
    const m = document.getElementById('modal-focus-check');
    return m.classList.contains('open');
  });
  console.log('1. Focus Check Modal open before click:', isOpenBefore);

  // 2. Click "I am here" button
  await page.click('#btn-i-am-here');
  await new Promise(r => setTimeout(r, 300));

  const isOpenAfter = await page.evaluate(() => {
    const m = document.getElementById('modal-focus-check');
    return m.classList.contains('open');
  });
  console.log('2. Focus Check Modal open after click (should be false):', isOpenAfter);

  await browser.close();
}

testClick().catch(console.error);
