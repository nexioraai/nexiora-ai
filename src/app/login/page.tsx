'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';

type Mode = 'signup' | 'login' | 'forgot';

export default function SignupPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    setInfo('');

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName.trim() } } });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          setMode('login');
          setPassword('');
          setInfo(t('login.emailExists'));
        } else {
          setError(error.message);
        }
        setLoading(false);
      } else {
        setSuccess(true);
        setLoading(false);
      }
    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('welcomed')
            .eq('id', user.id)
            .single();
          if (profile && !profile.welcomed) {
            fetch('/api/welcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: user.email }),
            }).catch(() => {});
            await supabase.from('profiles').update({ welcomed: true }).eq('id', user.id);
          }
        }
        router.push('/');
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://woorri.com/reset-password',
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        setForgotSuccess(true);
        setLoading(false);
      }
    }
  };

  const switchTo = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setInfo('');
    setPassword('');
    setForgotSuccess(false);
  };

  const isSignup = mode === 'signup';
  const isLogin = mode === 'login';
  const isForgot = mode === 'forgot';

  const titleText = isSignup ? t('login.titleSignup')
    : isLogin ? t('login.titleLogin')
    : t('login.titleReset');

  const submitText = loading
    ? (isSignup ? t('login.btnSignupLoading') : isLogin ? t('login.btnLoginLoading') : t('login.btnResetLoading'))
    : (isSignup ? t('login.btnSignup') : isLogin ? t('login.btnLogin') : t('login.btnReset'));

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
        }}>Woorri</h1>
        <p style={{
          color: '#a89684',
          textAlign: 'center',
          fontSize: '0.95rem',
          margin: '0 0 2rem 0',
        }}>{titleText}</p>

        {success ? (
          <div style={{
            background: 'rgba(217, 122, 79, 0.08)',
            border: '1px solid rgba(217, 122, 79, 0.25)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <p style={{ color: '#f5ede1', fontWeight: 600, fontSize: '0.95rem', margin: '0 0 1rem 0' }}>
              {t('login.checkEmailSignup')}
            </p>
            <button type="button" onClick={() => { setSuccess(false); switchTo('login'); }} style={{
              color: '#d97a4f',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
              fontSize: '0.95rem',
            }}>{t('login.goToLogin')}</button>
          </div>
        ) : forgotSuccess ? (
          <div style={{
            background: 'rgba(217, 122, 79, 0.08)',
            border: '1px solid rgba(217, 122, 79, 0.25)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <p style={{ color: '#f5ede1', fontWeight: 600, fontSize: '0.95rem', margin: '0 0 0.5rem 0' }}>
              {t('login.emailSent')}
            </p>
            <p style={{ color: '#a89684', fontSize: '0.875rem', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
              {t('login.checkEmailReset')}
            </p>
            <button type="button" onClick={() => switchTo('login')} style={{
              color: '#d97a4f',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
              fontSize: '0.95rem',
            }}>{t('login.backToLogin')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {info && (
              <p style={{
                color: '#d97a4f',
                fontSize: '0.875rem',
                margin: 0,
                padding: '0.75rem 0.85rem',
                background: 'rgba(217, 122, 79, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(217, 122, 79, 0.25)',
                lineHeight: 1.5,
              }}>{info}</p>
            )}

            {isSignup && (
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder={t('login.firstName')}
                type="text"
                autoComplete="given-name"
                style={{
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
                  boxSizing: 'border-box',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#d97a4f';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(217, 122, 79, 0.15)';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(217, 122, 79, 0.15)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            )}
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('login.email')}
              type="email"
              autoComplete="email"
              style={{
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
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#d97a4f';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(217, 122, 79, 0.15)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(217, 122, 79, 0.15)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />

            {!isForgot && (
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={isSignup ? t('login.passwordSignup') : t('login.password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  style={{
                    padding: '0.9rem 3rem 0.9rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(217, 122, 79, 0.15)',
                    background: 'rgba(10, 7, 5, 0.6)',
                    color: '#f5ede1',
                    fontSize: '1rem',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#d97a4f';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(217, 122, 79, 0.15)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'rgba(217, 122, 79, 0.15)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
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
            )}

            {isLogin && (
              <button
                type="button"
                onClick={() => switchTo('forgot')}
                style={{
                  alignSelf: 'flex-end',
                  color: '#a89684',
                  fontSize: '0.85rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                  marginTop: '-0.25rem',
                  textDecoration: 'underline',
                  textDecorationColor: 'rgba(168, 150, 132, 0.3)',
                  textUnderlineOffset: '3px',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#d97a4f'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#a89684'; }}
              >{t('login.forgotPassword')}</button>
            )}

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
              onClick={handleSubmit}
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
            >{submitText}</button>
          </div>
        )}

        {!success && !forgotSuccess && (
          <p style={{
            textAlign: 'center',
            marginTop: '1.75rem',
            marginBottom: '0.5rem',
            color: '#a89684',
            fontSize: '0.9rem',
          }}>
            {isForgot ? (
              <button type="button" onClick={() => switchTo('login')} style={{
                color: '#d97a4f',
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'inherit',
                fontSize: '0.9rem',
              }}>{t('login.backToLogin')}</button>
            ) : (
              <>
                {isSignup ? t('login.alreadyAccount') : t('login.noAccount')}
                <button type="button" onClick={() => switchTo(isSignup ? 'login' : 'signup')} style={{
                  color: '#d97a4f',
                  fontWeight: 600,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                }}>{isSignup ? t('login.linkLogin') : t('login.linkSignup')}</button>
              </>
            )}
          </p>
        )}

        <p style={{ textAlign: 'center', marginTop: '0.75rem', marginBottom: 0 }}>
          <Link href="/" style={{
            color: '#5a4f42',
            fontSize: '0.85rem',
            textDecoration: 'none',
          }}>{t('login.backHome')}</Link>
        </p>
        <p style={{ textAlign: 'center', marginTop: '1rem', marginBottom: 0, display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ color: '#5a4f42', fontSize: '0.75rem', textDecoration: 'none' }}>{t('footer.privacy')}</Link>
          <Link href="/terms" style={{ color: '#5a4f42', fontSize: '0.75rem', textDecoration: 'none' }}>{t('footer.terms')}</Link>
          <Link href="/cookies" style={{ color: '#5a4f42', fontSize: '0.75rem', textDecoration: 'none' }}>{t('footer.cookies')}</Link>
        </p>
      </div>
    </div>
  );
}
