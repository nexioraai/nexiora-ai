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
  },
  form: {
    name: 'Your name',
    email: 'Your email',
    message: 'Your message',
    send: 'Send message',
    sending: 'Sending…',
    sent: 'Message sent!',
    error: 'Error',
    title: 'Send us a message',
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
  },
  form: {
    name: 'Votre nom',
    email: 'Votre email',
    message: 'Votre message',
    send: 'Envoyer le message',
    sending: 'Envoi en cours…',
    sent: 'Message envoyé !',
    error: 'Erreur',
    title: 'Envoyez-nous un message',
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
}

const DICTS: Record<string, ThemeDict> = { en, fr, es, ar }

export function getDict(lang?: string): ThemeDict {
  const code = (lang || 'en').slice(0, 2).toLowerCase()
  return DICTS[code] || en // fallback anglais
}
