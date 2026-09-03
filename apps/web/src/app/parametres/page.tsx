'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { LogOut, Pencil, Check, X, Eye, EyeOff, CreditCard, Trash2 } from 'lucide-react';
import { useTranslation } from '@/lib/translations';

export default function ParametresPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Edit first name
  const [editingName, setEditingName] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Change password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscription
  const [sites, setSites] = useState<any[]>([]);
  const [portalLoading, setPortalLoading] = useState<string | null>(null);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      setEmail(data.user.email || '');
      const meta: any = data.user.user_metadata || {};
      const raw = meta.first_name || (meta.full_name || '').split(' ')[0] || '';
      setFirstName(raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '');

      // Fetch user's sites with subscription info
      const { data: userSites } = await supabase
        .from('sites')
        .select('slug, name, subscription_status, stripe_customer_id')
        .eq('owner_email', data.user.email);
      if (userSites) setSites(userSites);

      setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // --- Edit first name ---
  const startEditName = () => {
    setNewFirstName(firstName);
    setEditingName(true);
  };
  const cancelEditName = () => {
    setEditingName(false);
    setNewFirstName('');
  };
  const saveName = async () => {
    if (!newFirstName.trim()) return;
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { first_name: newFirstName.trim() } });
    if (!error) {
      setFirstName(newFirstName.trim().charAt(0).toUpperCase() + newFirstName.trim().slice(1));
      setEditingName(false);
    }
    setSavingName(false);
  };

  // --- Change password ---
  const savePassword = async () => {
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: t('settings.passwordTooShort') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: t('settings.passwordMismatch') });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg({ type: 'error', text: error.message });
    } else {
      setPasswordMsg({ type: 'success', text: t('settings.passwordUpdated') });
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    }
    setSavingPassword(false);
  };

  // --- Stripe portal ---
  const openPortal = async (siteSlug: string) => {
    setPortalLoading(siteSlug);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteSlug }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
    }
    setPortalLoading(null);
  };

  // --- Delete account ---
  const handleDelete = async () => {
    if (deleteInput !== 'SUPPRIMER') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      // Ne jamais déconnecter/rediriger sur la seule foi de l'appel réseau :
      // vérifier explicitement le succès renvoyé par l'API (audit ownership/RLS
      // -- l'ancien code ignorait la réponse et redirigeait dans tous les cas).
      if (!res.ok || !data.success) {
        if (data.blockedSites?.length) {
          const list = data.blockedSites
            .map((b: any) => `${b.slug} (${b.blockingStatuses.join(', ')})`)
            .join(' · ');
          setDeleteError(`${t('settings.deleteBlocked')} ${list}`);
        } else {
          setDeleteError(data.error || t('settings.deleteFailed'));
        }
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      router.push('/login');
    } catch (e) {
      console.error(e);
      setDeleteError(t('settings.deleteFailed'));
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen nexiora-bg flex items-center justify-center">
      <div className="text-white/40 text-lg">{t('settings.loading')}</div>
    </div>
  );

  const statusLabel = (status: string | null) => {
    if (status === 'active' || status === 'complete') return { text: t('settings.planActive'), color: 'text-emerald-400' };
    if (status === 'canceled') return { text: t('settings.planCanceled'), color: 'text-red-400' };
    return { text: t('settings.planFree'), color: 'text-white/40' };
  };

  return (
    <div className="min-h-screen nexiora-bg text-white flex">
      <Sidebar />
      <div className="flex-1 min-w-0 max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.2em] font-medium mb-2" style={{ color: '#FA5D1E' }}>{t('settings.eyebrow')}</div>
          <h1 className="text-4xl font-black tracking-tight">{t('settings.title')}</h1>
        </div>
        <div className="space-y-6">

          {/* Compte */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
            <h2 className="text-sm font-semibold text-white/70 mb-5 uppercase tracking-wider">{t('settings.account')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wider font-semibold mb-1.5">{t('settings.firstName')}</label>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      className="bg-white/[0.06] border border-white/15 rounded-xl px-4 py-2.5 text-white text-lg outline-none focus:border-white/30 transition-colors w-full max-w-xs"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    />
                    <button onClick={saveName} disabled={savingName}
                      className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={cancelEditName}
                      className="p-2 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-lg text-white">{firstName || <span className="text-white/30">{t('settings.notSet')}</span>}</p>
                    <button onClick={startEditName}
                      className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-white/10">
                <label className="block text-xs text-white/40 uppercase tracking-wider font-semibold mb-1.5">{t('settings.email')}</label>
                <p className="text-lg text-white">{email}</p>
              </div>
            </div>
          </div>

          {/* Abonnement */}
          {sites.length > 0 && (
            <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
              <h2 className="text-sm font-semibold text-white/70 mb-5 uppercase tracking-wider">{t('settings.subscription')}</h2>
              <div className="space-y-4">
                {sites.map((site) => {
                  const st = statusLabel(site.subscription_status);
                  return (
                    <div key={site.slug} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{site.name || site.slug}</p>
                        <p className={`text-sm ${st.color}`}>{st.text}</p>
                      </div>
                      {site.stripe_customer_id && (
                        <button
                          onClick={() => openPortal(site.slug)}
                          disabled={portalLoading === site.slug}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-white/10 text-white/70 hover:text-white hover:border-white/25 transition-all whitespace-nowrap disabled:opacity-50"
                        >
                          <CreditCard className="w-4 h-4" />
                          {portalLoading === site.slug ? '...' : t('settings.manageBilling')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mot de passe */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
            <h2 className="text-sm font-semibold text-white/70 mb-5 uppercase tracking-wider">{t('settings.password')}</h2>
            {!showPasswordForm ? (
              <button onClick={() => { setShowPasswordForm(true); setPasswordMsg(null); }}
                className="text-sm font-medium text-white/60 hover:text-white transition-colors">
                {t('settings.changePassword')}
              </button>
            ) : (
              <div className="space-y-4 max-w-sm">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('settings.newPassword')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-white/30 transition-colors pr-10"
                  />
                  <button onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('settings.confirmPassword')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-white/30 transition-colors"
                />
                {passwordMsg && (
                  <p className={`text-sm ${passwordMsg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {passwordMsg.text}
                  </p>
                )}
                <div className="flex gap-3">
                  <button onClick={savePassword} disabled={savingPassword}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 text-white hover:bg-white/15 transition-colors disabled:opacity-50">
                    {savingPassword ? '...' : t('settings.save')}
                  </button>
                  <button onClick={() => { setShowPasswordForm(false); setPasswordMsg(null); setNewPassword(''); setConfirmPassword(''); }}
                    className="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors">
                    {t('settings.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Langue */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
            <h2 className="text-sm font-semibold text-white/70 mb-5 uppercase tracking-wider">{t('settings.language')}</h2>
            <LanguageSwitcher />
          </div>

          {/* Déconnexion */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
            <button onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold border border-red-500/20 text-red-400/80 hover:text-red-400 hover:border-red-500/40 transition-all">
              <LogOut className="w-[18px] h-[18px]" />
              {t('settings.logout')}
            </button>
          </div>

          {/* Supprimer le compte */}
          <div className="bg-white/[0.03] border border-red-500/10 rounded-3xl p-6 md:p-8">
            <h2 className="text-sm font-semibold text-red-400/70 mb-3 uppercase tracking-wider">{t('settings.dangerZone')}</h2>
            <p className="text-sm text-white/40 mb-4">{t('settings.deleteWarning')}</p>
            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 transition-all">
                <Trash2 className="w-4 h-4" />
                {t('settings.deleteAccount')}
              </button>
            ) : (
              <div className="space-y-3 max-w-sm">
                <p className="text-sm text-red-400/80">{t('settings.deleteConfirmLabel')}</p>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="SUPPRIMER"
                  className="w-full bg-white/[0.06] border border-red-500/20 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-red-500/40 transition-colors"
                />
                <div className="flex gap-3">
                  <button onClick={handleDelete} disabled={deleteInput !== 'SUPPRIMER' || deleting}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    {deleting ? '...' : t('settings.confirmDelete')}
                  </button>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError(null); }}
                    className="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors">
                    {t('settings.cancel')}
                  </button>
                </div>
                {deleteError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                    {deleteError}
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
