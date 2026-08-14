# 💎 دليل دمج مكونات Vengeance UI وتطوير الواجهة الحديثة (Vengeance UI & Shadcn Integration)

**Clan App — Luxury Component Library & Modern Minimalist UI System**

---

## 🌟 ١. ما هي مكتبة Vengeance UI وكيف ترتقي بواجهة Clan App؟
مكتبة **Vengeance UI** هي نظام مكونات نخبوي مبني على معايير `shadcn/ui` و `Radix UI` و `Tailwind CSS`، مصممة خصيصاً لإنشاء واجهات تفاعلية فائقة الفخامة والحداثة (Next-Gen UI & Micro-interactions).

تتوافق هذه المكونات بنسبة 100% مع **دستور التصميم المينيمالي الحديث** المعتمد لدينا (باليت ثلاثي مقتصد · صفر إيموجيات · أزرار ناعمة · مساحات مريحة):

```
┌─────────────────────────────────────────────────────────────────────────┐
│              💎 خريطة مكونات Vengeance UI المختارة للتطبيق              │
├─────────────────────────────────────────────────────────────────────────┤
│ 1. Animated Rays / Light Lines ──► خلفية الأشعة الذهبية المخملية        │
│ 2. Glow Border Cards ────────────► بطاقات التيتانيوم بهالات ذهبية خفيفة │
│ 3. Glass Dock ───────────────────► شريط التنقل السفلي العائم فائق النعومة│
│ 4. Centered Dialogs & Popups ────► النوافذ المنبثقة العائمة (تيليجرام) │
│ 5. Minimalist Action Buttons ────► أزرار ناعمة بفيزياء لمسية 0ms        │
│ 6. Masked Avatars ───────────────► إطارات الأفاتار الملكية الناعمة      │
│ 7. Expandable Bento Grid ────────► مصفوفة الرادار وإحصائيات التركيز     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ ٢. إعداد السجل في ملف `components.json` (Shadcn Configuration)

لإتاحة سحب كافة مكونات Vengeance UI مباشرة عبر سطر الأوامر (CLI):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  },
  "registries": {
    "@vengeanceui": "https://www.vengenceui.com/r/{name}.json"
  }
}
```

---

## 🚀 ٣. أوامر التثبيت لأهم مكونات الواجهة

```bash
# ١. خلفية الأشعة التفاعلية الفاخرة
npx shadcn@latest add @vengeanceui/animated-rays

# ٢. بطاقات الهالة الذهبية المتوهجة
npx shadcn@latest add @vengeanceui/glow-border-card

# ٣. شريط التنقل العائم (Glass Dock)
npx shadcn@latest add @vengeanceui/dock

# ٤. الأزرار الحديثة الناعمة
npx shadcn@latest add @vengeanceui/animated-button
```

---

## 🎨 ٤. كيفية تطبيق هذه المكونات عبر منصات التطبيق:

### أ. في واجهة الويب الحية (`public/`):
* تم بناء وتضمين خوارزميات الـ CSS والـ Canvas والـ SVG الخاصة بمكونات Vengeance UI مباشرة (خلفية الأشعة المخملية، بطاقات الـ Glow Card، شريط الـ Glass Dock، والنوافذ العائمة في المنتصف بفيزياء 60 FPS) لتعمل بسرعة فائقة `0ms latency` ودون أي بطء أو ثقل.

### ب. في تطبيق فلاتر (`clan_flutter_app/`):
* تحويل أنماط Vengeance UI إلى ويدجت `AppDecorations` و `GlassmorphicContainer` و `CustomPainter` في Dart لتطابق التصميم بدقة بكسل واحدة.

---

## 📋 ٥. جدول توزيع مكونات Vengeance UI على شاشات التطبيق:

| الشاشة / القسم | مكون Vengeance UI المعادل | التأثير والوظيفة |
|---|---|---|
| **الخلفية العامة** | `Animated Rays` | أشعة ذهبية خافتة متحركة تمتص الضوء وتريح العين |
| **شريط التنقل السفلي** | `Glass Dock` | شريط عائم بزجاج مخملي وأيقونات Lucide ناعمة |
| **بطاقة التركيز الرئيسية** | `Glow Border Card` | بطاقة تيتانيوم بحدود ذهبية خفيفة تتوهج عند النشاط |
| **الإشعارات المنبثقة** | `Centered Floating Dialog` | بطاقة عائمة في المنتصف مع جرس تنبيه ثنائي التردد |
| **رادار الأبعاد الـ ٥** | `Expandable Bento` | شبكة معيارية لعرض ساعات التركيز والاستمرارية |
| **الأزرار الرئيسية** | `Minimal Animated Button` | أزرار ناعمة بحواف `rounded-md` وظلال خفيفة `shadow-sm` |
