const BASES: Record<string, string> = {
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  tiktok: 'https://www.tiktok.com/@',
  snapchat: 'https://www.snapchat.com/add/',
  twitter: 'https://x.com/',
  x: 'https://x.com/',
  youtube: 'https://www.youtube.com/@',
  linkedin: 'https://www.linkedin.com/in/',
  pinterest: 'https://www.pinterest.com/',
};

export function socialUrl(platform: string, value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const key = platform.toLowerCase();

  if (key === 'whatsapp') {
    const digits = raw.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }

  if (/^https?:\/\//i.test(raw)) return raw;

  if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(raw)) return `https://${raw}`;

  const base = BASES[key];
  if (!base) return null;

  const handle = raw.replace(/^@+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!handle) return null;

  return `${base}${handle}`;
}
