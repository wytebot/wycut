'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { signInWithGoogleNative } from '@/lib/auth/google-native';
import { apiUrl } from '@/lib/api-client';
import { CREDIT_PACKS, SCRIPT_CREDITS_MAX, SCRIPT_CREDITS_MIN, formatCredits, formatNaira, narrationCredits, narrationMinutesForCredits, priceProduct, scriptCredits, transcribeCreditsForVideo, USD_NGN_RATE, WELCOME_CREDITS } from '@/lib/billing/pricing';

type ProductId = string;
const productIds: ProductId[] = CREDIT_PACKS.map(pack => pack.id);
const EXAMPLES = [
  { label: '20-min video → 3-min recap', credits: transcribeCreditsForVideo(1200) + scriptCredits(20_000, 1200, 180, 12) + narrationCredits(2700) },
  { label: '90-min movie → 8-min recap', credits: transcribeCreditsForVideo(5400) + scriptCredits(70_000, 5400, 480, 20) + narrationCredits(7200) },
  { label: 'Any subtitle file → script only', credits: scriptCredits(30_000, 0, 600, 12) },
];
function getIdentityLabel(token: string) {
  try { const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as { email?: string; phone_number?: string }; return String(payload.email || payload.phone_number || 'Signed-in account'); } catch { return 'Signed-in account'; }
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function nonce12() { const values = new Uint32Array(12); window.crypto.getRandomValues(values); return Array.from(values, value => alphabet[value % alphabet.length]).join(''); }
function toBase64(bytes: Uint8Array) { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))); return btoa(binary); }
// Copy typed-array views into a standalone ArrayBuffer to satisfy modern TypeScript DOM BufferSource types.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return copy.buffer; }
async function encryptField(value: string, keyBase64: string, nonce: string) {
  if (!window.crypto?.subtle) throw new Error('Secure card encryption is unavailable. Open WyCut over HTTPS or use the updated APK.');
  let raw: Uint8Array; try { raw = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0)); } catch { throw new Error('Flutterwave v4 encryption key is invalid.'); }
  if (raw.length !== 32) throw new Error('Flutterwave v4 encryption key must decode to 32 bytes.');
  const key = await window.crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = toArrayBuffer(new TextEncoder().encode(nonce));
  const plaintext = toArrayBuffer(new TextEncoder().encode(value));
  const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return toBase64(new Uint8Array(encrypted));
}
function passesLuhn(value: string) {
  const digits = value.replace(/\D/g, ''); if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0; let double = false;
  for (let i = digits.length - 1; i >= 0; i--) { let n = Number(digits[i]); if (double) { n *= 2; if (n > 9) n -= 9; } sum += n; double = !double; }
  return sum % 10 === 0;
}
async function encryptCardDetails(details: { card_number: string; cvv: string; expiry_month: string; expiry_year: string }, key: string) {
  const nonce = nonce12();
  const [encryptedCardNumber, encryptedExpiryMonth, encryptedExpiryYear, encryptedCvv] = await Promise.all([
    encryptField(details.card_number, key, nonce), encryptField(details.expiry_month, key, nonce),
    encryptField(details.expiry_year, key, nonce), encryptField(details.cvv, key, nonce),
  ]);
  return { nonce, encrypted_card_number: encryptedCardNumber, encrypted_expiry_month: encryptedExpiryMonth, encrypted_expiry_year: encryptedExpiryYear, encrypted_cvv: encryptedCvv };
}

export default function BillingPage() {
  const [idToken, setIdToken] = useState(''); const [email, setEmail] = useState('');
  const [productId, setProductId] = useState<ProductId>('plus');
  const [cardNumber, setCardNumber] = useState(''); const [cvv, setCvv] = useState(''); const [expiryMonth, setExpiryMonth] = useState(''); const [expiryYear, setExpiryYear] = useState(''); const [encryptionKey, setEncryptionKey] = useState('');
  const [freeAccess, setFreeAccess] = useState(false);
  const [txRef, setTxRef] = useState(''); const [challenge, setChallenge] = useState<'otp' | 'pin' | ''>(''); const [code, setCode] = useState('');
  const [status, setStatus] = useState(''); const [orderState, setOrderState] = useState(''); const [paymentVerified, setPaymentVerified] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [balance, setBalance] = useState<number | null>(null); const [native, setNative] = useState(false);
  const selected = priceProduct(productId)!;
  const acceptGoogleToken = useCallback((token: string) => { setIdToken(token); setEmail(getIdentityLabel(token)); try { localStorage.setItem('wycut_google_id_token', token); } catch { /* session storage may be unavailable in private contexts */ } setError(''); }, []);
  useEffect(() => { setNative(Capacitor.isNativePlatform()); try { const saved = localStorage.getItem('wycut_google_id_token') || ''; if (saved) acceptGoogleToken(saved); } catch { /* ignore unavailable session storage */ } }, [acceptGoogleToken]);
  useEffect(() => { if (!idToken) { setFreeAccess(false); return; } let active = true; void fetch(apiUrl('/api/billing/entitlement'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), cache: 'no-store' }).then(async response => { const data = await response.json().catch(() => ({})) as { freeAccess?: boolean; email?: string; credits?: number }; if (active && response.ok) { setFreeAccess(data.freeAccess === true); setEmail(data.email || getIdentityLabel(idToken)); setBalance(Math.max(0, Number(data.credits || 0))); } }).catch(() => undefined); return () => { active = false; }; }, [idToken]);
  async function signInNative() {
    setBusy(true); setError('');
    try { const user = await signInWithGoogleNative(); acceptGoogleToken(user.authentication.idToken); setEmail(user.email); }
    catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in failed.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!idToken || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const returnedFromBank = params.get('payment_return') === '1';
    if (returnedFromBank) window.history.replaceState({}, '', window.location.pathname);
    let pending = ''; try { pending = localStorage.getItem('wycut_pending_tx_ref') || ''; } catch { /* ignore */ }
    pending = pending || params.get('txRef') || '';
    if (!returnedFromBank && !pending) return;
    if (!pending) { setError('Returned from the bank, but the pending order reference is missing. Open Billing and check your transaction history.'); return; }
    setTxRef(pending);
    void (async () => { try { const response = await fetch(apiUrl('/api/billing/status'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txRef: pending, idToken }), cache: 'no-store' }); const data = await response.json().catch(() => ({})) as { error?: string; status?: string; credits?: number; message?: string }; if (!response.ok) throw new Error(data.error || 'Could not check payment status.'); setStatus(data.message || data.status || 'Checking payment…'); setOrderState(String(data.status || '').toLowerCase()); if (data.status === 'credited') { setBalance(data.credits ?? null); setPaymentVerified(true); try { localStorage.removeItem('wycut_pending_tx_ref'); } catch { /* ignore */ } } else if (data.status === 'provider_rejected') { try { localStorage.removeItem('wycut_pending_tx_ref'); } catch { /* ignore */ } } } catch (e) { setError(e instanceof Error ? e.message : 'Could not check payment status.'); } })();
  }, [idToken]);
  useEffect(() => {
    if (!idToken || !Capacitor.isNativePlatform()) return;
    let handle: { remove: () => Promise<void> } | undefined; let active = true;
    void Browser.addListener('browserFinished', () => {
      let pending = ''; try { pending = localStorage.getItem('wycut_pending_tx_ref') || ''; } catch { /* ignore */ }
      if (!pending || !active) return;
      window.setTimeout(() => { void fetch(apiUrl('/api/billing/status'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txRef: pending, idToken }), cache: 'no-store' }).then(async response => { const data = await response.json().catch(() => ({})) as { error?: string; status?: string; credits?: number; message?: string }; if (!response.ok) throw new Error(data.error || 'Could not check payment status.'); setStatus(data.message || data.status || 'Checking payment…'); setOrderState(String(data.status || '').toLowerCase()); if (data.status === 'credited') { setBalance(data.credits ?? null); setPaymentVerified(true); try { localStorage.removeItem('wycut_pending_tx_ref'); } catch { /* ignore */ } } }).catch(error => setError(error instanceof Error ? error.message : 'Could not check payment status.')); }, 1200);
    }).then(value => { if (active) handle = value; else void value.remove(); }).catch(() => undefined);
    return () => { active = false; if (handle) void handle.remove(); };
  }, [idToken]);
  async function checkStatus(reference = txRef) {
    if (!reference || !idToken) return;
    const response = await fetch(apiUrl('/api/billing/status'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txRef: reference, idToken }), cache: 'no-store' });
    const data = await response.json().catch(() => ({})) as { error?: string; status?: string; credits?: number; creditsPurchased?: number; message?: string };
    if (!response.ok) throw new Error(data.error || 'Could not verify payment status.');
    setStatus(data.message || data.status || 'Checking payment…'); setOrderState(String(data.status || '').toLowerCase());
    if (data.status === 'credited') { setBalance(data.credits ?? null); setPaymentVerified(true); setChallenge(''); setCode(''); try { localStorage.removeItem('wycut_pending_tx_ref'); } catch { /* ignore */ } } else if (data.status === 'provider_rejected') { try { localStorage.removeItem('wycut_pending_tx_ref'); } catch { /* ignore */ } }
  }
  async function pay() {
    if (['credited', 'provider_rejected', 'provider_error'].includes(orderState)) { setTxRef(''); setOrderState(''); try { localStorage.removeItem('wycut_pending_tx_ref'); } catch { /* ignore */ } }
    setError(''); setStatus(''); setPaymentVerified(false);
    if (!idToken) { setError('Sign in before purchasing.'); return; }
    if (!passesLuhn(cardNumber) || !/^\d{3,4}$/.test(cvv) || !/^\d{1,2}$/.test(expiryMonth) || !/^\d{2,4}$/.test(expiryYear)) { setError('Check your card number, CVV and expiry date.'); return; }
    const month = Number(expiryMonth); if (month < 1 || month > 12) { setError('Enter an expiry month from 01 to 12.'); return; }
    const yearDigits = expiryYear.length === 2 ? `20${expiryYear}` : expiryYear; const current = new Date(); const expiryYearNumber = Number(yearDigits);
    if (expiryYearNumber < current.getFullYear() || (expiryYearNumber === current.getFullYear() && month < current.getMonth() + 1)) { setError('This card appears to be expired. Check the expiry date.'); return; }
    setBusy(true);
    try {
      let key = encryptionKey;
      if (!key) {
        const configResponse = await fetch(apiUrl('/api/billing/config'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), cache: 'no-store' });
        const config = await configResponse.json().catch(() => ({})) as { error?: string; encryptionKey?: string; freeAccess?: boolean };
        if (config.freeAccess) { setFreeAccess(true); return; }
        if (!configResponse.ok || !config.encryptionKey) throw new Error(config.error || 'Could not load Flutterwave v4 encryption settings.');
        key = config.encryptionKey; setEncryptionKey(key);
      }
      const year = expiryYear.length === 2 ? `20${expiryYear}` : expiryYear;
      const card = await encryptCardDetails({ card_number: cardNumber.replace(/\s/g, ''), cvv, expiry_month: String(month).padStart(2, '0'), expiry_year: year.slice(-2) }, key);
      setCardNumber(''); setCvv(''); setExpiryMonth(''); setExpiryYear('');
      const response = await fetch(apiUrl('/api/billing/charge'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, idToken, card }), cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string; txRef?: string; status?: string; totalCharged?: number; currency?: string; providerMessage?: string; redirectUrl?: string; freeAccess?: boolean };
      if (data.freeAccess) { setFreeAccess(true); setStatus(data.message || 'Lifetime free access is active.'); return; }
      if (data.txRef) { setTxRef(data.txRef); try { localStorage.setItem('wycut_pending_tx_ref', data.txRef); } catch { /* optional redirect recovery */ } }
      if (data.status) setOrderState(data.status.toLowerCase());
      if (!response.ok) { throw new Error(data.error || 'Could not start payment.'); }
      if (!data.txRef) throw new Error('The provider did not return an order reference. Check payment status before trying again.');
      setTxRef(data.txRef);
      if (data.redirectUrl) { if (Capacitor.isNativePlatform()) { setStatus('Finish bank verification in the secure browser, then return to WyCut. Payment status will be checked when you close the browser.'); await Browser.open({ url: data.redirectUrl }); } else window.location.assign(data.redirectUrl); return; }
      const providerStatus = String(data.status || '').toUpperCase(); setOrderState(providerStatus.toLowerCase());
      if (providerStatus.includes('OTP')) { setChallenge('otp'); setStatus('Flutterwave requires the one-time password sent by your bank.'); }
      else if (providerStatus.includes('PIN')) { setChallenge('pin'); setStatus('Flutterwave requires card PIN verification.'); }
      else { setStatus(data.providerMessage || 'Payment submitted. Verifying your payment before adding credits…'); await checkStatus(data.txRef); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Payment could not be started.'); }
    finally { setBusy(false); }
  }
  async function submitChallenge() {
    if (!txRef || !idToken || (challenge === 'pin' ? !/^\d{4,6}$/.test(code) : !/^\d{4,8}$/.test(code))) { setError(challenge === 'pin' ? 'Enter your 4–6 digit card PIN.' : 'Enter the 4–8 digit OTP sent by your bank.'); return; }
    setBusy(true); setError('');
    try {
      let payload: Record<string, unknown> = { txRef, idToken, action: challenge || 'otp' };
      if (challenge === 'pin') {
        let key = encryptionKey;
        if (!key) { const configResponse = await fetch(apiUrl('/api/billing/config'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), cache: 'no-store' }); const config = await configResponse.json().catch(() => ({})) as { error?: string; encryptionKey?: string }; if (!configResponse.ok || !config.encryptionKey) throw new Error(config.error || 'Could not load Flutterwave encryption settings.'); key = config.encryptionKey; setEncryptionKey(key); }
        const nonce = nonce12(); payload = { ...payload, nonce, encryptedPin: await encryptField(code, key, nonce) };
      } else payload.code = code;
      const response = await fetch(apiUrl('/api/billing/validate-otp'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string; status?: string; challenge?: 'otp' | 'pin' | ''; redirectUrl?: string | null };
      if (!response.ok) throw new Error(data.error || 'Payment verification failed.');
      setStatus(data.message || 'Code accepted. Checking settlement…'); setOrderState(String(data.status || '').toLowerCase()); setChallenge(data.challenge || ''); setCode('');
      if (data.redirectUrl) { if (Capacitor.isNativePlatform()) await Browser.open({ url: data.redirectUrl }); else { window.location.assign(data.redirectUrl); return; } }
      await checkStatus(txRef);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not validate the code.'); }
    finally { setBusy(false); }
  }
  if (freeAccess) return <main className="min-h-screen bg-[#080a10] px-4 py-12 text-white sm:px-6"><div className="mx-auto max-w-2xl rounded-3xl border border-emerald-400/30 bg-[#111521] p-7 sm:p-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">WyCut access</p><h1 className="mt-3 text-3xl font-black">Lifetime free access active</h1><p className="mt-3 leading-7 text-slate-300">This verified account is exempt from WyCut checkout. Recap generation is available without buying credits.</p><p className="mt-3 break-all text-sm text-emerald-200">{email}</p><Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-black">Open Recap Studio</Link></div></main>;
  return <main className="min-h-screen bg-[#080a10] px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-3xl"><Link href="/" className="inline-flex items-center gap-2 text-sm text-violet-300"><ArrowLeft size={16}/> Back to WyCut</Link><header className="mt-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">Secure checkout</p><h1 className="mt-2 text-2xl font-black sm:text-4xl">Top up credits</h1><p className="mt-3 max-w-2xl leading-7 text-slate-400">Pay only for what you make. Credits never expire and there is no subscription. Bigger packs include bonus credits. Prices use a fixed rate of ₦{USD_NGN_RATE.toLocaleString('en-NG')} per US dollar with no extra fees.</p></header>
    <div className="mt-7 grid gap-4 sm:grid-cols-2">{productIds.map(id => { const p = priceProduct(id)!; return <button key={id} onClick={() => setProductId(id)} className={`rounded-2xl border p-5 text-left transition ${productId === id ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-[#111521]'}`}><span className="flex items-center justify-between text-sm text-slate-400"><span>{p.label}</span>{p.badge && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">{p.badge}</span>}</span><span className="mt-2 block break-words text-2xl font-black sm:text-3xl">{formatNaira(p.totalNgn)}</span><span className="mt-2 block text-sm text-slate-300">{formatCredits(p.credits)} credits</span><span className="mt-3 block border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">≈ {formatNaira(Math.round(p.totalNgn / p.credits * 10) / 10)} per credit · about {narrationMinutesForCredits(p.credits)} min of narration, or ~{Math.max(1, Math.floor(p.credits / EXAMPLES[1].credits))} full movie recap(s)</span></button>; })}</div>
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-5"><h2 className="text-sm font-bold">What things cost</h2><ul className="mt-3 space-y-2 text-sm text-slate-300">{EXAMPLES.map(item => <li key={item.label} className="flex justify-between gap-3"><span>{item.label}</span><strong className="shrink-0 text-white">~{formatCredits(item.credits)} credits</strong></li>)}</ul><p className="mt-3 text-xs leading-5 text-slate-500">Transcribing video audio: 2 credits per 5 minutes · Script: {SCRIPT_CREDITS_MIN}–{SCRIPT_CREDITS_MAX} credits · Narration: about 4.5 credits per spoken minute. Subtitle files skip the transcription charge. If a step fails, its credits are refunded automatically. New accounts get {WELCOME_CREDITS} free credits to try WyCut.</p></section>
    {balance !== null && <p className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm text-slate-300">Your balance: <strong className="text-white">{balance}</strong> credits</p>}
    <section className="mt-6 rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 text-emerald-300" size={22}/><div><h2 className="font-bold">1. Verify your account</h2><p className="mt-1 text-sm text-slate-400">Credits are added to the signed-in WyCut account.</p></div></div>{email ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3"><div><p className="text-xs text-emerald-300">Signed in</p><p className="mt-1 text-sm font-semibold">{email}</p></div><button onClick={() => { setIdToken(''); setEmail(''); setFreeAccess(false); setTxRef(''); setOrderState(''); setPaymentVerified(false); setStatus(''); setError(''); setBalance(null); setChallenge(''); setCode(''); try { localStorage.removeItem('wycut_google_id_token'); localStorage.removeItem('wycut_pending_tx_ref'); } catch { /* ignore unavailable session storage */ } }} className="text-xs text-slate-400 underline">Switch account</button></div> : native ? <button disabled={busy} onClick={() => void signInNative()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-black disabled:opacity-50">{busy && <LoaderCircle size={16} className="animate-spin"/>}Continue with Google</button> : <div className="mt-4"><Link href="/login?next=/billing" className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 font-bold text-black hover:bg-violet-100">Sign in with Google, email or phone</Link><p className="mt-2 text-xs text-slate-500">Google popup with redirect fallback, email/password, and SMS verification are available.</p></div>}
    <div className="mt-7 flex items-start gap-3"><CreditCard className="mt-1 text-violet-300" size={22}/><div className="min-w-0 flex-1"><h2 className="font-bold">2. Card payment</h2><p className="mt-1 text-sm text-slate-400">Card fields are encrypted in your browser with the configured Flutterwave v4 AES-GCM key before submission.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400 sm:col-span-2">Card number<input autoComplete="cc-number" inputMode="numeric" value={cardNumber} onChange={e => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white outline-none focus:border-violet-400" placeholder="1234 5678 9012 3456" /></label><label className="text-xs text-slate-400">Expiry month<input autoComplete="cc-exp-month" inputMode="numeric" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white" placeholder="MM" /></label><label className="text-xs text-slate-400">Expiry year<input autoComplete="cc-exp-year" inputMode="numeric" value={expiryYear} onChange={e => setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white" placeholder="YY or YYYY" /></label><label className="text-xs text-slate-400">CVV<input autoComplete="cc-csc" inputMode="numeric" type="password" value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white" placeholder="CVV" /></label></div><div className="mt-4 flex items-start gap-2 rounded-xl bg-black/20 p-3 text-xs leading-5 text-slate-400"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-emerald-300"/>Card fields are never saved to WyCut state after submission and are cleared from the form. Your browser encrypts each field with AES-GCM before the server sends the v4 payment-method request.</div><button disabled={busy || !idToken || (!!txRef && !['provider_rejected', 'provider_error', 'credited'].includes(orderState))} onClick={() => void pay()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-3.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <><LoaderCircle size={18} className="animate-spin"/> Processing…</> : (!!txRef && !['provider_rejected', 'provider_error', 'credited'].includes(orderState)) ? <>Check existing payment first</> : <>Pay {formatNaira(selected.totalNgn)} securely</>}</button></div></div>
    {challenge && <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><h3 className="font-bold">3. Bank verification {challenge.toUpperCase()}</h3><p className="mt-1 text-sm text-slate-400">Enter the {challenge === 'otp' ? 'one-time password (OTP) sent by your bank' : 'PIN requested by your bank'} to continue.</p><div className="mt-3 flex gap-2"><input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" autoComplete="one-time-code" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" placeholder={challenge.toUpperCase()} /><button disabled={busy} onClick={() => void submitChallenge()} className="rounded-xl bg-white px-4 py-3 font-bold text-black disabled:opacity-40">Verify</button></div></div>}
    {(status || error) && <div className={`mt-5 rounded-xl border p-4 text-sm ${error ? 'border-rose-400/20 bg-rose-400/5 text-rose-200' : 'border-white/10 bg-black/20 text-slate-200'}`}>{error || status}{txRef && !['credited', 'provider_rejected', 'provider_error'].includes(orderState) && <button disabled={busy} onClick={() => void checkStatus().catch(e => setError(e instanceof Error ? e.message : 'Status check failed.'))} className="ml-2 underline disabled:opacity-50">Check status</button>}</div>}
    {paymentVerified && balance !== null && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5"><CheckCircle2 size={24} className="text-emerald-300"/><h3 className="mt-2 text-lg font-bold">Payment verified — credits added</h3><p className="mt-1 text-sm text-slate-300">Your account now has {formatCredits(balance)} credits available.</p><Link href="/dashboard" className="mt-4 inline-flex rounded-xl bg-white px-4 py-3 font-bold text-black">Open Recap Studio</Link></div>}
    </section><p className="mt-5 text-xs leading-5 text-slate-500">Credits are added only after your payment is confirmed. Unused credits stay on your account.</p><nav aria-label="Legal" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-violet-300"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refunds">Refunds</Link><Link href="/acceptable-use">Acceptable use</Link></nav></div></main>;
}
