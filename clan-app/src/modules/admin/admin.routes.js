import express from 'express';
import {
  addClanMemberForce,
  adjustUserSparks,
  adjustUserStreak,
  adminDeleteClan,
  createAdminClan,
  deleteUserAccount,
  flushAllCache,
  flushUserCache,
  getAiUsageSummary,
  getDashboardStats,
  getGrowthCohorts,
  getGrowthDashboard,
  getSystemDeepHealth,
  grantMythicTitle,
  grantUserAiBonus,
  grantUserSubscription,
  inspectUser,
  listActiveFocusSessions,
  listAdminClans,
  listAdminReports,
  listMarketingCampaigns,
  listOperationalExpenses,
  listSparksLedger,
  listUsers,
  recordMarketingCampaign,
  recordOperationalExpense,
  removeClanMemberForce,
  resolveAdminReport,
  revokeMythicTitle,
  sendSystemBroadcast,
  setUserRole,
  terminateFocusSession,
  toggleUserBan,
  transferClanLeader,
  updateAdminClan,
} from './admin.controller.js';
import {
  authenticateToken,
  requireAdmin,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

// ════════════════════════════════════════════════
//  جميع مسارات لوحة التحكم محمية بحارسَي الأمان
// ════════════════════════════════════════════════
router.use(authenticateToken);
router.use(requireAdmin);

// ── ١. الإحصائيات وصحة النظام والبث الشامل ──
router.get('/stats', getDashboardStats);
router.get('/system/health-deep', getSystemDeepHealth);
router.post('/system/flush-all-cache', flushAllCache);
router.post('/broadcast', sendSystemBroadcast);

// ── ٢. إدارة وتفتيش المستخدمين (God-Mode) ──
router.get('/users', listUsers);
router.get('/users/:userId/inspect', inspectUser);
router.patch('/users/:userId/ban', toggleUserBan);
router.patch('/users/:userId/role', setUserRole);
router.post('/users/:userId/sparks-adjust', adjustUserSparks);
router.post('/users/:userId/streak-adjust', adjustUserStreak);
router.post('/users/:userId/subscription', grantUserSubscription);
router.post('/users/:userId/ai-bonus', grantUserAiBonus);
router.delete('/users/:userId', deleteUserAccount);
router.post('/users/:userId/flush-cache', flushUserCache);

// ── ٣. السيطرة على العشائر والكتائب ──
router.get('/clans', listAdminClans);
router.post('/clans', createAdminClan);
router.patch('/clans/:clanId', updateAdminClan);
router.post('/clans/:clanId/transfer-leader', transferClanLeader);
router.post('/clans/:clanId/members', addClanMemberForce);
router.delete('/clans/:clanId/members/:userId', removeClanMemberForce);
router.delete('/clans/:clanId', adminDeleteClan);

// ── ٤. الرقابة الحية على جلسات التركيز ومكافحة الغش ──
router.get('/focus/active', listActiveFocusSessions);
router.post('/focus/:sessionId/terminate', terminateFocusSession);

// ── ٥. إدارة الألقاب الأسطورية ──
router.post('/titles/grant', grantMythicTitle);
router.post('/titles/revoke', revokeMythicTitle);

// ── ٦. الرقابة المالية وحركات الشرارات ──
router.get('/sparks/ledger', listSparksLedger);

// ── ٧. البلاغات الرقابية وحظر المسيئين ──
router.get('/reports', listAdminReports);
router.patch('/reports/:reportId/resolve', resolveAdminReport);

// ── ٨. مراقبة الذكاء الاصطناعي ──
router.get('/ai/usage', getAiUsageSummary);

// ── ٩. اقتصاديات الوحدة والنسب الذهبية ومصروفات التسويق ──
router.get('/growth/dashboard', getGrowthDashboard);
router.get('/growth/cohorts', getGrowthCohorts);
router.post('/growth/marketing-spend', recordMarketingCampaign);
router.get('/growth/marketing-spend', listMarketingCampaigns);
router.post('/growth/expenses', recordOperationalExpense);
router.get('/growth/expenses', listOperationalExpenses);

export default router;
