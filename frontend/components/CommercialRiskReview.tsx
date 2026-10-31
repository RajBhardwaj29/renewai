"use client";
import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/authFetch';

type Item = { fingerprint: string; title: string; status: string; grounding: string; explanation: string; citations: {page: number; quote: string}[]; review: {status: string; revision: number} | null };
type Result = { coverage: string; items: Item[] };
export default function CommercialRiskReview({contractId}: {contractId: string}) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string,string>>({});
  useEffect(() => {
    let active = true;
    authFetch(`/contracts/${contractId}/commercial-review`).then(async r => {
      if (!r.ok) throw Error();
      const value = await r.json();
      if (active) setResult(value);
    }).catch(() => {if (active) setError('Commercial review is unavailable. Your contract remains saved.');});
    return () => {active = false;};
  }, [contractId]);
  async function review(item: Item, status: string) {
    setBusy(true); setError('');
    try {
      const r = await authFetch(`/contracts/${contractId}/commercial-review`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fingerprint:item.fingerprint,status,rationale:reasons[item.fingerprint],expected_revision:item.review?.revision ?? 0})});
      if (!r.ok) throw Error();
      const next = await authFetch(`/contracts/${contractId}/commercial-review`);
      if (!next.ok) throw Error();
      setResult(await next.json());
    } catch {setError('Review could not be confirmed. Reload this contract before trying again.');}
    finally {setBusy(false);}
  }
  return <section className="renewai-card mb-8 p-6" aria-label="Commercial risk review">
    <h2 className="renewai-card-title">Commercial risk review</h2>
    <p className="my-3 text-sm">Pricing increases, minimum commitments and refund restrictions. Severity is not assessed. Your team decides whether a term is acceptable.</p>
    {error && <p role="alert">{error}</p>}
    {!result && !error && <p role="status">Loading review…</p>}
    {result && <>{result.items.length === 0 && <p className="my-3">Source text is unavailable. Connect the original PDF through Ask RenewAI to enable source review.</p>}<p className="text-sm">{result.coverage}</p>{result.items.map(item => <article key={item.fingerprint} className="border-t my-5 pt-4">
      <h3 className="font-bold">{item.title}</h3>
      <p className="text-sm my-2">{item.status === 'review_required' ? 'Review suggested' : 'Not assessed'} · {item.review?.status.replaceAll('_',' ') ?? 'Unreviewed'}</p>
      <p>{item.explanation}</p>
      {item.citations.map((c,i) => <details className="my-3" key={i}><summary>Exact source · PDF page {c.page}</summary><blockquote className="whitespace-pre-wrap mt-2 border-l pl-3">{c.quote}</blockquote><p className="text-sm">Review surrounding terms and amendments in your original PDF.</p></details>)}
      {item.status === 'review_required' && <><label className="block text-sm" htmlFor={`reason-${item.fingerprint}`}>Review reason (internal; excluded from report)</label><textarea id={`reason-${item.fingerprint}`} maxLength={1000} value={reasons[item.fingerprint] ?? ''} onChange={e=>setReasons({...reasons,[item.fingerprint]:e.target.value})} className="border rounded p-2 w-full my-2" />
      <div className="flex flex-wrap gap-3">{[['confirmed','Confirm issue'],['dismissed','Dismiss'],['needs_context','Needs context']].map(([value,label])=><button className="renewai-button-secondary" key={value} disabled={busy || !reasons[item.fingerprint]?.trim()} onClick={()=>review(item,value)}>{label}</button>)}</div></>}
    </article>)}</>}
    <p className="text-sm mt-3">Review status is included in your summary report. Confirmation is separate from your renewal decision.</p>
  </section>;
}
