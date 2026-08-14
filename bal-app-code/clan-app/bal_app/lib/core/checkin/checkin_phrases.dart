import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// 💬 بنك أسئلة الاطمئنان — ضد الإحساس بالتكرار
///
/// المشكلة (قرار المالك، وهو محق):
///   لو البوب-أب سأل بنفس الجملة كل مرة، المستخدم هيحس إنه بيكلم
///   روبوت وهيقفله من غير ما يقراه. ودي أهم شاشة في التطبيق.
///
/// الحل بطبقتين:
///   1. **بنك كبير** (24 صيغة × 6 عناوين) — مش 3 أو 4
///   2. **ذاكرة بلا تكرار**: بنفتكر آخر 12 صيغة اتعرضت ونستبعدهم.
///      يعني المستخدم لازم يشوف 12 سؤال مختلف قبل ما أي واحد يعيد.
///
/// ⚠️ الذاكرة محفوظة على الجهاز (SharedPreferences) مش في الرام —
///    من غير كده كل ما يقفل التطبيق ويفتحه يرجع لأول صيغة، والمستخدم
///    اللي بيفتح التطبيق مرة في اليوم هيشوف نفس السؤال كل يوم.
///
/// ملاحظة: السيرفر عنده بنك مشابه للإشعارات اللي بيولّدها هو. البنك
/// ده للأسئلة اللي التطبيق بيولّدها محلياً وقت المهمة.
abstract final class CheckInPhrases {
  static const _kRecent = 'bal_checkin_recent_phrases';
  static const _kRecentTitles = 'bal_checkin_recent_titles';

  /// كام صيغة نفتكرها ونستبعدها قبل ما نسمح بالإعادة
  static const _memory = 12;

  /// `{task}` بتتبدل باسم المهمة الحقيقي.
  ///
  /// ⚠️ كل صيغة لازم:
  ///   · تذكر المهمة بالاسم (مش «مهمتك»)
  ///   · تنتهي بسؤال مفتوح أو دعوة للحكي
  ///   · تكون خالية من أي لوم أو افتراض إنه فشل
  static const questions = <String>[
    'إيه الأخبار؟ عملت إيه في «{task}»؟ احكيلي عشان أساعدك.',
    'خلص وقت «{task}» — وصلت لفين فيها؟',
    'قوللي بقى، «{task}» ماشية معاك إزاي؟',
    'كنت فاكرك مع «{task}» — الدنيا تمام؟ محتاج حاجة؟',
    'إيه الموقف مع «{task}»؟ حتى لو مبدأتش، قوللي إيه اللي حصل.',
    'عامل إيه في «{task}»؟ احكيلي وأنا معاك.',
    'خلصت «{task}» ولا لسه؟ أي إجابة تمام — بس قوللي.',
    'باسأل عن «{task}» — فيه حاجة عطّلتك؟',
    'وقت «{task}» عدّى — إيه اللي اتعمل فيها؟',
    'شغل «{task}» وصل لفين؟ لو محتاج نفكّكها سوا قوللي.',
    'حابب أطمن عليك في «{task}». إيه الموقف؟',
    'قوللي على «{task}» — إنجاز ولا يوم تقيل؟ الاتنين تمام.',
    'أنا فضولي شوية 👀 «{task}» عملت فيها إيه؟',
    'خلّصنا «{task}»؟ قوللي الآخر إيه.',
    'إزيك؟ «{task}» كانت دلوقتي — احكيلي حصل إيه.',
    'يلا قوللي، «{task}» طلعت سهلة ولا واخدة دماغ؟',
    'عدّى وقت «{task}» — عايز أعرف رأيك فيها.',
    'كلمني عن «{task}» — إيه أكتر حاجة وقفت قدامك؟',
    'وقت «{task}» خلص. تحب تحكيلي، ولا نسيبها لبعدين؟',
    'إيه أخبار «{task}»؟ لو محتاج تفضفض أنا سامعك.',
    'ثانية واحدة — «{task}» عملت فيها إيه النهاردة؟',
    'قوللي عن «{task}»، حتى لو الرد «مش النهاردة».',
    'خلاص وقت «{task}» عدّى — طمنّي عليك.',
    'وصلت لفين في «{task}»؟ أي تقدم يستاهل نتكلم عنه.',
  ];

  /// عناوين البوب-أب — بتتغير كمان عشان الشكل ما يبقاش واحد
  static const titles = <String>[
    'رفيقك بيسأل عنك',
    'إيه الأخبار؟',
    'وقفة صغيرة',
    'اطمئنان سريع',
    'كلمة على السريع',
    'باسأل عنك',
  ];

  static final _rand = Random();

  /// سؤال جديد مختلف عن آخر 12 — باسم المهمة الحقيقي
  static Future<String> nextQuestion(String taskTitle) async {
    final idx = await _pickUnrepeated(_kRecent, questions.length);
    return questions[idx].replaceAll('{task}', taskTitle);
  }

  /// عنوان جديد مختلف عن آخر مرات
  static Future<String> nextTitle() async {
    final idx = await _pickUnrepeated(_kRecentTitles, titles.length);
    return titles[idx];
  }

  /// يختار فهرس مش موجود في المستخدَم مؤخراً، ويسجّله.
  ///
  /// لو البنك كله اتستهلك → نفتح كل الخيارات ما عدا آخر واحدة مباشرة
  /// (عشان على الأقل ما يتكررش سؤالين ورا بعض).
  static Future<int> _pickUnrepeated(String key, int total) async {
    List<int> recent = const [];
    SharedPreferences? prefs;

    try {
      prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(key);
      if (raw != null) {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          recent = decoded.whereType<int>().toList();
        }
      }
    } catch (_) {
      // فايل-أوبن: التخزين مش شغال؟ نكمل بعشوائي بحت
    }

    var candidates = <int>[
      for (var i = 0; i < total; i++)
        if (!recent.contains(i)) i,
    ];

    if (candidates.isEmpty) {
      final last = recent.isEmpty ? -1 : recent.last;
      candidates = [
        for (var i = 0; i < total; i++)
          if (i != last) i,
      ];
    }
    if (candidates.isEmpty) candidates = [for (var i = 0; i < total; i++) i];

    final chosen = candidates[_rand.nextInt(candidates.length)];

    if (prefs != null) {
      try {
        final updated = [...recent, chosen];
        final trimmed = updated.length > _memory
            ? updated.sublist(updated.length - _memory)
            : updated;
        await prefs.setString(key, jsonEncode(trimmed));
      } catch (_) {
        /* الحفظ فشل — مش مشكلة، السؤال اتعرض */
      }
    }

    return chosen;
  }
}
