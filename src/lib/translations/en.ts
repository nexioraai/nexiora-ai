import type { TranslationKey } from './fr';

export const en: Record<TranslationKey, string> = {
  // Navbar
  'nav.login': 'Sign in',
  'nav.signup': 'Sign up',
  'nav.dashboard': 'My dashboard',

  // Footer
  'footer.copyright': '© 2026 Nexiora AI. All rights reserved.',
  'footer.privacy': 'Privacy',
  'footer.terms': 'Terms',

  // Home / Hero
  'home.badge': 'AI Website Builder',
  'home.title.part1': 'Build your business',
  'home.title.part2': 'with AI',
  'home.subtitle': 'Nexiora automatically creates websites, dashboards, and apps for entrepreneurs.',
  'home.dashboardLink': 'Go to my dashboard →',

  // Onboarding step 1
  'onboarding.step1.subtitle': 'Describe your business — AI does the rest.',
  'onboarding.greeting': 'Got an idea, {name}?',
  'onboarding.greetingNoName': 'Got an idea?',
  'onboarding.step1.placeholder': 'Just describe your business idea...',
  'onboarding.step1.languageAuto': 'Auto (detected via prompt)',
  'onboarding.step1.btnLoading': 'Loading…',
  'onboarding.step1.btnNotLoggedIn': 'Sign in to generate',
  'onboarding.step1.btnReady': 'Generate →',
  'onboarding.step1.signinLink': 'Sign in',
  'onboarding.step1.signinOr': 'or',
  'onboarding.step1.signupLink': 'create an account',
  'onboarding.step1.signinSuffix': 'to generate your site.',

  // Onboarding step 2
  'onboarding.step2.back': '← Back',
  'onboarding.step2.title': 'More details',
  'onboarding.step2.subtitle': 'Add anything specific — services, audience, style.',
  'onboarding.step2.optional': '(optional)',
  'onboarding.step2.placeholder': 'We focus on specialty coffee, organic pastries, modern minimalist style…',
  'onboarding.step2.btn': 'Generate →',
  'onboarding.step2.skip': 'Leave blank to skip — AI will figure it out.',

  // Onboarding step 3
  'onboarding.step3.title': 'Generating…',
  'onboarding.step3.subtitle': 'Takes 10–20 seconds. Hang tight.',

  // Onboarding errors / API
  'onboarding.error.sessionExpired': 'Session expired — please sign in again',
  'onboarding.error.invalidResponse': 'Invalid server response',
  'onboarding.error.generationFailed': 'Generation failed',
  'onboarding.error.missingSlug': 'Missing slug in response',
  'onboarding.additionalDetailsTag': "[User's additional details]",
  'sidebar.home': 'Home',
  'sidebar.projects': 'My projects',
  'sidebar.section.products': 'Products & Services',
  'sidebar.aiVisibility': 'AI Visibility',
  'sidebar.erp': 'ERP',
  'sidebar.upgrade': 'Upgrade',
  'sidebar.settings': 'Settings',
  'sidebar.logout': 'Log out',
  'sidebar.soon': 'soon',
};
