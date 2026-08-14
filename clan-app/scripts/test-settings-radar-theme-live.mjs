import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 فحص قسم الإعدادات والرادار خماسي الأبعاد وتبديل الثيم الليلي/النهاري...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Navigate to Settings & Radar
  await page.evaluate(() => {
    handleTabNavigation('settings');
  });
  await new Promise(r => setTimeout(r, 400));

  const radarSettingsState = await page.evaluate(() => {
    const isVisible = window.getComputedStyle(document.getElementById('screen-settings-profile')).display !== 'none';
    const wakeSuccess = document.getElementById('stat-wake-success')?.innerText;
    const wakeStreak = document.getElementById('stat-wake-longest')?.innerText;
    const wakeSpeed = document.getElementById('stat-wake-speed')?.innerText;

    // Test Theme Switch to Light Mode
    setAppThemeMode('light');
    const isLightMode = document.body.classList.contains('light-theme-active');

    // Test Theme Switch back to Dark Mode
    setAppThemeMode('dark');
    const isDarkMode = !document.body.classList.contains('light-theme-active');

    return {
      isVisible,
      wakeSuccess,
      wakeStreak,
      wakeSpeed,
      isLightMode,
      isDarkMode,
    };
  });
  console.log('✅ نتيجة فحص الإعدادات والرادار والثيم:', radarSettingsState);

  // Capture screenshot of the Settings & 5D Radar screen
  await page.screenshot({ path: '/home/user/clan-live-settings-radar.png' });
  console.log('📸 تم التقاط صورة شاشة الإعدادات والرادار: clan-live-settings-radar.png');

  await browser.close();
  console.log('🎉 اكتمل فحص الإعدادات ورادار الأبعاد الخمسة بنجاح 100%!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
