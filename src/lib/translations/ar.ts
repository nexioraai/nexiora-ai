import type { TranslationKey } from './fr';

export const ar: Record<TranslationKey, string> = {
  // Navbar
  'nav.login': 'تسجيل الدخول',
  'nav.signup': 'إنشاء حساب',
  'nav.dashboard': 'لوحة التحكم',

  // Footer
  'footer.copyright': '© 2026 Nexiora AI. جميع الحقوق محفوظة.',
  'footer.privacy': 'الخصوصية',
  'footer.terms': 'الشروط',

  // Home / Hero
  'home.badge': 'مولّد المواقع بالذكاء الاصطناعي',
  'home.title.part1': 'أطلق مشروعك',
  'home.title.part2': 'بالذكاء الاصطناعي',
  'home.subtitle': 'تنشئ Nexiora تلقائيًا مواقع ولوحات تحكم وتطبيقات لأصحاب المشاريع.',
  'home.dashboardLink': '← الذهاب إلى لوحة التحكم',

  // Onboarding step 1
  'onboarding.step1.subtitle': 'صِف نشاطك — والذكاء الاصطناعي يتكفّل بالباقي.',
  'onboarding.greeting': 'هل لديك فكرة، {name}؟',
  'onboarding.greetingNoName': 'هل لديك فكرة؟',
  'onboarding.step1.placeholder': 'صِف فكرتك ببساطة…',
  'onboarding.step1.languageAuto': 'تلقائي (يُكتشف من النص)',
  'onboarding.step1.btnLoading': 'جارٍ التحميل…',
  'onboarding.step1.btnNotLoggedIn': 'سجّل الدخول للإنشاء',
  'onboarding.step1.btnReady': '← إنشاء',
  'onboarding.step1.signinLink': 'تسجيل الدخول',
  'onboarding.step1.signinOr': 'أو',
  'onboarding.step1.signupLink': 'إنشاء حساب',
  'onboarding.step1.signinSuffix': 'لإنشاء موقعك.',

  // Onboarding step 2
  'onboarding.step2.back': '→ رجوع',
  'onboarding.step2.title': 'المزيد من التفاصيل',
  'onboarding.step2.subtitle': 'أضف سياقًا — الخدمات، الجمهور، الأسلوب.',
  'onboarding.step2.optional': '(اختياري)',
  'onboarding.step2.placeholder': 'نقدّم قهوة مختصة ومعجنات عضوية بأسلوب عصري بسيط…',
  'onboarding.step2.btn': '← إنشاء',
  'onboarding.step2.skip': 'اتركه فارغًا للتخطّي — سيتولّى الذكاء الاصطناعي الأمر.',

  // Onboarding step 3
  'onboarding.step3.title': 'جارٍ الإنشاء…',
  'onboarding.step3.subtitle': 'يستغرق هذا من 10 إلى 20 ثانية. يُرجى الانتظار.',

  // Onboarding errors / API
  'onboarding.error.sessionExpired': 'انتهت الجلسة — يُرجى إعادة تسجيل الدخول',
  'onboarding.error.invalidResponse': 'استجابة خادم غير صالحة',
  'onboarding.error.generationFailed': 'فشل الإنشاء',
  'onboarding.error.missingSlug': 'المعرّف (slug) مفقود في الاستجابة',
  'onboarding.additionalDetailsTag': '[تفاصيل إضافية من المستخدم]',
};
