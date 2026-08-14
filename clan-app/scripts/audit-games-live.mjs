import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 بدء الفحص الحي الحقيقي للألعاب والدومينو والرسم في الفرونت إند...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(msg.text()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // Navigate to focus screen then to break hub
  await page.evaluate(() => {
    // Check if break screen elements exist
    const breakHub = document.getElementById('screen-break-hub');
    const snakeBtn = document.querySelector('.game-card-pill');
    const dominoBtn = document.querySelectorAll('.game-card-pill')[1];
    const drawBtn = document.querySelectorAll('.game-card-pill')[2];

    return {
      hasBreakHub: !!breakHub,
      hasSnakeBtn: !!snakeBtn,
      snakeOnclick: snakeBtn?.getAttribute('onclick'),
      dominoOnclick: dominoBtn?.getAttribute('onclick'),
      drawOnclick: drawBtn?.getAttribute('onclick'),
    };
  });

  // Switch to break hub
  const auditResult = await page.evaluate(() => {
    // Show break hub
    document.querySelectorAll('.screen-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('screen-break-hub').classList.add('active');

    // Click snake button
    const pills = document.querySelectorAll('.game-card-pill');
    pills[0].click(); // Snake
    const toast1 = document.getElementById('toast-container')?.innerText;

    pills[1].click(); // Domino
    const toast2 = document.getElementById('toast-container')?.innerText;

    pills[2].click(); // Drawing
    const toast3 = document.getElementById('toast-container')?.innerText;

    // Check if there is any canvas or modal that opens for games
    const canvasCount = document.querySelectorAll('canvas').length;
    const gameModals = document.querySelectorAll('#modal-snake, #modal-domino, #modal-draw, #modal-game');

    return {
      toastSnake: toast1,
      toastDomino: toast2,
      toastDraw: toast3,
      canvasCount,
      gameModalsCount: gameModals.length
    };
  });

  console.log('📊 نتائج الفحص الحي للفرونت إند الحالي:', auditResult);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
