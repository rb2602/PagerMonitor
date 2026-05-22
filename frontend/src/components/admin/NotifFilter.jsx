import { useState, useEffect } from 'react';
import { Filter, Save } from 'lucide-react';
import { adminFetchNotifFilter, adminSaveNotifFilter } from '../../utils/api.js';
import { useAdminFetch } from '../../hooks/useAdminFetch.js';
import { adminFetchAliases, adminFetchGroups } from '../../utils/api.js';

const MODES = [
  { id: 'all',      label: 'All messages' },
  { id: 'groups',   label: 'By group' },
  { id: 'aliases',  label: 'By alias' },
  { id: 'capcodes', label: 'By capcode' },
  { id: 'keywords', label: 'By keyword' },
];

const DEFAULTS = { mode: 'all', group_ids: [], capcodes: [], keywords: [] };

function sanitise(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  return {
    mode:      MODES.map(m => m.id).includes(raw.mode) ? raw.mode : 'all',
    group_ids: Array.isArray(raw.group_ids) ? raw.group_ids.map(Number) : [],
    capcodes:  Array.isArray(raw.capcodes)  ? raw.capcodes  : [],
    keywords:  Array.isArray(raw.keywords)  ? raw.keywords  : [],
  };
}

function setListField(value) {
  return value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
}

export default function NotifFilter() {
  const { data: rawFilter, loading: loadingFilter } = useAdminFetch(adminFetchNotifFilter, DEFAULTS);
  const { data: rawAliases } = useAdminFetch(adminFetchAliases, []);
  const { data: rawGroups  } = useAdminFetch(adminFetchGroups,  []);

  const [filter, setFilter] = useState(sanitise(null));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);

  useEffect(() => { if (rawFilter) setFilter(sanitise(rawFilter)); }, [rawFilter]);

  const aliases = Array.isArray(rawAliases) ? rawAliases : [];
  const groups  = Array.isArray(rawGroups)  ? rawGroups.filter(g => !g.parent_id) : [];

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const save = async () => {
    setSaving(true);
    try { await adminSaveNotifFilter(filter); flash('ok', 'Notification filter saved'); }
    catch (e) { flash('err', e.message); }
    finally { setSaving(false); }
  };

  if (loadingFilter) return <div style={{ color: 'var(--text-3)', fontFamily: 'monospace', fontSize: '0.85rem' }}>Loading…</div>;

  const safe = sanitise(filter);

  return (
    <div style={{ maxWidth: '600px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Filter size={16} style={{ color: 'var(--accent-blue)' }} /> Notification Filter
      </h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Controls which messages trigger <strong style={{ color: 'var(--text-2)' }}>Discord, Telegram, Gotify, Pushover, and MQTT</strong> notifications.
        Email and push notifications use per-user filters instead.
      </p>

      {msg && (
        <div style={{
          padding: '0.45rem 0.75rem', borderRadius: '0.4rem', fontSize: '0.78rem', fontFamily: 'monospace', marginBottom: '0.75rem',
          color: msg.type === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)',
          background: `color-mix(in srgb, ${msg.type === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)'} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${msg.type === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)'} 30%, transparent)`,
        }}>{msg.text}</div>
      )}

      <div className="pm-card" style={{ marginBottom: '1rem' }}>
        <div className="pm-section-title">Mode</div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setFilter(f => ({ ...sanitise(f), mode: m.id }))}
              style={{
                padding: '0.2rem 0.6rem', borderRadius: '0.75rem', fontSize: '0.75rem',
                cursor: 'pointer', border: '1px solid',
                background: safe.mode === m.id ? 'color-mix(in srgb,var(--accent-blue) 15%,transparent)' : 'var(--bg-3)',
                color: safe.mode === m.id ? 'var(--accent-blue)' : 'var(--text-3)',
                borderColor: safe.mode === m.id ? 'color-mix(in srgb,var(--accent-blue) 35%,transparent)' : 'var(--border)',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {safe.mode === 'groups' && (
        <div className="pm-card" style={{ marginBottom: '1rem' }}>
          <div className="pm-section-title">Groups ({safe.group_ids.length} selected)</div>
          {groups.length === 0
            ? <div style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No groups defined yet.</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {groups.map(g => (
                  <label key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.78rem', cursor: 'pointer', padding: '0.15rem 0.5rem',
                    borderRadius: '0.3rem', border: '1px solid var(--border)', background: 'var(--bg-0)',
                  }}>
                    <input type="checkbox"
                      checked={safe.group_ids.includes(g.id)}
                      onChange={e => {
                        const ids = e.target.checked
                          ? [...safe.group_ids, g.id]
                          : safe.group_ids.filter(x => x !== g.id);
                        setFilter(f => ({ ...sanitise(f), group_ids: ids }));
                      }} />
                    <span style={{ color: g.color }}>{g.name}</span>
                  </label>
                ))}
              </div>
            )
          }
        </div>
      )}

      {safe.mode === 'aliases' && (
        <div className="pm-card" style={{ marginBottom: '1rem' }}>
          <div className="pm-section-title">Aliases ({safe.capcodes.length} selected)</div>
          {aliases.length === 0
            ? <div style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No aliases defined yet.</div>
            : (
              <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {aliases.map(a => (
                  <label key={a.capcode} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.75rem', cursor: 'pointer', padding: '0.15rem 0.4rem',
                    borderRadius: '0.3rem', border: '1px solid var(--border)', background: 'var(--bg-0)',
                    whiteSpace: 'nowrap',
                  }}>
                    <input type="checkbox"
                      checked={safe.capcodes.includes(a.capcode)}
                      onChange={e => {
                        const caps = e.target.checked
                          ? [...safe.capcodes, a.capcode]
                          : safe.capcodes.filter(x => x !== a.capcode);
                        setFilter(f => ({ ...sanitise(f), capcodes: caps }));
                      }} />
                    <span style={{ color: a.color || 'var(--accent-green)' }}>{a.name}</span>
                    <span style={{ color: 'var(--text-3)', fontFamily: 'monospace', fontSize: '0.68rem' }}>{a.capcode}</span>
                  </label>
                ))}
              </div>
            )
          }
        </div>
      )}

      {safe.mode === 'capcodes' && (
        <div className="pm-card" style={{ marginBottom: '1rem' }}>
          <div className="pm-section-title">Capcodes (one per line or comma-separated)</div>
          <textarea className="pm-input" rows={4}
            value={safe.capcodes.join('\n')}
            onChange={e => setFilter(f => ({ ...sanitise(f), capcodes: setListField(e.target.value) }))}
            placeholder="1234567&#10;2345678"
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
      )}

      {safe.mode === 'keywords' && (
        <div className="pm-card" style={{ marginBottom: '1rem' }}>
          <div className="pm-section-title">Keywords (one per line or comma-separated)</div>
          <textarea className="pm-input" rows={4}
            value={safe.keywords.join('\n')}
            onChange={e => setFilter(f => ({ ...sanitise(f), keywords: setListField(e.target.value) }))}
            placeholder="požar&#10;nujna&#10;urgent"
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
      )}

      <button className="pm-btn pm-btn-primary" onClick={save} disabled={saving}>
        <Save size={13} /> {saving ? 'Saving…' : 'Save filter'}
      </button>
    </div>
  );
}
