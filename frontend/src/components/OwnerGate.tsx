import { Lock } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth, useUnlock } from '../api/client';
import { Problem } from './bits';

/** True when this browser may use the private pages (always true on a local install with no key set). */
export function useIsOwner(): boolean {
  const { data } = useAuth();
  return !!data && (!data.required || data.ok);
}

/** Journal, alerts, chat and the debate belong to one person. On a public site they need the owner's key. */
export default function OwnerGate({ children, what }: { children: ReactNode; what: string }) {
  const { data, error, refetch } = useAuth();
  const unlock = useUnlock();
  const [key, setKey] = useState('');
  const [tried, setTried] = useState(false);
  if (error && !data) return <Problem error={error} retry={() => refetch()} />;
  if (!data) return <div className="skeleton h-64" />;
  if (!data.required || data.ok) return <>{children}</>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    unlock(key.trim());
  };
  return (
    <form onSubmit={submit} className="panel mx-auto max-w-md space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-raised text-gold"><Lock size={18} aria-hidden /></span>
        <div>
          <h2 className="title text-xl">Private</h2>
          <p className="text-[14px] text-ink2">{what} belongs to the owner of this site.</p>
        </div>
      </div>
      <label className="block">
        <span className="label mb-1 block">Owner key</span>
        <input type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} className="field" placeholder="The OWNER_TOKEN you set on the server" />
      </label>
      {tried && <p role="alert" className="text-[14px] text-downtext">That key was not accepted.</p>}
      <button type="submit" className="btn btn-gold press" disabled={!key.trim()}>Unlock</button>
      <p className="text-[13px] text-ink3">The key is kept on this device only and is sent with each private request.</p>
    </form>
  );
}
