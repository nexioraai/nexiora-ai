import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
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
          <Link href={`/sites/${slug}/about`} style={{ color: 'white', textDecoration: 'none' }}>About Us</Link>
          <Link href={`/sites/${slug}/menu`} style={{ color: 'white', textDecoration: 'none', borderBottom: '2px solid white' }}>Menu</Link>
          <Link href={`/sites/${slug}/contact`} style={{ color: 'white', textDecoration: 'none' }}>Contact</Link>
        </div>
      </nav>

      <section style={{ background: `linear-gradient(135deg, ${color}33, #f9f9f9)`, padding: '4rem 2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: '900', color: color }}>Our Menu</h1>
        <p style={{ color: '#555', fontSize: '1.1rem' }}>Discover our selection</p>
      </section>

      <section style={{ padding: '4rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
        {site.menu && site.menu.map((category: { category: string; items: { name: string; description: string; price: string }[] }, i: number) => (
          <div key={i} style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: color, borderBottom: `3px solid ${color}`, paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>{category.category}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {category.items.map((item, j: number) => (
                <div key={j} style={{ background: 'white', border: `1px solid ${color}22`, borderRadius: '12px', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem', color: '#333' }}>{item.name}</h3>
                    <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>{item.description}</p>
                  </div>
                  <span style={{ background: color, color: 'white', padding: '0.25rem 0.75rem', borderRadius: '999px', fontWeight: 'bold', whiteSpace: 'nowrap', marginLeft: '1rem' }}>${item.price}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <footer style={{ background: color, color: 'white', textAlign: 'center', padding: '2rem' }}>
        <p>© 2026 {site.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}
