# خطوتنا — نحو الاستقلال المالي ❤️

MVP عربي Mobile-First لإدارة المال بين زوجين بمساحة مالية مشتركة.

## الموجود في هذه النسخة
- تسجيل حساب / تسجيل دخول عبر Supabase Auth
- إنشاء عائلة أو الانضمام برمز دعوة
- بيانات مشتركة مرتبطة بـ `household_id`
- لوحة رئيسية: دخل، مصروف، رصيد، توفير
- إضافة دخل ومصروف
- أهداف مالية وإضافة مساهمات
- توفير
- ميزانيات وتصنيفات
- تحليل بسيط للمصاريف
- Supabase Realtime للمصاريف والتوفير والأهداف
- RLS لمنع الوصول لعائلة أخرى
- دعم SYP / USD / EUR
- PWA skeleton عبر manifest + service worker
- واجهة عربية RTL وBottom Navigation

## الإعداد

1. أنشئ مشروع Supabase جديدًا (يفضل عدم مشاركة قاعدة بيانات مشروع مختلف).
2. افتح SQL Editor والصق محتوى `supabase/schema.sql` ونفذه.
3. من Project Settings > API خذ:
   - Project URL
   - Publishable key
4. افتح `src/supabase.js` واستبدل:
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_PUBLISHABLE_KEY`
5. ارفع الملفات إلى GitHub Pages أو أي استضافة static.

## GitHub Pages
لأن المشروع Static ويمكنه العمل مباشرة من المستودع، فعّل Pages على الفرع `main` والمجلد `/root`.

> ملاحظة: Google Fonts تحتاج إنترنت. يمكن حذف import من CSS إذا أردت العمل دونها.

## الأمان
لا تضع Service Role Key في الواجهة. استخدم فقط Publishable/Anon Key؛ الحماية الفعلية مطبقة بواسطة RLS.

## الخطوة التالية المقترحة
إضافة Push Notifications بواسطة Web Push + Supabase Edge Function، ثم تحسين الرسوم البيانية وإضافة إدارة الميزانيات والتحديات من الواجهة.
