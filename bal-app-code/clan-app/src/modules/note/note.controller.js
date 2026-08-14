import prisma from '../../config/prisma.js';
import * as gemini from '../../services/gemini.service.js';
import * as aiPersona from '../../services/aiPersona.service.js';
import * as aiContext from '../../services/aiContext.service.js';
import logger from '../../config/logger.js';

/**
 * ════════════════════════════════════════════════════════════
 *  وحدة المسودات والملاحظات الحرة (Drafts & Notes Hub)
 * ════════════════════════════════════════════════════════════
 */

/**
 * قائمة بكافة مسودات المستخدم
 * GET /api/notes or GET /api/drafts
 */
export const listNotes = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { q, tag } = req.query;

    const andClauses = [{ userId }];
    if (tag) andClauses.push({ tag: String(tag) });
    if (q && typeof q === 'string' && q.trim()) {
      const qClean = q.trim();
      andClauses.push({
        OR: [
          { title: { contains: qClean, mode: 'insensitive' } },
          { body: { contains: qClean, mode: 'insensitive' } },
        ],
      });
    }

    let notes = await prisma.note.findMany({
      where: { AND: andClauses },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });

    if (q && typeof q === 'string' && q.trim()) {
      const kw = q.trim().toLowerCase();
      notes = notes.filter((n) =>
        (n.title && n.title.toLowerCase().includes(kw)) ||
        (n.body && n.body.toLowerCase().includes(kw))
      );
    }

    res.json({
      success: true,
      count: notes.length,
      notes,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * إنشاء مسودة جديدة
 * POST /api/notes
 */
export const createNote = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { title, body, tag, isPinned } = req.body;

    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: 'محتوى المسودة مطلوب ولا يمكن أن يكون فارغاً',
      });
    }

    const cleanTitle = title && typeof title === 'string' ? title.trim().slice(0, 200) : null;
    const cleanBody = body.trim().slice(0, 50000);
    const cleanTag = tag && typeof tag === 'string' ? tag.trim().slice(0, 50) : null;

    const note = await prisma.note.create({
      data: {
        userId,
        title: cleanTitle,
        body: cleanBody,
        tag: cleanTag,
        isPinned: Boolean(isPinned),
      },
    });

    // مكافأة شرارة تدوين خفيفة (+5)
    await prisma.user.update({
      where: { id: userId },
      data: { sparksBalance: { increment: 5 } },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'تم حفظ المسودة بنجاح في خزنتك  (+٥ شرارات)',
      note,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * جلب مسودة واحدة بالمعرف
 * GET /api/notes/:id
 */
export const getNote = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { id } = req.params;

    const note = await prisma.note.findFirst({
      where: { id, userId },
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'المسودة غير موجودة أو تم حذفها',
      });
    }

    res.json({ success: true, note });
  } catch (err) {
    next(err);
  }
};

/**
 * تعديل مسودة قائمة
 * PUT/PATCH /api/notes/:id
 */
export const updateNote = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { id } = req.params;
    const { title, body, tag, isPinned } = req.body;

    const existing = await prisma.note.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'المسودة غير موجودة',
      });
    }

    const data = {};
    if (title !== undefined) {
      data.title = title ? String(title).trim().slice(0, 200) : null;
    }
    if (body !== undefined) {
      if (typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({
          success: false,
          message: 'محتوى المسودة لا يمكن أن يكون فارغاً',
        });
      }
      data.body = body.trim().slice(0, 50000);
    }
    if (tag !== undefined) {
      data.tag = tag ? String(tag).trim().slice(0, 50) : null;
    }
    if (isPinned !== undefined) {
      data.isPinned = Boolean(isPinned);
    }

    const updated = await prisma.note.update({
      where: { id },
      data,
    });

    res.json({
      success: true,
      message: 'تم تحديث المسودة بنجاح',
      note: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * حذف مسودة
 * DELETE /api/notes/:id
 */
export const deleteNote = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { id } = req.params;

    const existing = await prisma.note.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'المسودة غير موجودة',
      });
    }

    await prisma.note.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'تم حذف المسودة بنجاح من سجلك',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * رفع المسودة وتحليلها وتفكيكها عبر الذكاء الاصطناعي (Gemini AI)
 * POST /api/notes/:id/ai-analyze or POST /api/notes/ai-analyze
 */
export const aiAnalyzeNote = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { id } = req.params;
    let { title, body } = req.body;

    if (id) {
      const note = await prisma.note.findFirst({ where: { id, userId } });
      if (note) {
        title = note.title || title;
        body = note.body || body;
      }
    }

    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: 'محتوى المسودة مطلوب للتحليل بواسطة الذكاء الاصطناعي',
      });
    }

    const promptMessage = `المستخدم كتب مسودة حرة بعنوان "${title || 'أفكار بناء'}" ونصها:
"${body}"

حلل هذه الفكرة وقدم:
1. خلاصة تكتيكية سريعة ونبرة تشجيعية رفيعة.
2. تفكيك عملي للفكرة إلى 3 خطوات تنفيذية محددة (كل خطوة مدتها 15 دقيقة تركيز).
3. نصيحة ذهبية واحدة لحماية تركيزه والبدء فوراً.`;

    let aiResponseText = '';
    try {
      if (gemini.isConfigured()) {
        const rawCtx = await aiContext.build(userId);
        const sysInstruction = `${aiPersona.BASE_INSTRUCTION}\n${aiContext.toPrompt(rawCtx)}`;
        const result = await gemini.generate(sysInstruction, [], promptMessage, { maxTokens: 450 });
        aiResponseText = result.text;
      }
    } catch (aiErr) {
      logger.warn({ err: aiErr }, 'Gemini AI Note analysis fallback');
    }

    if (!aiResponseText) {
      aiResponseText = `يا بطل! فكرة ممتازة وتستحق التركيز 
إليك خطة تنفيذ مقترحة لـ [${title || 'مسودتك'}]:
1. الخطوة الأولى (15 دقيقة): تجهيز البيئة وتحديد المدخلات الأساسية.
2. الخطوة الثانية (15 دقيقة): البدء في التنفيذ المباشر لأول جزء عملي.
3. الخطوة الثالثة (15 دقيقة): المراجعة والتوثيق والربط.

نصيحة ذهبية: لا تنتظر الكمال، ابدأ بجلسة تركيز واحدة الآن وشاهد الفكرة تتحول لواقع! `;
    }

    res.json({
      success: true,
      title: title || 'مسودة تكتيكية',
      analysis: aiResponseText,
      message: 'تم تحليل المسودة بنجاح بواسطة المرافق الذكي',
    });
  } catch (err) {
    next(err);
  }
};
