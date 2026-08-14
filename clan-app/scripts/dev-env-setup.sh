#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  إعداد بيئة التطوير المحلية — Clan App («بال»)
#  شغّل مرة واحدة على أي جهاز:  bash scripts/dev-env-setup.sh
#  بيعمل: postgres + redis + قاعدة البيانات + schema + seed
# ═══════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."

echo "━━━ 1) تثبيت الخدمات (إن لم تكن موجودة) ━━━"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql redis-server
fi

echo "━━━ 2) تشغيل الخدمات ━━━"
(sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster $(ls /etc/postgresql 2>/dev/null | head -1) main start 2>/dev/null || true)
(redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes 2>/dev/null || true)
sleep 2

echo "━━━ 3) قاعدة البيانات والمستخدم (من .env) ━━━"
if [ ! -f .env ]; then echo "❌ .env غير موجود"; exit 1; fi
DB_PASS=$(grep -oP 'DATABASE_URL="postgresql://root:\K[^@]*' .env)
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='root'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER root WITH PASSWORD '$DB_PASS' SUPERUSER;"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='clan_app_db'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE clan_app_db OWNER root;"
PGPASSWORD="$DB_PASS" psql -h localhost -U root -d clan_app_db -c "SELECT 1" >/dev/null 2>&1 && echo "  ✅ الاتصال شغال"

echo "━━━ 4) npm install ━━━"
[ -d node_modules ] || npm install --no-audit --no-fund

echo "━━━ 5) Prisma schema + seed ━━━"
npx prisma generate >/dev/null 2>&1
npx prisma db push --accept-data-loss 2>&1 | tail -1
node prisma/seed.js 2>&1 | tail -2

echo "━━━ 6) تشغيل السيرفر ━━━"
if ! curl -s -m 2 http://localhost:3000/api/status >/dev/null 2>&1; then
  echo "  ⚠️ السيرفر مش شغال — شغّله بـ:  node src/server.js"
fi
echo "✅ تم — البيئة جاهزة"
