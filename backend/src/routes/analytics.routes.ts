import { Router } from 'express';
import { requireAuth, uid } from '../middleware/auth';
import { ah } from '../utils/http';
import { computeAnalytics, computeInsights, Range } from '../services/analytics';

/** PHASE 3 – Analytics & Learning Insights */
const router = Router();
router.use(requireAuth);

/* GET /analytics/overview?range=day|week|month&end=ISO */
router.get(
  '/overview',
  ah(async (req, res) => {
    const range = (['day', 'week', 'month'].includes(String(req.query.range)) ? req.query.range : 'week') as Range;
    const end = req.query.end ? new Date(String(req.query.end)) : new Date();
    res.json(await computeAnalytics(uid(req), range, isNaN(+end) ? new Date() : end));
  }),
);

/* GET /analytics/insights — Focus Intelligence (dựa trên luật, không tốn chi phí AI) */
router.get(
  '/insights',
  ah(async (req, res) => {
    const { insights } = await computeInsights(uid(req));
    res.json({ insights });
  }),
);

/* GET /analytics/export?range=month — xuất CSV chuỗi theo ngày */
router.get(
  '/export',
  ah(async (req, res) => {
    const range = (['week', 'month'].includes(String(req.query.range)) ? req.query.range : 'month') as Range;
    const a = await computeAnalytics(uid(req), range);
    const rows = [
      ['date', 'focus_minutes', 'planned_minutes', 'distractions', 'tasks_done', 'quiz_accuracy'],
      ...a.series.map((s) => [s.date, s.focusMinutes, s.plannedMinutes, s.distractions, s.tasksDone, s.quizAccuracy == null ? '' : Math.round(s.quizAccuracy * 100)]),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="focusly-${range}-${a.to}.csv"`);
    res.send('﻿' + rows.map((r) => r.join(',')).join('\n'));
  }),
);

export default router;
