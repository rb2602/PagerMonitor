import { useState, useEffect } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';

const BASE = import.meta.env.VITE_BACKEND_URL || '';
const tok  = () => localStorage.getItem('pm_token') || '';

const ACTION_META = {
  'alias.save':      { label:'Alias saved',         color:'var(--accent-green)' },
  'alias.delete':    { label:'Alias deleted',        color:'var(--accent-red)'   },
  'group.create':    { label:'Group created',        color:'var(--accent-green)' },
  'group.update':    { label:'Group updated',        color:'var(--accent-blue)'  },
  'group.delete':    { label:'Group deleted',        color:'var(--accent-red)'   },
  'rule.save':       { label:'Rule saved',           color:'var(--accent-green)' },
  'rule.delete':     { label:'Rule deleted',         color:'var(--accent-red)'   },
  'keyword.save':    { label:'Keyword saved',        color:'var(--accent-green)' },
  'keyword.delete':  { label:'Keyword deleted',      color:'var(--accent-red)'   },
  'sdr.start':       { label:'SDR started',          color:'var(--accent-green)' },
  'sdr.stop':        { label:'SDR stopped',          color:'var(--accent-amber)' },
  'sdr.restart':     { label:'SDR restarted',        color:'var(--accent-amber)' },
  'sdr.config':      { label:'SDR config',           color:'var(--accent-blue)'  },
  'db.purge':        { label:'DB purged',            color:'var(--accent-red)'   },
  'db.purge_all':    { label:'DB cleared',           color:'var(--accent-red)'   },
  'user.create':     { label:'User created',         color:'var(--accent-green)' },
  'user.delete':     { label:'User deleted',         color:'var(--accent-red)'   },
  'user.role_change':{ label:'Role changed',         color:'var(--accent-amber)' },
  'site.settings':   { label:'Settings saved',       color:'var(--accent-blue)'  },
  'backup.download': { label:'Backup downloaded',    color:'var(--accent-blue)'  },
  'backup.restore':  { label:'Backup restored',      color:'var(--accent-amber)' },
};

function fmtTime(ts) {
  return new Date(ts).toLocaleString('sl-SI', {
    hour12: false, day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
  });
}

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/admin/audit-log?limit=200`, { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div style={{ maxWidth:'720px' }}>
      <h2 style={{ fontSize:'1rem', fontWeight:700, color:'var(--text-1)', marginBottom:'1rem',
        display:'flex', alignItems:'center', gap:'0.5rem', justifyContent:'space-between' }}>
        <span style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <ClipboardList size={16} style={{ color:'var(--accent-blue)' }}/> Audit Log
        </span>
        <button className="pm-btn" onClick={load}><RefreshCw size={12}/> Refresh</button>
      </h2>

      {loading && (
        <div style={{ color:'var(--text-3)', fontFamily:'monospace', padding:'1rem' }}>Loading…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="pm-card" style={{ color:'var(--text-3)', fontSize:'0.85rem' }}>
          No audit log entries yet. Admin actions are recorded here.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="pm-card" style={{ padding:0, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const meta = ACTION_META[r.action] || { label: r.action, color:'var(--text-3)' };
            return (
              <div key={r.id} style={{
                display:'flex', alignItems:'center', gap:'0.75rem',
                padding:'0.5rem 0.75rem',
                borderBottom: i < rows.length - 1 ? '1px solid var(--border-soft)' : 'none',
                flexWrap:'wrap',
              }}>
                {/* Color dot */}
                <span style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0,
                  background: meta.color }} />

                {/* Friendly label */}
                <span style={{ fontWeight:600, fontSize:'0.78rem', color: meta.color,
                  flexShrink:0, minWidth:'120px' }}>
                  {meta.label}
                </span>

                {/* Username */}
                <span style={{ fontFamily:'monospace', fontSize:'0.75rem',
                  color:'var(--accent-blue)', flexShrink:0, fontWeight:600 }}>
                  {r.username}
                </span>

                {/* Detail */}
                {r.detail && (
                  <span style={{ fontFamily:'monospace', fontSize:'0.72rem',
                    color:'var(--text-3)', wordBreak:'break-all', flex:1 }}>
                    {r.detail}
                  </span>
                )}

                {/* Full timestamp — pushed to the right */}
                <span style={{ fontFamily:'monospace', fontSize:'0.68rem',
                  color:'var(--text-3)', flexShrink:0, marginLeft:'auto', whiteSpace:'nowrap' }}>
                  {fmtTime(r.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
