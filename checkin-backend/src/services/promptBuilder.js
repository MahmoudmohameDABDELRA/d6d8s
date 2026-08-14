/**
 * Builds the system prompt and message list sent to the AI, given the
 * task the user was working on and what they just typed back to the
 * check-in question. Keeping this in its own module means you can tune
 * the "personality" of the app's replies in one place.
 */

function buildSystemPrompt() {
  return [
    'انت الصوت اللي بيتكلم بيه تطبيق تركيز اسمه "جلسة تركيز".',
    'مهمتك إنك ترد على المستخدم بعد ما يخلص مهمة معينة، بناءً على وصف المهمة ورده هو.',
    'الرد لازم يكون:',
    '- قصير (سطرين لثلاثة سطور بحد أقصى)',
    '- بالعامية المصرية، ودود ومحفّز',
    '- مرتبط فعليًا بتفاصيل المهمة (الاسم والمدة) ورد المستخدم، مش رد عام',
    '- لو حس إن المستخدم متأخر أو مقصر، شجّعه من غير لوم',
    '- من غير مقدمات زي "أكيد" أو "بالطبع"، ادخل في الرد على طول',
  ].join('\n');
}

/**
 * @param {object} task - { id, title, scheduled_time, duration_minutes, is_done }
 * @param {string} userReply - what the user typed in the check-in box
 * @param {Array<{sender: 'app'|'user', text: string}>} [history] - optional
 *        prior check-ins for the same task/user, oldest first, for continuity
 */
function buildUserMessage(task, userReply, history = []) {
  const historyBlock = history.length
    ? history
        .map((h) => `${h.sender === 'user' ? 'المستخدم' : 'التطبيق'}: ${h.text}`)
        .join('\n')
    : 'مفيش محادثات سابقة على المهمة دي.';

  return [
    `بيانات المهمة:`,
    `- الاسم: ${task.title}`,
    `- المعاد المجدول: ${task.scheduled_time}`,
    `- المدة: ${task.duration_minutes} دقيقة`,
    `- الحالة: ${task.is_done ? 'متعلّمة كمخلّصة' : 'لسه مش متعلّمة كمخلّصة'}`,
    ``,
    `محادثات سابقة على نفس المهمة:`,
    historyBlock,
    ``,
    `رد المستخدم دلوقتي على سؤال "عملت في المهمة إيه؟":`,
    `"${userReply}"`,
  ].join('\n');
}

module.exports = { buildSystemPrompt, buildUserMessage };
