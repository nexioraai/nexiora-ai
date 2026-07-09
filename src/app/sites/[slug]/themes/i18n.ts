// src/app/sites/[slug]/themes/i18n.ts

export type ThemeDict = {
  nav: {
    home: string
    about: string
    services: string
    shop: string
    gallery: string
    reviews: string
    contact: string
  }
  hero: {
    viewServices: string
    scroll: string
  }
  sections: {
    aboutKicker: string
    aboutTitle: string
    servicesKicker: string
    servicesTitle: string
    shopKicker: string
    shopTitle: string
    galleryKicker: string
    galleryTitle: string
    testimonialsKicker: string
    testimonialsTitle: string
    contactKicker: string
    contactTitle: string
    contactSubtitle: string
  }
  labels: {
    learnMore: string
    onQuote: string
    request: string
    phone: string
    email: string
    address: string
    followUs: string
    poweredBy: string
    rightsReserved: string
    estimatedDelivery: string
    days: string
  }
  form: {
    title: string
    name: string
    email: string
    message: string
    send: string
    sending: string
    sent: string
    error: string
  }
  bold: {
    navWork: string
    aboutKicker: string
    aboutTitle: string
    servicesKicker: string
    servicesTitle: string
    servicesCount: string
    shopKicker: string
    shopTitle: string
    shopCount: string
    onQuote: string
    order: string
    galleryKicker: string
    galleryTitle: string
    testimonialsKicker: string
    testimonialsTitle: string
    contactKicker: string
    contactTitle1: string
    contactTitle2: string
    contactSubtitle: string
  }
  mono: {
    viewServices: string
    aboutNum: string
    aboutTitle: string
    servicesNum: string
    servicesTitle: string
    shopNum: string
    shopTitle: string
    galleryNum: string
    galleryTitle: string
    testimonialsNum: string
    testimonialsTitle: string
    contactNum: string
    contactTitle: string
    contactSubtitle: string
  }
}

const en: ThemeDict = {
  nav: {
    home: 'Home',
    about: 'About',
    services: 'Services',
    shop: 'Shop',
    gallery: 'Gallery',
    reviews: 'Reviews',
    contact: 'Contact',
  },
  hero: {
    viewServices: 'View our services',
    scroll: 'Scroll',
  },
  sections: {
    aboutKicker: 'About us',
    aboutTitle: 'Our story',
    servicesKicker: 'What we offer',
    servicesTitle: 'Our services',
    shopKicker: 'Our catalogue',
    shopTitle: 'Shop',
    galleryKicker: 'Our work',
    galleryTitle: 'Gallery',
    testimonialsKicker: 'What clients say',
    testimonialsTitle: 'They trust us',
    contactKicker: 'Get in touch',
    contactTitle: "Let's talk about your project",
    contactSubtitle: 'A question, a quote? We reply within 24h.',
  },
  labels: {
    learnMore: 'Learn more',
    onQuote: 'On request',
    request: 'Inquire',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    followUs: 'Follow us',
    poweredBy: 'Powered by',
    rightsReserved: 'All rights reserved.',
    estimatedDelivery: 'Estimated delivery:',
    days: 'days',
  },
  form: {
    name: 'Your name',
    email: 'Your email',
    message: 'Your message',
    send: 'Send message',
    sending: 'Sending…',
    sent: 'Message sent! We will get back to you shortly.',
    error: 'Error',
    title: 'Send us a message',
  },
  bold: {
    navWork: 'Work',
    aboutKicker: 'About us',
    aboutTitle: 'Our story.',
    servicesKicker: 'What we do',
    servicesTitle: 'SERVICES.',
    servicesCount: 'services offered',
    shopKicker: 'Catalogue',
    shopTitle: 'SHOP.',
    shopCount: 'products available',
    onQuote: 'On request',
    order: 'Order',
    galleryKicker: 'Our work',
    galleryTitle: 'GALLERY.',
    testimonialsKicker: 'The verdict',
    testimonialsTitle: 'THEY LOVE IT.',
    contactKicker: "Let's talk",
    contactTitle1: 'GET IN',
    contactTitle2: 'TOUCH.',
    contactSubtitle: 'A question, a quote, an idea? We reply within 24h.',
  },
  mono: {
    viewServices: 'View services',
    aboutNum: 'About',
    aboutTitle: 'Our story',
    servicesNum: 'Services',
    servicesTitle: 'What we do',
    shopNum: 'Shop',
    shopTitle: 'Products',
    galleryNum: 'Work',
    galleryTitle: 'Gallery',
    testimonialsNum: 'Reviews',
    testimonialsTitle: 'Clients',
    contactNum: 'Contact',
    contactTitle: "Let's talk",
    contactSubtitle: 'A question? We respond within 24h.',
  },
}

const fr: ThemeDict = {
  nav: {
    home: 'Accueil',
    about: 'À propos',
    services: 'Services',
    shop: 'Boutique',
    gallery: 'Galerie',
    reviews: 'Avis',
    contact: 'Contact',
  },
  hero: {
    viewServices: 'Voir nos services',
    scroll: 'Défiler',
  },
  sections: {
    aboutKicker: 'À propos',
    aboutTitle: 'Notre histoire',
    servicesKicker: 'Ce que nous offrons',
    servicesTitle: 'Nos services',
    shopKicker: 'Notre catalogue',
    shopTitle: 'Boutique',
    galleryKicker: 'Nos réalisations',
    galleryTitle: 'Galerie',
    testimonialsKicker: 'Ce qu’ils disent',
    testimonialsTitle: 'Ils nous font confiance',
    contactKicker: 'Contactez-nous',
    contactTitle: 'Parlons de votre projet',
    contactSubtitle: 'Une question, un devis ? Nous répondons sous 24h.',
  },
  labels: {
    learnMore: 'En savoir plus',
    onQuote: 'Sur devis',
    request: 'Demander',
    phone: 'Téléphone',
    email: 'Email',
    address: 'Adresse',
    followUs: 'Suivez-nous',
    poweredBy: 'Propulsé par',
    rightsReserved: 'Tous droits réservés.',
    estimatedDelivery: 'Livraison estimée :',
    days: 'jours',
  },
  form: {
    name: 'Votre nom',
    email: 'Votre email',
    message: 'Votre message',
    send: 'Envoyer le message',
    sending: 'Envoi en cours…',
    sent: 'Message envoyé ! Nous vous répondrons dans les plus brefs délais.',
    error: 'Erreur',
    title: 'Envoyez-nous un message',
  },
  bold: {
    navWork: 'Réal.',
    aboutKicker: 'À propos',
    aboutTitle: 'Notre histoire.',
    servicesKicker: "Ce qu'on fait",
    servicesTitle: 'SERVICES.',
    servicesCount: 'services proposés',
    shopKicker: 'Catalogue',
    shopTitle: 'BOUTIQUE.',
    shopCount: 'produits disponibles',
    onQuote: 'Sur devis',
    order: 'Commander',
    galleryKicker: 'Nos réalisations',
    galleryTitle: 'GALERIE.',
    testimonialsKicker: 'Le verdict',
    testimonialsTitle: 'ILS ADORENT.',
    contactKicker: 'Parlons-en',
    contactTitle1: 'PARLONS',
    contactTitle2: 'PROJET.',
    contactSubtitle: 'Une question, un devis, une idée ? On répond sous 24h.',
  },
  mono: {
    viewServices: 'Voir les services',
    aboutNum: 'À propos',
    aboutTitle: 'Notre histoire',
    servicesNum: 'Services',
    servicesTitle: "Ce qu'on fait",
    shopNum: 'Boutique',
    shopTitle: 'Produits',
    galleryNum: 'Réalisations',
    galleryTitle: 'Galerie',
    testimonialsNum: 'Avis',
    testimonialsTitle: 'Clients',
    contactNum: 'Contact',
    contactTitle: 'Parlons-en',
    contactSubtitle: 'Une question ? Nous répondons sous 24h.',
  },
}

const es: ThemeDict = {
  nav: {
    home: 'Inicio',
    about: 'Nosotros',
    services: 'Servicios',
    shop: 'Tienda',
    gallery: 'Galería',
    reviews: 'Opiniones',
    contact: 'Contacto',
  },
  hero: {
    viewServices: 'Ver nuestros servicios',
    scroll: 'Desplazar',
  },
  sections: {
    aboutKicker: 'Sobre nosotros',
    aboutTitle: 'Nuestra historia',
    servicesKicker: 'Lo que ofrecemos',
    servicesTitle: 'Nuestros servicios',
    shopKicker: 'Nuestro catálogo',
    shopTitle: 'Tienda',
    galleryKicker: 'Nuestro trabajo',
    galleryTitle: 'Galería',
    testimonialsKicker: 'Lo que dicen los clientes',
    testimonialsTitle: 'Confían en nosotros',
    contactKicker: 'Contáctanos',
    contactTitle: 'Hablemos de tu proyecto',
    contactSubtitle: '¿Una pregunta, un presupuesto? Respondemos en 24h.',
  },
  labels: {
    learnMore: 'Saber más',
    onQuote: 'A consultar',
    request: 'Solicitar',
    phone: 'Teléfono',
    email: 'Correo',
    address: 'Dirección',
    followUs: 'Síguenos',
    poweredBy: 'Desarrollado por',
    rightsReserved: 'Todos los derechos reservados.',
    estimatedDelivery: 'Entrega estimada:',
    days: 'días',
  },
  form: {
    name: 'Tu nombre',
    email: 'Tu correo',
    message: 'Tu mensaje',
    send: 'Enviar mensaje',
    sending: 'Enviando…',
    sent: '¡Mensaje enviado!',
    error: 'Error',
    title: 'Envíanos un mensaje',
  },
  bold: {
    navWork: 'Trabajo',
    aboutKicker: 'Sobre nosotros',
    aboutTitle: 'Nuestra historia.',
    servicesKicker: 'Lo que hacemos',
    servicesTitle: 'SERVICIOS.',
    servicesCount: 'servicios ofrecidos',
    shopKicker: 'Catálogo',
    shopTitle: 'TIENDA.',
    shopCount: 'productos disponibles',
    onQuote: 'A consultar',
    order: 'Pedir',
    galleryKicker: 'Nuestro trabajo',
    galleryTitle: 'GALERÍA.',
    testimonialsKicker: 'El veredicto',
    testimonialsTitle: 'LES ENCANTA.',
    contactKicker: 'Hablemos',
    contactTitle1: 'EN',
    contactTitle2: 'CONTACTO.',
    contactSubtitle: '¿Una pregunta, un presupuesto, una idea? Respondemos en 24h.',
  },
  mono: {
    viewServices: 'Ver servicios',
    aboutNum: 'Nosotros',
    aboutTitle: 'Nuestra historia',
    servicesNum: 'Servicios',
    servicesTitle: 'Lo que hacemos',
    shopNum: 'Tienda',
    shopTitle: 'Productos',
    galleryNum: 'Trabajo',
    galleryTitle: 'Galería',
    testimonialsNum: 'Opiniones',
    testimonialsTitle: 'Clientes',
    contactNum: 'Contacto',
    contactTitle: 'Hablemos',
    contactSubtitle: '¿Una pregunta? Respondemos en 24h.',
  },
}

const ar: ThemeDict = {
  nav: {
    home: 'الرئيسية',
    about: 'من نحن',
    services: 'الخدمات',
    shop: 'المتجر',
    gallery: 'المعرض',
    reviews: 'الآراء',
    contact: 'اتصل بنا',
  },
  hero: {
    viewServices: 'شاهد خدماتنا',
    scroll: 'مرّر',
  },
  sections: {
    aboutKicker: 'من نحن',
    aboutTitle: 'قصتنا',
    servicesKicker: 'ما نقدمه',
    servicesTitle: 'خدماتنا',
    shopKicker: 'كتالوجنا',
    shopTitle: 'المتجر',
    galleryKicker: 'أعمالنا',
    galleryTitle: 'المعرض',
    testimonialsKicker: 'ماذا يقول العملاء',
    testimonialsTitle: 'يثقون بنا',
    contactKicker: 'تواصل معنا',
    contactTitle: 'لنتحدث عن مشروعك',
    contactSubtitle: 'سؤال أو طلب عرض سعر؟ نرد خلال 24 ساعة.',
  },
  labels: {
    learnMore: 'اعرف المزيد',
    onQuote: 'حسب الطلب',
    request: 'استفسر',
    phone: 'الهاتف',
    email: 'البريد الإلكتروني',
    address: 'العنوان',
    followUs: 'تابعنا',
    poweredBy: 'مشغّل بواسطة',
    rightsReserved: 'جميع الحقوق محفوظة.',
    estimatedDelivery: 'التسليم المقدّر:',
    days: 'أيام',
  },
  form: {
    name: 'اسمك',
    email: 'بريدك الإلكتروني',
    message: 'رسالتك',
    send: 'إرسال الرسالة',
    sending: 'جارٍ الإرسال…',
    sent: 'تم إرسال الرسالة!',
    error: 'خطأ',
    title: 'أرسل لنا رسالة',
  },
  bold: {
    navWork: 'أعمالنا',
    aboutKicker: 'من نحن',
    aboutTitle: 'قصتنا.',
    servicesKicker: 'ما نقوم به',
    servicesTitle: 'خدماتنا.',
    servicesCount: 'خدمة متاحة',
    shopKicker: 'الكتالوج',
    shopTitle: 'المتجر.',
    shopCount: 'منتج متاح',
    onQuote: 'حسب الطلب',
    order: 'اطلب',
    galleryKicker: 'أعمالنا',
    galleryTitle: 'المعرض.',
    testimonialsKicker: 'الحكم',
    testimonialsTitle: 'يحبونه.',
    contactKicker: 'لنتحدث',
    contactTitle1: 'تواصل',
    contactTitle2: 'معنا.',
    contactSubtitle: 'سؤال، عرض سعر، فكرة؟ نرد خلال 24 ساعة.',
  },
  mono: {
    viewServices: 'شاهد الخدمات',
    aboutNum: 'من نحن',
    aboutTitle: 'قصتنا',
    servicesNum: 'الخدمات',
    servicesTitle: 'ما نقوم به',
    shopNum: 'المتجر',
    shopTitle: 'المنتجات',
    galleryNum: 'أعمالنا',
    galleryTitle: 'المعرض',
    testimonialsNum: 'الآراء',
    testimonialsTitle: 'العملاء',
    contactNum: 'اتصل بنا',
    contactTitle: 'لنتحدث',
    contactSubtitle: 'سؤال؟ نرد خلال 24 ساعة.',
  },
}

const DICTS: Record<string, ThemeDict> = { en, fr, es, ar }

export function getDict(lang?: string): ThemeDict {
  const code = (lang || 'en').slice(0, 2).toLowerCase()
  return DICTS[code] || en // fallback anglais
}
