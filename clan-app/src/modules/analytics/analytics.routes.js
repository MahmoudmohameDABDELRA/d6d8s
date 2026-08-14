import express from 'express';
import {
  getActivityTimeline,
  getCircadianDiscipline,
  getDashboard,
  getDomainRankings,
  getGrowthComparison,
  getMoodCorrelation,
  getPeakHours,
  getRadarMatrix,
} from './analytics.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

// ════════════════════════════════════════════════
//  جميع مسارات التحليلات محمية بالمصادقة والـ Onboarding
// ════════════════════════════════════════════════
router.use(authenticateToken);
router.use(requireOnboarded);

// 1. لوحة التحكم الموحدة والشاملة
router.get('/dashboard', getDashboard);

// 2. السلسلة الزمنية وخريطة الحرارة (Activity Heatmap)
router.get('/timeline', getActivityTimeline);

// 3. مصفوفة الرادار خماسية الأبعاد (Radar Matrix)
router.get('/radar', getRadarMatrix);

// 4. ساعات الذروة الذهبية والنمط البيولوجي (Peak Productivity Hours)
router.get('/peak-hours', getPeakHours);

// 5. مقارنة النمو الدوري (Growth & Delta Analytics)
router.get('/growth', getGrowthComparison);

// 6. انضباط النوم والاستيقاظ (Circadian Discipline)
router.get('/circadian', getCircadianDiscipline);

// 7. الارتباط بين المزاج والإنتاجية (Mood Correlation)
router.get('/mood-correlation', getMoodCorrelation);

// 8. الترتيب والنسبة المئوية في المجال والعشيرة (Domain & Clan Percentile)
router.get('/ranking', getDomainRankings);

export default router;
