'use client';

import { useState } from 'react';
import { WEDGE_COLORS } from '@/lib/constants';

export function OptionsEditor({
  options,
  onClose,
}: {
  options: string[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(options);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/host/options', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ options: draft }),
    });

    if (response.ok) {
      onClose();
    } else {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'Could not save');
      setBusy(false);
    }
  }

  return (
    <div className="editor" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save}>
        <h2>Six options</h2>
        {draft.map((value, i) => (
          <label key={i} className="editor-row">
            <span className="chip" style={{ background: WEDGE_COLORS[i], height: 28 }} />
            <input
              className="field"
              type="text"
              value={value}
              maxLength={40}
              onChange={(e) =>
                setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
          </label>
        ))}
        {error && <div className="warn">{error}</div>}
        <div className="editor-actions">
          <button type="button" className="ctl" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ctl is-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
