import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: site } = await supabase.from('sites').select('*').eq('slug', slug).single();
  if (!site) return notFound();

  const color = site.primary_color || '#3b82f6';
  const social = site.social_links || {};

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <nav style={{ background: color, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{site.name}</h1>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {(site.pages || ['Home', 'About', 'Services', 'Contact']).map((page: string) => (
            <a key={page} href={`#${page.toLowerCase().replace(' ', '-')}`} style={{ color: 'white', textDecoration: 'none', fontWeight: '500' }}>{page}</a>
          ))}
        </div>
      </nav>
      <section id="home" style={{ background: `linear-gradient(135deg, ${color}22, #000)`, minHeight: '90vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '4rem 2rem' }}>
        <span style={{ background: color, color: 'white', padding: '0.25rem 1rem', borderRadius: '999px', fontSize: '0.85rem', marginBottom: '1rem' }}>{site.type}</span>
        <h1 style={{ fontSize: '4rem', fontWeight: '900', color: 'white', margin: '0.5rem 0' }}>{site.name}</h1>
        <p style={{ fontSize: '1.25rem', color: '#aaa', marginBottom: '2rem' }}>{site.slogan}</p>
        <button style={{ background: color, color: 'white', border: 'none', padding: '1rem 2.5rem', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '600', cursor: 'pointer' }}>{site.cta}</button>
      </section>
      <section id="about" style={{ padding: '5rem 2rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>About Us</h2>
        <p style={{ fontSize: '1.1rem', color: '#555', lineHeight: '1.8' }}>{site.about}</p>
      </section>
      <section id="services" style={{ padding: '5rem 2rem', background: '#f9f9f9' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>Our Services</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {(site.services || []).map((service: string, i: number) => (
            <div key={i} style={{ background: 'white', border: `2px solid ${color}`, borderRadius: '12px', padding: '1.5rem', textAlign: 'center', fontWeight: '600' }}>{service}</div>
          ))}
        </div>
      </section>
      <section id="contact" style={{ padding: '5rem 2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>Contact Us</h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {social.whatsapp && <a href={`https://wa.me/${social.whatsapp}`} style={{ background: '#25D366', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>WhatsApp</a>}
          {social.instagram && <a href={`https://instagram.com/${social.instagram}`} style={{ background: '#E1306C', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>Instagram</a>}
          {social.facebook && <a href={`https://facebook.com/${social.facebook}`} style={{ background: '#1877F2', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>Facebook</a>}
          {social.linkedin && <a href={`https://linkedin.com/in/${social.linkedin}`} style={{ background: '#0A66C2', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>LinkedIn</a>}
          {social.tiktok && <a href={`https://tiktok.com/@${social.tiktok}`} style={{ background: '#000', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>TikTok</a>}
          {social.snapchat && <a href={`https://snapchat.com/add/${social.snapchat}`} style={{ background: '#FFFC00', color: 'black', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>Snapchat</a>}
        </div>
      </section>
      <footer style={{ background: color, color: 'white', textAlign: 'center', padding: '2rem' }}>
        <p>© 2026 {site.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}
