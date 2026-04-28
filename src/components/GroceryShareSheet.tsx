'use client';

// Share sheet for the Groceries tab.
//
// Layout (top to bottom):
//   1. Hero "Share with…" input — type a name to filter recent
//      contacts, or type an email to invite anyone. Tap a contact
//      avatar for a one-tap invite. Submit-as-email → server figures
//      out whether to send an in-app pending invite (existing user,
//      no email round-trip) or a Supabase magic-link email (new user).
//   2. Three icon-led buttons: WhatsApp / Messages / More (native
//      share). Backed by an auto-generated invite token.
//   3. Compact link row + Reset link.
//   4. Members list (display name only — no email leak).

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGroceryStore } from '@/stores/groceryStore';
import { useAuthStore } from '@/stores/authStore';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface Props {
  open: boolean;
  onClose: () => void;
}

type SuccessState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; mode: 'in_app' | 'email' | 'already_member'; displayName: string | null }
  | { kind: 'error'; message: string };

function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function looksLikeEmailIntent(s: string): boolean {
  // Once the user types a "@" we treat the input as an email-in-progress.
  return s.includes('@');
}

// Small deterministic palette for initial circles based on user id —
// stays the same across renders so an avatar feels stable.
const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
  'bg-orange-500',
  'bg-teal-500',
];
function colorForUserId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function GroceryShareSheet({ open, onClose }: Props) {
  const listId = useGroceryStore((s) => s.listId);
  const ownerId = useGroceryStore((s) => s.ownerId);
  const members = useGroceryStore((s) => s.members);
  const invites = useGroceryStore((s) => s.invites);
  const recentContacts = useGroceryStore((s) => s.recentContacts);
  const fetchRecentContacts = useGroceryStore((s) => s.fetchRecentContacts);
  const inviteByEmail = useGroceryStore((s) => s.inviteByEmail);
  const inviteRecentContact = useGroceryStore((s) => s.inviteRecentContact);
  const createInvite = useGroceryStore((s) => s.createInvite);
  const revokeInvite = useGroceryStore((s) => s.revokeInvite);
  const leaveList = useGroceryStore((s) => s.leaveList);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [success, setSuccess] = useState<SuccessState>({ kind: 'idle' });

  const isOwner = !!userId && !!ownerId && userId === ownerId;

  // Reset transient UI on open/close.
  useEffect(() => {
    if (!open) {
      setCopied(false);
      setQuery('');
      setSuccess({ kind: 'idle' });
    }
  }, [open]);

  // Refetch recent contacts on open so a brand-new join shows up.
  useEffect(() => {
    if (!open) return;
    void fetchRecentContacts();
  }, [open, fetchRecentContacts]);

  // Surface an existing live invite if one exists; otherwise auto-
  // generate so the icon-buttons + link box have something to share.
  useEffect(() => {
    if (!open || !listId || shareUrl) return;
    const live = invites.find(
      (i) => !i.revoked_at && new Date(i.expires_at) > new Date(),
    );
    if (live && typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/share/grocery/${live.token}`);
      setShareToken(live.token);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await createInvite();
      if (cancelled) return;
      if (result) {
        setShareUrl(result.url);
        setShareToken(result.token);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, listId, invites, shareUrl, createInvite]);

  const message = (url: string) => t('share.message', { url });

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const handleWhatsApp = () => {
    if (!shareUrl) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(message(shareUrl))}`, '_blank');
  };
  const handleSms = () => {
    if (!shareUrl) return;
    window.location.href = `sms:&body=${encodeURIComponent(message(shareUrl))}`;
  };
  const handleNativeShare = async () => {
    if (!shareUrl) return;
    const data = { title: t('share.nativeTitle'), text: message(shareUrl), url: shareUrl };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) await navigator.share(data);
      else await handleCopy();
    } catch {}
  };
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Filter recent contacts by query. Contacts with names matching are
  // shown; if the query looks like a partial/full email, we show "send
  // as email" affordance instead.
  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recentContacts;
    if (looksLikeEmailIntent(q)) return [];
    return recentContacts.filter((c) =>
      (c.display_name ?? '').toLowerCase().includes(q),
    );
  }, [query, recentContacts]);

  const queryIsEmail = isLikelyEmail(query.trim());
  const queryLooksLikeEmail = looksLikeEmailIntent(query);

  const submitInviteFromQuery = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!isLikelyEmail(trimmed)) return;
    setSuccess({ kind: 'sending' });
    const result = await inviteByEmail(trimmed);
    if (!result.ok) {
      setSuccess({ kind: 'error', message: t('share.fallbackEmailHint', { value: trimmed }) });
      return;
    }
    setSuccess({
      kind: 'sent',
      mode: result.mode,
      displayName: result.display_name ?? null,
    });
    setQuery('');
  };

  const onPickContact = async (contactUserId: string, displayName: string | null) => {
    setSuccess({ kind: 'sending' });
    const result = await inviteRecentContact(contactUserId, displayName);
    if (!result.ok) {
      setSuccess({ kind: 'error', message: result.error });
      return;
    }
    setSuccess({
      kind: 'sent',
      mode: result.mode,
      displayName: result.display_name ?? displayName,
    });
    setQuery('');
  };

  const handleResetLink = async () => {
    if (!shareToken) return;
    if (!window.confirm(t('share.confirmReset'))) return;
    setResetting(true);
    try {
      await revokeInvite(shareToken);
      setShareUrl(null);
      setShareToken(null);
      const result = await createInvite();
      if (result) {
        setShareUrl(result.url);
        setShareToken(result.token);
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={prefersReducedMotion ? undefined : { y: '100%' }}
            animate={prefersReducedMotion ? undefined : { y: 0 }}
            exit={prefersReducedMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl max-h-[88vh] overflow-y-auto"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div
              className="px-6 pt-2 pb-6 max-w-md mx-auto space-y-5"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <div>
                <h2 className="text-lg font-bold text-text-primary">
                  {t('share.title')}
                </h2>
                <p className="text-sm text-text-secondary">
                  {t('share.subtitle')}
                </p>
              </div>

              {/* ── Share-with hero (single input + contact picker) */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-text-primary">
                  {t('share.shareWithHeading')}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode={queryLooksLikeEmail ? 'email' : 'text'}
                    autoComplete="off"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (success.kind !== 'idle' && success.kind !== 'sending') {
                        setSuccess({ kind: 'idle' });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && queryIsEmail) {
                        e.preventDefault();
                        void submitInviteFromQuery();
                      }
                    }}
                    placeholder={t('share.searchPlaceholder')}
                    disabled={success.kind === 'sending'}
                    className="flex-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary disabled:opacity-50"
                  />
                  {queryIsEmail && (
                    <button
                      type="button"
                      onClick={submitInviteFromQuery}
                      disabled={success.kind === 'sending'}
                      className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                    >
                      {success.kind === 'sending' ? t('share.emailSending') : t('share.sendInvite')}
                    </button>
                  )}
                </div>

                {/* Contact row OR email-fallback hint */}
                {!queryLooksLikeEmail && filteredContacts.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {filteredContacts.map((c) => (
                      <button
                        key={c.user_id}
                        type="button"
                        onClick={() => onPickContact(c.user_id, c.display_name)}
                        disabled={success.kind === 'sending'}
                        className="flex flex-col items-center gap-1 flex-shrink-0 disabled:opacity-50"
                      >
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base ${colorForUserId(c.user_id)}`}
                          aria-hidden
                        >
                          {(c.display_name ?? '?').slice(0, 1).toUpperCase()}
                        </div>
                        <span className="text-[11px] text-text-secondary max-w-[64px] truncate">
                          {c.display_name ?? t('share.unnamedMember')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!queryLooksLikeEmail && filteredContacts.length === 0 && recentContacts.length === 0 && (
                  <p className="text-xs text-text-tertiary">
                    {t('share.noRecentContacts')}
                  </p>
                )}
                {queryLooksLikeEmail && !queryIsEmail && (
                  <p className="text-xs text-text-tertiary">
                    {t('share.fallbackEmailHint', { value: query.trim() })}
                  </p>
                )}

                {/* Success / error feedback */}
                {success.kind === 'sent' && (
                  <p className="text-xs text-success font-medium">
                    {success.mode === 'in_app'
                      ? success.displayName
                        ? t('share.successInApp', { name: success.displayName })
                        : t('share.successInAppFallback')
                      : success.mode === 'already_member'
                      ? success.displayName
                        ? t('share.successAlreadyMember', { name: success.displayName })
                        : t('share.successAlreadyMemberFallback')
                      : t('share.successEmail')}
                  </p>
                )}
                {success.kind === 'error' && (
                  <p className="text-xs text-error">{success.message}</p>
                )}
              </div>

              {/* ── Link share */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-text-primary">
                  {t('share.linkHeading')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <ShareIconButton
                    label={t('share.whatsapp')}
                    onClick={handleWhatsApp}
                    disabled={!shareUrl}
                    bg="bg-[#25D366]"
                    text="text-white"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                    </svg>
                  </ShareIconButton>
                  <ShareIconButton
                    label={t('share.sms')}
                    onClick={handleSms}
                    disabled={!shareUrl}
                    bg="bg-[#34C759]"
                    text="text-white"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 2C6.48 2 2 5.92 2 10.75c0 2.52 1.21 4.78 3.13 6.34-.13 1.05-.55 2.39-1.43 3.41-.18.21-.06.55.21.59 1.85.27 4.13-.31 5.55-1.32C10.4 19.93 11.18 20 12 20c5.52 0 10-3.92 10-9.25S17.52 2 12 2z" />
                    </svg>
                  </ShareIconButton>
                  <ShareIconButton
                    label={canNativeShare ? t('share.more') : t('share.copy')}
                    onClick={canNativeShare ? handleNativeShare : handleCopy}
                    disabled={!shareUrl}
                    bg="bg-surface-elevated"
                    text="text-text-primary border border-border"
                  >
                    {canNativeShare ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </ShareIconButton>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-[11px] text-text-secondary truncate font-mono">
                    {shareUrl ?? t('common.loading')}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!shareUrl}
                    className="px-3 py-2 rounded-lg bg-surface border border-border text-xs font-medium text-text-primary hover:bg-surface-elevated disabled:opacity-40"
                  >
                    {copied ? t('share.copied') : t('share.copy')}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                  <span>{t('share.linkExpiry')}</span>
                  <button
                    type="button"
                    onClick={handleResetLink}
                    disabled={!shareToken || resetting}
                    className="text-text-secondary hover:text-text-primary underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    {resetting ? t('common.loading') : t('share.resetLink')}
                  </button>
                </div>
              </div>

              {/* ── Members */}
              {members.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs uppercase tracking-wide text-text-tertiary mb-2">
                    {t('share.membersHeading')}
                  </p>
                  <ul className="space-y-1">
                    {members.map((m) => (
                      <li
                        key={m.user_id}
                        className="flex items-center gap-2 text-sm text-text-primary py-1"
                      >
                        <span className={`w-2 h-2 rounded-full ${colorForUserId(m.user_id)} flex-shrink-0`} aria-hidden />
                        <span className="flex-1">
                          {m.display_name_snapshot || t('share.unnamedMember')}
                        </span>
                        {m.role === 'owner' && (
                          <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
                            {t('share.ownerBadge')}
                          </span>
                        )}
                        {m.user_id === userId && (
                          <span className="text-[10px] text-text-tertiary">
                            {t('share.youBadge')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Leave (members only) */}
              {!isOwner && (
                <button
                  type="button"
                  onClick={async () => {
                    await leaveList();
                    onClose();
                  }}
                  className="block mx-auto text-xs text-error hover:underline"
                >
                  {t('share.leave')}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ShareIconButton({
  label,
  onClick,
  disabled,
  bg,
  text,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  bg: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${bg} ${text} disabled:opacity-40 transition-opacity`}
    >
      <span className="flex items-center justify-center">{children}</span>
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </button>
  );
}
