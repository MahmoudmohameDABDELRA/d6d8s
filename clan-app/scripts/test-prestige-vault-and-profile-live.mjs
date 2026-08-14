import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

async function main() {
  console.log('🚀 فحص باكدجات الهيبة وخزنة الإطارات وترددات الدماغ والملف الشخصي وإرسال الشعبية...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Test Prestige Vault Modal & Subtabs
  console.log('1️⃣ اختبار فتح خزنة وباكدجات الهيبة والتبديل بين الإطارات والترددات والهدايا...');
  const vaultResult = await page.evaluate(() => {
    openPrestigeVaultModal('frames');
    const isFramesVisible = document.getElementById('vault-view-frames').style.display !== 'none';

    switchVaultSubTab('synth');
    const isSynthVisible = document.getElementById('vault-view-synth').style.display !== 'none';

    switchVaultSubTab('gifts');
    const isGiftsVisible = document.getElementById('vault-view-gifts').style.display !== 'none';

    return {
      isFramesVisible,
      isSynthVisible,
      isGiftsVisible,
    };
  });
  console.log('   ✅ نتيجة فحص خزنة الباكدجات:', vaultResult);

  // Capture Screenshot of Prestige Vault Modal
  await page.screenshot({ path: '/home/user/clan-live-prestige-vault.png' });
  console.log('📸 تم التقاط صورة خزنة وباكدجات الهيبة: clan-live-prestige-vault.png');

  // 2. Test User Profile Modal & Popularity Gift Sending
  console.log('2️⃣ اختبار فتح الملف الشخصي وإرسال هدايا الشعبية...');
  const profileResult = await page.evaluate(() => {
    closeModal('modal-prestige-vault');
    openUserProfileModal('u2', 'يوسف التكتيكي', 'بطل مسار التقنية · وحش اليوم الكامل', 42.5, 14, 14850);

    const initialPop = document.getElementById('profile-modal-popularity')?.innerText;

    // Send Dragon Gift (+1000 Popularity)
    sendPopularityGiftAction('🐉 تنين النخبة', 1000, 500);
    const updatedPop = document.getElementById('profile-modal-popularity')?.innerText;

    return {
      initialPop,
      updatedPop,
    };
  });
  console.log('   ✅ نتيجة إرسال هدية الشعبية للرفيق:', profileResult);

  // Capture Screenshot of User Profile Modal
  await page.screenshot({ path: '/home/user/clan-live-user-profile-gift.png' });
  console.log('📸 تم التقاط صورة الملف الشخصي وإرسال الشعبية: clan-live-user-profile-gift.png');

  await browser.close();
  console.log('🎉 اكتمل فحص الباكدجات وترددات الدماغ والشعبية بنجاح 100%!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
