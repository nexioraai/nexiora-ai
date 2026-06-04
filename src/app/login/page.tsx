'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ background: 'white', padding: '3rem', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '0.5rem', textAlign: 'center' }}>Nexiora</h1>
        <p style={{ color: '#888', textAlign: 'center', marginBottom: '2rem' }}>Sign in to your account</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', outline: 'none' }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', outline: 'none' }} />
          {error && <p style={{ color: 'red', fontSize: '0.9rem' }}>{error}</p>}
          <button onClick={handleLogin} disabled={loading} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '0.9rem', borderRadius: '8px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#888' }}>
          No account? <Link href="/signup" style={{ color: '#6366f1', fontWeight: '600' }}>Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
