import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPhotos, getVideo } from '@/lib/pexels';

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: site } = await supabase.from('sites').select('*').eq('slug', slug).single();
  if (!site) return notFound();

  const color = site.primary_color || '#3b82f6';
  const social = site.social_links || {};
  const query = site.type || site.name;
  const [heroVideo, photos] = await Promise.all([
    getVideo(query),
    getPhotos(query, 3),
  ]);

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: color, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href={`/sites/${slug}`} style={{ color: 'white', fontSize: '1.5rem', fontWeight: 'bold', textDecoration: 'none' }}>{site.name}</Link>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <Link href={`/sites/${slug}`} style={{ color: 'white', textDecoration: 'none', borderBottom: '2px solid white' }}>Home</Link>
          <Link href={`/sites/${slug}/about`} style={{ color: 'white', textDecoration: 'none' }}>About Us</Link>
          <Link href={`/sites/${slug}/menu`} style={{ color: 'white', textDecoration: 'none' }}>Menu</Link>
          <Link href={`/sites/${slug}/contact`} style={{ color: 'white', textDecoration: 'none' }}>Contact</Link>
        </div>
      </nav>

      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '4rem 2rem', overflow: 'hidden' }}>
        {heroVideo ? (
          <video autoPlay muted loop playsInline style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}>
            <source src={heroVideo} type="video/mp4" />
          </video>
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `linear-gradient(135deg, ${color}22, #000)`, zIndex: 0 }} />
        )}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1 }} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <span style={{ background: color, color: 'white', padding: '0.25rem 1rem', borderRadius: '999px', fontSize: '0.85rem', marginBottom: '1rem', display: 'inline-block' }}>{site.type}</span>
          <h1 style={{ fontSize: '4rem', fontWeight: '900', color: 'white', margin: '0.5rem 0' }}>{site.name}</h1>
          <p style={{ fontSize: '1.25rem', color: '#ddd', marginBottom: '2rem' }}>{site.slogan}</p>
          <Link href={`/sites/${slug}/contact`} style={{ background: color, color: 'white', padding: '1rem 2.5rem', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '600', textDecoration: 'none' }}>{site.cta}</Link>
        </div>
      </section>

      <section style={{ padding: '5rem 2rem', maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>About Us</h2>
        <p style={{ fontSize: '1.1rem', color: '#555', lineHeight: '1.8', marginBottom: '2rem' }}>{site.about}</p>
        {photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {photos.map((url, i) => (
              <img key={i} src={url} alt={site.type} style={{ width: '100%', height: '220px', objectFit: 'cover', borderRadius: '12px' }} />
            ))}
          </div>
        )}
        <Link href={`/sites/${slug}/about`} style={{ display: 'inline-block', background: color, color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600' }}>Meet Our Team →</Link>
      </section>

      <section style={{ padding: '5rem 2rem', background: '#f9f9f9' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>Our Services</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {(site.services || []).map((service: string, i: number) => (
            <div key={i} style={{ background: 'white', border: `2px solid ${color}`, borderRadius: '12px', padding: '1.5rem', textAlign: 'center', fontWeight: '600' }}>{service}</div>
          ))}
        </div>
      </section>

      <section style={{ padding: '5rem 2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Find Us</h2>
        {site.address && <p style={{ color: '#555', marginBottom: '2rem' }}>📍 {site.address}</p>}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {social.whatsapp && <a href={`https://wa.me/${social.whatsapp}`} style={{ background: '#25D366', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>WhatsApp</a>}
          {social.instagram && <a href={`https://instagram.com/${social.instagram}`} style={{ background: '#E1306C', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>Instagram</a>}
          {social.facebook && <a href={`https://facebook.com/${social.facebook}`} style={{ background: '#1877F2', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>Facebook</a>}
          {social.linkedin && <a href={`https://linkedin.com/in/${social.linkedin}`} style={{ background: '#0A66C2', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>LinkedIn</a>}
          {social.tiktok && <a href={`https://tiktok.com/@${social.tiktok}`} style={{ background: '#000', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>TikTok</a>}
          {social.snapchat && <a href={`https://snapchat.com/add/${social.snapchat}`} style={{ background: '#FFFC00', color: 'black', padding: '0.5rem 1.5rem', borderRadius: '8px', textDecoration: 'none' }}>Snapchat</a>}
        </div>
        <Link href={`/sites/${slug}/contact`} style={{ background: color, color: 'white', padding: '0.9rem 2rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600' }}>Send us a Message →</Link>
      </section>

      <footer style={{ background: color, color: 'white', textAlign: 'center', padding: '2rem' }}>
        <p>© 2026 {site.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}
