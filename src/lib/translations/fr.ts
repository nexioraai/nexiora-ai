export const fr = {
  // Navbar
  'nav.login': 'Connexion',
  'nav.signup': 'Créer un compte',
  'nav.dashboard': 'Mon tableau de bord',

  // Footer
  'footer.copyright': '© 2026 Nexiora AI. Tous droits réservés.',
  'footer.privacy': 'Confidentialité',
  'footer.terms': 'Conditions',

  // Home / Hero
  'home.badge': 'Générateur de sites IA',
  'home.title.part1': 'Lancez votre entreprise',
  'home.title.part2': "avec l'IA",
  'home.subtitle': 'Nexiora crée automatiquement des sites web, tableaux de bord et applications pour entrepreneurs.',
  'home.dashboardLink': 'Accéder à mon tableau de bord →',

  // Onboarding step 1
  'onboarding.step1.subtitle': "Décrivez votre activité — l'IA fait le reste.",
  'onboarding.step1.placeholder': 'Crée un site moderne pour mon café nommé COFA à Montréal…',
  'onboarding.step1.languageAuto': 'Auto (détectée via prompt)',
  'onboarding.step1.btnLoading': 'Chargement…',
  'onboarding.step1.btnNotLoggedIn': 'Se connecter pour générer',
  'onboarding.step1.btnReady': 'Générer →',
  'onboarding.step1.signinLink': 'Se connecter',
  'onboarding.step1.signinOr': 'ou',
  'onboarding.step1.signupLink': 'créer un compte',
  'onboarding.step1.signinSuffix': 'pour générer votre site.',

  // Onboarding step 2
  'onboarding.step2.back': '← Retour',
  'onboarding.step2.title': 'Plus de détails',
  'onboarding.step2.subtitle': 'Ajoutez du contexte — services, audience, style.',
  'onboarding.step2.optional': '(optionnel)',
  'onboarding.step2.placeholder': 'On fait du café de spécialité, des pâtisseries bio, dans un style minimaliste moderne…',
  'onboarding.step2.btn': 'Générer →',
  'onboarding.step2.skip': "Laissez vide pour passer — l'IA s'en occupera.",

  // Onboarding step 3
  'onboarding.step3.title': 'Génération en cours…',
  'onboarding.step3.subtitle': 'Cela prend 10 à 20 secondes. Patientez.',

  // Onboarding errors / API
  'onboarding.error.sessionExpired': 'Session expirée — veuillez vous reconnecter',
  'onboarding.error.invalidResponse': 'Réponse serveur invalide',
  'onboarding.error.generationFailed': 'Échec de la génération',
  'onboarding.error.missingSlug': 'Slug manquant dans la réponse',
  'onboarding.additionalDetailsTag': "[Détails supplémentaires de l'utilisateur]",
};

export type TranslationKey = keyof typeof fr;
