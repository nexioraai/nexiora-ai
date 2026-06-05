'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [validSession, setValidSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setValidSession(!!data.session);
      setChecking(false);
    });
  }, []);

  const handleReset = async () => {
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => router.push('/dashboard'), 2500);
    }
  };

  const inputStyle = {
    padding: '0.9rem 1rem',
    borderRadius: '10px',
    border: '1px solid rgba(217, 122, 79, 0.15)',
    background: 'rgba(10, 7, 5, 0.6)',
    color: '#f5ede1',
    fontSize: '1rem',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#d97a4f';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(217, 122, 79, 0.15)';
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'rgba(217, 122, 79, 0.15)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #1a1208 0%, #0a0705 60%, #050302 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      fontFamily: 'var(--font-geist-sans), sans-serif',
    }}>
      <div style={{
        background: 'rgba(26, 22, 18, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(217, 122, 79, 0.15)',
        padding: 'clamp(2rem, 5vw, 3rem)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      }}>
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 2.5rem)',
          fontWeight: 800,
          textAlign: 'center',
          color: '#f5ede1',
          letterSpacing: '-0.02em',
          margin: '0 0 0.5rem 0',
        }}>Nexiora</h1>
        <p style={{
          color: '#a89684',
          textAlign: 'center',
          fontSize: '0.95rem',
          margin: '0 0 2rem 0',
        }}>Nouveau mot de passe</p>

        {checking ? (
          <p style={{ color: '#a89684', textAlign: 'center', fontSize: '0.9rem' }}>Vérification du lien...</p>
        ) : !validSession ? (
          <div style={{
            background: 'rgba(239, 106, 74, 0.08)',
            border: '1px solid rgba(239, 106, 74, 0.25)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <p style={{ color: '#ef6a4a', fontWeight: 600, fontSize: '0.95rem', margin: '0 0 1rem 0' }}>
              Lien invalide ou expiré
            </p>
            <p style={{ color: '#a89684', fontSize: '0.875rem', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
              Ce lien de réinitialisation n'est plus valide. Demandez-en un nouveau depuis la page de connexion.
            </p>
            <Link href="/signup" style={{
              color: '#d97a4f',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.95rem',
            }}>Demander un nouveau lien →</Link>
          </div>
        ) : success ? (
          <div style={{
            background: 'rgba(217, 122, 79, 0.08)',
            border: '1px solid rgba(217, 122, 79, 0.25)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <p style={{ color: '#f5ede1', fontWeight: 600, fontSize: '0.95rem', margin: '0 0 0.5rem 0' }}>
              ✓ Mot de passe réinitialisé
            </p>
            <p style={{ color: '#a89684', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
              Redirection vers le tableau de bord...
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nouveau mot de passe (min. 6 caractères)"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                style={{ ...inputStyle, padding: '0.9rem 3rem 0.9rem 1rem' }}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a89684',
                  transition: 'color 0.2s',
                  borderRadius: '6px',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#d97a4f'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#a89684'; }}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            <input
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirmer le mot de passe"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            />

            {error && (
              <p style={{
                color: '#ef6a4a',
                fontSize: '0.875rem',
                margin: 0,
                padding: '0.6rem 0.85rem',
                background: 'rgba(239, 106, 74, 0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(239, 106, 74, 0.2)',
              }}>{error}</p>
            )}

            <button
              onClick={handleReset}
              disabled={loading}
              style={{
                background: loading ? 'rgba(217, 122, 79, 0.5)' : 'linear-gradient(135deg, #d97a4f 0%, #c0612d 100%)',
                color: '#f5ede1',
                border: 'none',
                padding: '0.95rem',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                marginTop: '0.5rem',
                transition: 'transform 0.15s, box-shadow 0.2s',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(217, 122, 79, 0.3)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: '1.75rem', marginBottom: 0 }}>
          <Link href="/" style={{
            color: '#5a4f42',
            fontSize: '0.85rem',
            textDecoration: 'none',
          }}>← Retour à l'accueil</Link>
        </p>
      </div>
    </div>
  );
}
