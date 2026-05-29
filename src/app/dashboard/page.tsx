'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardPage() {
 const router = useRouter();
 const [user, setUser] = useState<any>(null);
 const [sites, setSites] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
   supabase.auth.getUser().then(({ data }) => {
     if (!data.user) {
       router.push('/login');
     } else {
       setUser(data.user);
       supabase.from('sites').select('*').eq('owner_email', data.user.email).order('created_at', { ascending: false }).then(({ data: sitesData }) => {
         setSites(sitesData || []);
         setLoading(false);
       });
     }
   });
 }, []);

 const handleLogout = async () => {
   await supabase.auth.signOut();
   router.push('/login');
 };

 const handleDelete = async (slug: string) => {
   if (!confirm('Delete this site?')) return;
   await supabase.from('sites').delete().eq('slug', slug);
   setSites(sites.filter(s => s.slug !== slug));
 };

 if (loading) return <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif' }}>Loading...</div>;

 return (
   <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', background: '#f9f9f9' }}>
     <nav style={{ background: '#6366f1', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <Link href="/" style={{ color: 'white', fontSize: '1.5rem', fontWeight: '900', textDecoration: 'none' }}>Nexiora</Link>
       <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
         <span style={{ color: 'white', fontSize: '0.9rem' }}>{user?.email}</span>
         <button onClick={handleLogout} style={{ background: 'white', color: '#6366f1', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Logout</button>
       </div>
     </nav>

     <div style={{ maxWidth: '1000px', margin: '3rem auto', padding: '0 2rem' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
         <h1 style={{ fontSize: '2rem', fontWeight: '900' }}>My Sites</h1>
         <Link href="/" style={{ background: '#6366f1', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600' }}>+ New Site</Link>
       </div>

       {sites.length === 0 ? (
         <div style={{ textAlign: 'center', padding: '4rem', background: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
           <p style={{ fontSize: '1.2rem', color: '#888', marginBottom: '1.5rem' }}>No sites yet. Generate your first one!</p>
           <Link href="/" style={{ background: '#6366f1', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600' }}>Generate a Site</Link>
         </div>
       ) : (
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
           {sites.map((site) => (
             <div key={site.slug} style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
               <div style={{ background: site.primary_color || '#6366f1', padding: '2rem', textAlign: 'center' }}>
                 <h2 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: '900' }}>{site.name}</h2>
                 <p style={{ color: 'rgba(255,255,255,0.8)', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{site.type}</p>
               </div>
               <div style={{ padding: '1.5rem' }}>
                 <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>{site.slogan}</p>
                 <div style={{ display: 'flex', gap: '0.75rem' }}>
                   <Link href={`/sites/${site.slug}`} style={{ flex: 1, background: site.primary_color || '#6366f1', color: 'white', padding: '0.6rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', textAlign: 'center', fontSize: '0.9rem' }}>View Site</Link>
                   <button onClick={() => handleDelete(site.slug)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem' }}>Delete</button>
                 </div>
               </div>
             </div>
           ))}
         </div>
       )}
     </div>
   </div>
 );
}
