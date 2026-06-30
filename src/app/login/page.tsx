'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      router.push('/');
    }
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin(); };

  const inputStyle: React.CSSProperties = {
    padding: '0.9rem 1rem',
    borderRadius: '12px',
    border: '1px solid rgba(217, 122, 79, 0.2)',
    background: 'rgba(10, 7, 5, 0.6)',
    fontSize: '1rem',
    outline: 'none',
    color: '#f5ede1',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #1a1208 0%, #0a0705 60%, #050302 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-geist-sans), sans-serif',
      padding: '2rem',
      color: '#f5ede1',
    }}>
      <div style={{
        background: 'rgba(26, 22, 18, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: '3rem 2.5rem',
        borderRadius: '20px',
        border: '1px solid rgba(217, 122, 79, 0.15)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        width: '100%',
        maxWidth: '420px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            margin: 0,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #f5ede1 0%, #d97a4f 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Nexiora</h1>
          <p style={{ color: '#a89684', fontSize: '0.95rem', margin: '0.75rem 0 0' }}>
            Connectez-vous à votre compte
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKey}
            placeholder="Email"
            type="email"
            autoComplete="email"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#d97a4f')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(217, 122, 79, 0.2)')}
          />
          <div style={{ position: 'relative' }}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKey}
              placeholder="Mot de passe"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              style={{ ...inputStyle, width: '100%', paddingRight: '3.5rem', boxSizing: 'border-box' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#d97a4f')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(217, 122, 79, 0.2)')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#a89684',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontFamily: 'inherit',
                padding: '0.25rem',
              }}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? 'Masquer' : 'Afficher'}
            </button>
          </div>

          {error && (
            <p style={{
              color: '#ef6a4a',
              fontSize: '0.875rem',
              background: 'rgba(239, 106, 74, 0.08)',
              border: '1px solid rgba(239, 106, 74, 0.2)',
              padding: '0.75rem',
              borderRadius: '8px',
              margin: 0,
            }}>{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            style={{
              background: loading || !email || !password
                ? 'rgba(217, 122, 79, 0.25)'
                : 'linear-gradient(135deg, #d97a4f 0%, #c0612d 100%)',
              color: '#fff',
              border: 'none',
              padding: '1rem',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
              transition: 'transform 0.1s, box-shadow 0.2s',
              boxShadow: loading || !email || !password ? 'none' : '0 4px 20px rgba(217, 122, 79, 0.35)',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '2rem', color: '#a89684', fontSize: '0.9rem' }}>
          Pas encore de compte ?{' '}
          <Link href="/signup" style={{ color: '#d97a4f', fontWeight: 600, textDecoration: 'none' }}>
            Créer un compte
          </Link>
        </p>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8rem' }}>
          <Link href="/" style={{ color: '#5a4f42', textDecoration: 'none' }}>
            ← Retour à l&apos;accueil
          </Link>
        </p>
      </div>
    </div>
  );
}
