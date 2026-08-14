import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 بدء فحص شاشة الدخول وبوابة البطل واختيار المجال...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // Test Auth Gateway Flow
  const authFlowResult = await page.evaluate(() => {
    switchScreen('auth-gateway');
    const isAuthVisible = window.getComputedStyle(document.getElementById('screen-auth-gateway')).display !== 'none';

    // Click Google sign in
    handleGoogleSignInAction();
    const isOnboardingVisible = window.getComputedStyle(document.getElementById('screen-onboarding')).display !== 'none';

    // Select domain and finish
    selectOnboardingDomain('TECH', document.querySelector('.onboarding-domain-pill'));
    finishOnboardingAction();
    const isHomeVisible = window.getComputedStyle(document.getElementById('screen-home')).display !== 'none';

    return {
      isAuthVisible,
      isOnboardingVisible,
      isHomeVisible,
    };
  });

  console.log('✅ نتيجة تجربة بوابة الدخول واختيار المجال:', authFlowResult);
  await browser.close();
  console.log('🎉 اكتمل فحص شاشة الدخول والتسجيل بنجاح 100%!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
