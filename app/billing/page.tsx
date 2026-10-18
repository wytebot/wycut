'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { signInWithGoogleNative } from '@/lib/auth/google-native';
import { apiUrl } from '@/lib/api-client';
import { formatNaira, priceProduct, USD_NGN_RATE } from '@/lib/billing/pricing';

type ProductId = 'single_recap' | 'recap_pack_10';
const productIds: ProductId[] = ['single_recap', 'recap_pack_10'];
function getIdentityLabel(token: string) {
  try { const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as { email?: string; phone_number?: string }; return String(payload.email || payload.phone_number || 'Signed-in account'); } catch { return 'Signed-in account'; }
}
function pemToBytes(pem: string) {
  const cleaned = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s/g, '');
  const binary = atob(cleaned); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function encryptCardDetails(details: { card_number: string; cvv: string; expiry_month: string; expiry_year: string; pin: string }) {
  const pem = process.env.NEXT_PUBLIC_FLW_CARD_RSA_PUBLIC_KEY;
  if (!pem) throw new Error('Card encryption is not configured. Add NEXT_PUBLIC_FLW_CARD_RSA_PUBLIC_KEY using the public-key format required by your enabled Flutterwave v4 account.');
  if (!window.crypto?.subtle) throw new Error('Secure card encryption is unavailable in this browser. Open WyCut over HTTPS or use the updated APK.');
  const key = await window.crypto.subtle.importKey('spki', pemToBytes(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const payload = new TextEncoder().encode(JSON.stringify(details));
  const encrypted = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, payload);
  const bytes = new Uint8Array(encrypted); let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}

export default function BillingPage() {
  const [idToken, setIdToken] = useState(''); const [email, setEmail] = useState('');
  const [productId, setProductId] = useState<ProductId>('single_recap');
  const [cardNumber, setCardNumber] = useState(''); const [cvv, setCvv] = useState(''); const [expiryMonth, setExpiryMonth] = useState(''); const [expiryYear, setExpiryYear] = useState(''); const [pin, setPin] = useState('');
  const [freeAccess, setFreeAccess] = useState(false);
  const [txRef, setTxRef] = useState(''); const [challenge, setChallenge] = useState<'otp' | 'pin' | ''>(''); const [code, setCode] = useState('');
  const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [balance, setBalance] = useState<number | null>(null); const [native, setNative] = useState(false);
  const selected = priceProduct(productId)!;
  const acceptGoogleToken = useCallback((token: string) => { setIdToken(token); setEmail(getIdentityLabel(token)); try { sessionStorage.setItem('wycut_google_id_token', token); } catch { /* session storage may be unavailable in private contexts */ } setError(''); }, []);
  useEffect(() => { setNative(Capacitor.isNativePlatform()); try { const saved = sessionStorage.getItem('wycut_google_id_token') || ''; if (saved) acceptGoogleToken(saved); } catch { /* ignore unavailable session storage */ } }, [acceptGoogleToken]);
  useEffect(() => { if (!idToken) { setFreeAccess(false); return; } let active = true; void fetch(apiUrl('/api/billing/entitlement'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), cache: 'no-store' }).then(async response => { const data = await response.json().catch(() => ({})) as { freeAccess?: boolean }; if (active && response.ok && data.freeAccess) setFreeAccess(true); }).catch(() => undefined); return () => { active = false; }; }, [idToken]);
  async function signInNative() {
    setBusy(true); setError('');
    try { const user = await signInWithGoogleNative(); acceptGoogleToken(user.authentication.idToken); setEmail(user.email); }
    catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in failed.'); }
    finally { setBusy(false); }
  }
  async function checkStatus(reference = txRef) {
    if (!reference || !idToken) return;
    const response = await fetch(apiUrl('/api/billing/status'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txRef: reference, idToken }), cache: 'no-store' });
    const data = await response.json().catch(() => ({})) as { error?: string; status?: string; recapsAvailable?: number; recapsPurchased?: number; message?: string };
    if (!response.ok) throw new Error(data.error || 'Could not verify payment status.');
    setStatus(data.message || data.status || 'Checking payment…');
    if (data.status === 'credited') { setBalance(data.recapsAvailable ?? null); setChallenge(''); setCode(''); }
  }
  async function pay() {
    setError(''); setStatus(''); setBalance(null);
    if (!idToken) { setError('Sign in before purchasing.'); return; }
    if (!/^\d{12,19}$/.test(cardNumber.replace(/\s/g, '')) || !/^\d{3,4}$/.test(cvv) || !/^\d{1,2}$/.test(expiryMonth) || !/^\d{2,4}$/.test(expiryYear) || !/^\d{4,6}$/.test(pin)) { setError('Check your card number, CVV, expiry date and card PIN.'); return; }
    const month = Number(expiryMonth); if (month < 1 || month > 12) { setError('Enter an expiry month from 01 to 12.'); return; }
    setBusy(true);
    try {
      const year = expiryYear.length === 2 ? `20${expiryYear}` : expiryYear;
      const encryptedCard = await encryptCardDetails({ card_number: cardNumber.replace(/\s/g, ''), cvv, expiry_month: String(month).padStart(2, '0'), expiry_year: year, pin });
      setCardNumber(''); setCvv(''); setExpiryMonth(''); setExpiryYear(''); setPin('');
      const response = await fetch(apiUrl('/api/billing/charge'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, idToken, encryptedCard }), cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { error?: string; txRef?: string; status?: string; totalCharged?: number; currency?: string; providerMessage?: string };
      if (!response.ok) { if (data.txRef) setTxRef(data.txRef); throw new Error(data.error || 'Could not start payment.'); }
      if (!data.txRef) throw new Error('The provider did not return an order reference. Check payment status before trying again.');
      setTxRef(data.txRef);
      const providerStatus = String(data.status || '').toUpperCase();
      if (providerStatus.includes('OTP')) { setChallenge('otp'); setStatus('Flutterwave requires the one-time password sent by your bank.'); }
      else if (providerStatus.includes('PIN')) { setChallenge('pin'); setStatus('Flutterwave requires card PIN verification.'); }
      else { setStatus(data.providerMessage || 'Payment submitted. Verifying settlement before adding recap credits…'); await checkStatus(data.txRef); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Payment could not be started.'); }
    finally { setBusy(false); }
  }
  async function submitChallenge() {
    if (!txRef || !idToken || !/^\d{4,8}$/.test(code)) { setError('Enter the verification code sent by your bank.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(apiUrl('/api/billing/validate-otp'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txRef, idToken, action: challenge || 'otp', code }), cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string; status?: string };
      if (!response.ok) throw new Error(data.error || 'Payment verification failed.');
      setStatus(data.message || 'Code accepted. Checking settlement…'); setCode('');
      await checkStatus(txRef);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not validate the code.'); }
    finally { setBusy(false); }
  }
  if (freeAccess) return <main className="min-h-screen bg-[#080a10] px-4 py-12 text-white sm:px-6"><div className="mx-auto max-w-2xl rounded-3xl border border-emerald-400/30 bg-[#111521] p-7 sm:p-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">WyCut access</p><h1 className="mt-3 text-3xl font-black">Lifetime free access active</h1><p className="mt-3 leading-7 text-slate-300">This verified account is exempt from WyCut checkout. Recap generation is available without purchasing credits.</p><p className="mt-3 break-all text-sm text-emerald-200">{email}</p><Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-black">Open Recap Studio</Link></div></main>;
  return <main className="min-h-screen bg-[#080a10] px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-3xl"><Link href="/" className="inline-flex items-center gap-2 text-sm text-violet-300"><ArrowLeft size={16}/> Back to WyCut</Link><header className="mt-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">Secure checkout</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Buy recap credits</h1><p className="mt-3 max-w-2xl leading-7 text-slate-400">Prices use a fixed reference rate of ₦{USD_NGN_RATE.toLocaleString('en-NG')} per US dollar. The disclosed 2% gateway fee is included in the total below.</p></header>
    <div className="mt-7 grid gap-4 sm:grid-cols-2">{productIds.map(id => { const p = priceProduct(id)!; return <button key={id} onClick={() => setProductId(id)} className={`rounded-2xl border p-5 text-left transition ${productId === id ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-[#111521]'}`}><span className="text-sm text-slate-400">{p.label}</span><span className="mt-2 block text-3xl font-black">{formatNaira(p.totalNgn)}</span><span className="mt-2 block text-sm text-slate-300">{p.recaps} {p.recaps === 1 ? 'recap credit' : 'recap credits'}</span><span className="mt-3 block border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">Base {formatNaira(p.baseNgn)} + 2% fee {formatNaira(p.feeNgn)} · USD ${p.usdBase.toFixed(2)}</span></button>; })}</div>
    <section className="mt-6 rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 text-emerald-300" size={22}/><div><h2 className="font-bold">1. Verify your account</h2><p className="mt-1 text-sm text-slate-400">Recap credits are assigned to the signed-in WyCut account.</p></div></div>{email ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3"><div><p className="text-xs text-emerald-300">Signed in</p><p className="mt-1 text-sm font-semibold">{email}</p></div><button onClick={() => { setIdToken(''); setEmail(''); try { sessionStorage.removeItem('wycut_google_id_token'); } catch { /* ignore unavailable session storage */ } }} className="text-xs text-slate-400 underline">Switch account</button></div> : native ? <button disabled={busy} onClick={() => void signInNative()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-black disabled:opacity-50">{busy && <LoaderCircle size={16} className="animate-spin"/>}Continue with Google</button> : <div className="mt-4"><Link href="/login?next=/billing" className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 font-bold text-black hover:bg-violet-100">Sign in with Google, email or phone</Link><p className="mt-2 text-xs text-slate-500">Google popup with redirect fallback, email/password, and SMS verification are available.</p></div>}
    <div className="mt-7 flex items-start gap-3"><CreditCard className="mt-1 text-violet-300" size={22}/><div className="min-w-0 flex-1"><h2 className="font-bold">2. Card payment</h2><p className="mt-1 text-sm text-slate-400">Card data is encrypted in the browser before it is sent to WyCut. Do not use this checkout until the encryption key and request format have been verified against your enabled Flutterwave v4 merchant documentation.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400 sm:col-span-2">Card number<input autoComplete="cc-number" inputMode="numeric" value={cardNumber} onChange={e => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white outline-none focus:border-violet-400" placeholder="1234 5678 9012 3456" /></label><label className="text-xs text-slate-400">Expiry month<input autoComplete="cc-exp-month" inputMode="numeric" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white" placeholder="MM" /></label><label className="text-xs text-slate-400">Expiry year<input autoComplete="cc-exp-year" inputMode="numeric" value={expiryYear} onChange={e => setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white" placeholder="YY or YYYY" /></label><label className="text-xs text-slate-400">CVV<input autoComplete="cc-csc" inputMode="numeric" type="password" value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white" placeholder="CVV" /></label><label className="text-xs text-slate-400">Card PIN<input inputMode="numeric" type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white" placeholder="Required by some banks" /></label></div><div className="mt-4 flex items-start gap-2 rounded-xl bg-black/20 p-3 text-xs leading-5 text-slate-400"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-emerald-300"/>Card fields are never saved to WyCut state after submission and are cleared from the form. Your browser encrypts the payload; the server must still use the precise encryption/request contract required by your Flutterwave v4 account.</div><button disabled={busy || !idToken} onClick={() => void pay()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-3.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <><LoaderCircle size={18} className="animate-spin"/> Processing…</> : <>Pay {formatNaira(selected.totalNgn)} securely</>}</button></div></div>
    {challenge && <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><h3 className="font-bold">3. Bank verification {challenge.toUpperCase()}</h3><p className="mt-1 text-sm text-slate-400">Enter the {challenge === 'otp' ? 'one-time password (OTP) sent by your bank' : 'PIN requested by your bank'} to continue.</p><div className="mt-3 flex gap-2"><input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" autoComplete="one-time-code" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" placeholder={challenge.toUpperCase()} /><button disabled={busy} onClick={() => void submitChallenge()} className="rounded-xl bg-white px-4 py-3 font-bold text-black disabled:opacity-40">Verify</button></div></div>}
    {(status || error) && <div className={`mt-5 rounded-xl border p-4 text-sm ${error ? 'border-rose-400/20 bg-rose-400/5 text-rose-200' : 'border-white/10 bg-black/20 text-slate-200'}`}>{error || status}{txRef && !balance && <button disabled={busy} onClick={() => void checkStatus().catch(e => setError(e instanceof Error ? e.message : 'Status check failed.'))} className="ml-2 underline disabled:opacity-50">Check status</button>}</div>}
    {balance !== null && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5"><CheckCircle2 size={24} className="text-emerald-300"/><h3 className="mt-2 text-lg font-bold">Payment verified — credits added</h3><p className="mt-1 text-sm text-slate-300">Your account now has {balance} recap credits available.</p><Link href="/dashboard" className="mt-4 inline-flex rounded-xl bg-white px-4 py-3 font-bold text-black">Open Recap Studio</Link></div>}
    </section><p className="mt-5 text-xs leading-5 text-slate-500">Exchange rate is fixed for displayed pricing and can be changed by the app owner. Provider confirmation is required before recap credits are granted. Keep the account in test mode until a real end-to-end sandbox test succeeds.</p><nav aria-label="Legal" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-violet-300"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refunds">Refunds</Link><Link href="/acceptable-use">Acceptable use</Link></nav></div></main>;
}
