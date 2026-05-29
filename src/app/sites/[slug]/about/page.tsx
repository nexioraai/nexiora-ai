import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function AboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: site } = await supabase.from('sites').select('*').eq('slug', slug).single();
  if (!site) return notFound();

  const color = site.primary_color || '#3b82f6';

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <nav style={{ background: color, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href={`/sites/${slug}`} style={{ color: 'white', fontSize: '1.5rem', fontWeight: 'bold', textDecoration: 'none' }}>{site.name}</Link>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <Link href={`/sites/${slug}`} style={{ color: 'white', textDecoration: 'none' }}>Home</Link>
          <Link href={`/sites/${slug}/about`} style={{ color: 'white', textDecoration: 'none', borderBottom: '2px solid white' }}>About Us</Link>
          <Link href={`/sites/${slug}/menu`} style={{ color: 'white', textDecoration: 'none' }}>Menu</Link>
          <Link href={`/sites/${slug}/contact`} style={{ color: 'white', textDecoration: 'none' }}>Contact</Link>
        </div>
      </nav>

      <section style={{ background: `linear-gradient(135deg, ${color}33, #f9f9f9)`, padding: '5rem 2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: '900', color: color }}>About {site.name}</h1>
        <p style={{ fontSize: '1.2rem', color: '#555', maxWidth: '700px', margin: '1rem auto', lineHeight: '1.8' }}>{site.about}</p>
      </section>

      {site.team && site.team.length > 0 && (
        <section style={{ padding: '5rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 'bold', marginBottom: '3rem' }}>Our Team</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
            {site.team.map((member: { name: string; role: string; bio: string }, i: number) => (
              <div key={i} style={{ background: 'white', border: `2px solid ${color}22`, borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: color, margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'white', fontWeight: 'bold' }}>
                  {member.name.charAt(0)}
                </div>
                <h3 style={{ margin: '0.5rem 0', color: color }}>{member.name}</h3>
                <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{member.role}</p>
                <p style={{ color: '#555', fontSize: '0.95rem', lineHeight: '1.6' }}>{member.bio}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer style={{ background: color, color: 'white', textAlign: 'center', padding: '2rem' }}>
        <p>© 2026 {site.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}
