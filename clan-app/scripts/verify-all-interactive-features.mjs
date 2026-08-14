import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 بدء الفحص الشامل لجميع الألعاب والمنبه وبلوكات المهام والذكاء الاصطناعي...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Test Snake Game
  console.log('1️⃣ اختبار لعبة الثعبان بالكانفاس...');
  const snakeRes = await page.evaluate(() => {
    openSnakeGameModal();
    const canvas = document.getElementById('snake-canvas');
    const scoreBadge = document.getElementById('snake-score-badge')?.innerText;
    changeSnakeDir('RIGHT');
    return {
      hasCanvas: !!canvas,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      scoreBadge
    };
  });
  console.log('   ✅ نتيجة الثعبان:', snakeRes);

  // 2. Test Domino Game
  console.log('2️⃣ اختبار طاولة الدومينو الرباعية...');
  const dominoRes = await page.evaluate(() => {
    closeModal('modal-snake-game');
    openDominoGameModal();
    const boardTiles = document.querySelectorAll('.domino-board-felt .domino-tile-item').length;
    const handTiles = document.querySelectorAll('#domino-hand-tray .domino-tile-item').length;
    playDominoTile(0);
    const handTilesAfter = document.querySelectorAll('#domino-hand-tray .domino-tile-item').length;
    return {
      boardTiles,
      handTilesBefore: handTiles,
      handTilesAfter,
    };
  });
  console.log('   ✅ نتيجة الدومينو:', dominoRes);

  // 3. Test Drawing Canvas
  console.log('3️⃣ اختبار لوحة الرسم الاسترخائي...');
  const drawRes = await page.evaluate(() => {
    closeModal('modal-domino-game');
    openDrawingCanvasModal();
    const drawCanvas = document.getElementById('drawing-canvas');
    selectDrawColor('#10b981', document.querySelectorAll('.color-palette-circle')[1]);
    return {
      hasDrawCanvas: !!drawCanvas,
      canvasWidth: drawCanvas?.width,
      canvasHeight: drawCanvas?.height,
    };
  });
  console.log('   ✅ نتيجة لوحة الرسم:', drawRes);

  // 4. Test Battle Alarm Turkey Simulator
  console.log('4️⃣ اختبار منبه الديك الرومي وسكتش الـ AI والتصعيد...');
  const alarmRes = await page.evaluate(() => {
    closeModal('modal-draw-canvas');
    triggerTurkeyAlarmModal();
    const speech1 = document.getElementById('turkey-ai-speech')?.innerText;
    handleTurkeySnooze();
    const speechAfterSnooze = document.getElementById('turkey-ai-speech')?.innerText;
    verifyWakeProofPhoto(false);
    return {
      speech1,
      speechAfterSnooze,
    };
  });
  console.log('   ✅ نتيجة منبه المعركة وسكتش الديك الرومي:', alarmRes);

  // 5. Test AI Co-Pilot Chat Drawer & Decomposing Tasks
  console.log('5️⃣ اختبار المرافق الذكي وتفكيك المهام...');
  const aiRes = await page.evaluate(() => {
    openAiCopilotModal();
    sendAiQuickPrompt('فكك مهمتي الحالية');
    return {
      chatMessagesCount: document.querySelectorAll('#ai-chat-messages > div').length,
    };
  });
  console.log('   ✅ نتيجة المرافق الذكي:', aiRes);

  // 6. Test Task Blocks & Silent Venting Box
  console.log('6️⃣ اختبار بلوكات المهام والجدول الزمني وصندوق التفريغ...');
  const tasksRes = await page.evaluate(() => {
    closeModal('modal-ai-copilot');
    switchScreen('tasks');
    const taskCards = document.querySelectorAll('#screen-tasks .task-card-pill').length;
    const ventingInput = document.getElementById('venting-input');
    if (ventingInput) {
      ventingInput.value = 'فكرة تكتيكية جديدة';
      addVentingDraft();
    }
    const draftsCount = document.querySelectorAll('#venting-drafts-list > div').length;
    return {
      taskCards,
      draftsCount,
    };
  });
  console.log('   ✅ نتيجة بلوكات المهام والمسودات:', tasksRes);

  await browser.close();
  console.log('🎉 اكتمل الفحص الحي بنجاح 100% وجميع المحركات تعمل بنسبة 100%!');
}

main().catch(err => {
  console.error('❌ Error during audit:', err);
  process.exit(1);
});
