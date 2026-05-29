import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function ContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: site } = await supabase.from('sites').select('*').eq('slug', slug).single();
  if (!site) return notFound();

  const color = site.primary_color || '#3b82f6';
  const social = site.social_links || {};

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <nav style={{ background: color, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href={`/sites/${slug}`} style={{ color: 'white', fontSize: '1.5rem', fontWeight: 'bold', textDecoration: 'none' }}>{site.name}</Link>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <Link href={`/sites/${slug}`} style={{ color: 'white', textDecoration: 'none' }}>Home</Link>
          <Link href={`/sites/${slug}/about`} style={{ color: 'white', textDecoration: 'none' }}>About Us</Link>
          <Link href={`/sites/${slug}/menu`} style={{ color: 'white', textDecoration: 'none' }}>Menu</Link>
          <Link href={`/sites/${slug}/contact`} style={{ color: 'white', textDecoration: 'none', borderBottom: '2px solid white' }}>Contact</Link>
        </div>
      </nav>

      <section style={{ background: `linear-gradient(135deg, ${color}33, #f9f9f9)`, padding: '4rem 2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: '900', color: color }}>Contact Us</h1>
        <p style={{ color: '#555', fontSize: '1.1rem' }}>We'd love to hear from you</p>
      </section>

      <section style={{ padding: '4rem 2rem', maxWidth: '800px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: color }}>Send us a message</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input placeholder="Your Name" style={{ padding: '0.75rem', borderRadius: '8px', border: `1px solid ${color}44`, fontSize: '1rem', outline: 'none' }} />
            <input placeholder="Your Email" type="email" style={{ padding: '0.75rem', borderRadius: '8px', border: `1px solid ${color}44`, fontSize: '1rem', outline: 'none' }} />
            <input placeholder="Subject" style={{ padding: '0.75rem', borderRadius: '8px', border: `1px solid ${color}44`, fontSize: '1rem', outline: 'none' }} />
            <textarea placeholder="Your message..." rows={5} style={{ padding: '0.75rem', borderRadius: '8px', border: `1px solid ${color}44`, fontSize: '1rem', outline: 'none', resize: 'vertical' }} />
            <button style={{ background: color, color: 'white', border: 'none', padding: '0.9rem', borderRadius: '8px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}>Send Message</button>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: color }}>Find us</h2>
          {site.address && <p style={{ color: '#555', marginBottom: '1rem' }}>📍 {site.address}</p>}
          {site.hours && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: color, marginBottom: '0.5rem' }}>Hours</h3>
              {Object.entries(site.hours).map(([day, hours]) => (
                <div key={day} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #eee', color: '#555' }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>{day}</span>
                  <span>{hours as string}</span>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ color: color, marginBottom: '1rem' }}>Follow us</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {social.whatsapp && <a href={`https://wa.me/${social.whatsapp}`} style={{ background: '#25D366', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem' }}>WhatsApp</a>}
            {social.instagram && <a href={`https://instagram.com/${social.instagram}`} style={{ background: '#E1306C', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem' }}>Instagram</a>}
            {social.facebook && <a href={`https://facebook.com/${social.facebook}`} style={{ background: '#1877F2', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem' }}>Facebook</a>}
            {social.linkedin && <a href={`https://linkedin.com/in/${social.linkedin}`} style={{ background: '#0A66C2', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem' }}>LinkedIn</a>}
            {social.tiktok && <a href={`https://tiktok.com/@${social.tiktok}`} style={{ background: '#000', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem' }}>TikTok</a>}
            {social.snapchat && <a href={`https://snapchat.com/add/${social.snapchat}`} style={{ background: '#FFFC00', color: 'black', padding: '0.5rem 1rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem' }}>Snapchat</a>}
          </div>
        </div>
      </section>

      <footer style={{ background: color, color: 'white', textAlign: 'center', padding: '2rem' }}>
        <p>© 2026 {site.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}
