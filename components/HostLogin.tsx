'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function HostLogin() {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/host/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });

    if (response.ok) {
      router.refresh();
    } else {
      setError('Wrong passcode');
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>Host</h1>
      <input
        className="field"
        type="password"
        autoFocus
        value={passcode}
        placeholder="Passcode"
        onChange={(e) => setPasscode(e.target.value)}
      />
      {error && <div className="warn">{error}</div>}
      <button className="ctl is-primary" type="submit" disabled={busy}>
        {busy ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  );
}
