/**
 * ARBT — The Arbitrage Ledger
 * App shell with localStorage persistence, incremental stacking, and COGS validation state.
 */
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { LayoutDashboard, BookOpen, AlertTriangle, RefreshCw } from 'lucide-react';

import {
  mergeData, computeStats, buildAnalytics, applyForceLinks,
  parseDepopFile, parsePirateShipFile, dedupeDepopRows, dedupePsRows
} from './engine.js';

import Onboarding  from './views/Onboarding.jsx';
import Dashboard   from './views/Dashboard.jsx';
import Ledger      from './views/Ledger.jsx';
import Exceptions  from './views/Exceptions.jsx';

// ── STORAGE HELPERS ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'arbt_v1';

// Dates survive JSON by converting to/from ISO strings
const serializeTxn   = (t) => ({ ...t, date: t.date?.toISOString() ?? null, dateListed: t.dateListed?.toISOString() ?? null });
const deserializeTxn = (t) => ({ ...t, date: t.date ? new Date(t.date) : null, dateListed: t.dateListed ? new Date(t.dateListed) : null });
const serializeLabel   = (l) => ({ ...l, date: l.date?.toISOString() ?? null });
const deserializeLabel = (l) => ({ ...l, date: l.date ? new Date(l.date) : null });

function saveState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      phase:             s.phase,
      transactions:      s.transactions.map(serializeTxn),
      orphanedLabels:    s.orphanedLabels.map(serializeLabel),
      refundedCount:     s.refundedCount,
      categoryDefaults:  s.categoryDefaults,
      cogsOverrides:     s.cogsOverrides,
      forceLinks:        s.forceLinks,
      deletedIds:        [...s.deletedIds],
      zeroCogsConfirmed: [...s.zeroCogsConfirmed],
      seenIds:           [...s.seenIds],
    }));
  } catch (e) {
    if (e?.name === 'QuotaExceededError') {
      console.warn('ARBT: localStorage quota exceeded — history may not persist.');
    }
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      phase:             d.phase ?? 'onboarding',
      transactions:      (d.transactions      ?? []).map(deserializeTxn),
      orphanedLabels:    (d.orphanedLabels    ?? []).map(deserializeLabel),
      refundedCount:     d.refundedCount      ?? 0,
      categoryDefaults:  d.categoryDefaults   ?? {},
      cogsOverrides:     d.cogsOverrides      ?? {},
      forceLinks:        d.forceLinks         ?? {},
      deletedIds:        new Set(d.deletedIds        ?? []),
      zeroCogsConfirmed: new Set(d.zeroCogsConfirmed ?? []),
      seenIds:           new Set(d.seenIds           ?? []),
    };
  } catch { return null; }
}

const EMPTY_BASE = { 
  transactions: [], 
  orphanedLabels: [], 
  orphanedSales: [], 
  refundedCount: 0,
  rawDepop: [], 
  rawPs: [] 
};
// Called once on mount — avoids repeated localStorage reads
function getInitialState() {
  const s = loadState();
  if (!s) return {
  phase: 'onboarding', baseResult: EMPTY_BASE,
  categoryDefaults: { 'Accessories': 0 }, // Add it here
  cogsOverrides: {}, forceLinks: {},
  deletedIds: new Set(), zeroCogsConfirmed: new Set(), seenIds: new Set(),
};
  return {
    phase: s.phase,
    baseResult: {
      transactions:   s.transactions,
      orphanedLabels: s.orphanedLabels,
      orphanedSales:  [],
      refundedCount:  s.refundedCount,
    },
    categoryDefaults:  s.categoryDefaults,
    cogsOverrides:     s.cogsOverrides,
    forceLinks:        s.forceLinks,
    deletedIds:        s.deletedIds,
    zeroCogsConfirmed: s.zeroCogsConfirmed,
    seenIds:           s.seenIds,
  };
}

// ── FLOATING DOCK ──────────────────────────────────────────────────────────────
const Dock = ({ view, setView, orphanCount, onReset }) => {
  const items = [
    { id: 'dashboard',  label: 'Dashboard',  Icon: LayoutDashboard },
    { id: 'ledger',     label: 'The Ledger',  Icon: BookOpen },
    { id: 'exceptions', label: 'Exceptions',  Icon: AlertTriangle, badge: orphanCount },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px',
      background: 'rgba(15,15,15,0.88)',
      backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
      border: '1px solid rgba(255,255,255,0.09)', borderRadius: 22,
      boxShadow: '0 20px 60px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.04)',
      zIndex: 150,
    }}>
      {items.map(({ id, label, Icon, badge }) => (
        <button key={id} className={`dock-btn ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <Icon size={18} />
            {badge > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -8,
                background: 'var(--yellow)', color: '#000',
                borderRadius: '50%', width: 14, height: 14,
                fontSize: 8, fontWeight: 700, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
              }}>
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </div>
          {label}
        </button>
      ))}
      <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.07)', margin: '0 4px' }} />
      <button className="dock-btn" onClick={onReset} title="Reset all data">
        <RefreshCw size={16} /> Reset
      </button>
    </div>
  );
};

// ── IMPORT MORE MODAL ──────────────────────────────────────────────────────────
const ImportMoreModal = ({ onClose, onImport }) => {
  const depopRef = useRef();
  const psRef    = useRef();
  const [status, setStatus] = useState('');

  const handle = async () => {
    const dFile = depopRef.current?.files[0];
    const pFile = psRef.current?.files[0];
    if (!dFile && !pFile) { setStatus('Select at least one file.'); return; }
    setStatus('Parsing...');
    try {
      const [dr, pr] = await Promise.all([
        dFile ? parseDepopFile(dFile)      : Promise.resolve([]),
        pFile ? parsePirateShipFile(pFile) : Promise.resolve([]),
      ]);
      onImport(dr, pr);
      onClose();
    } catch (e) { setStatus(`Error: ${e.message}`); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="glass" style={{ width: '100%', maxWidth: 440, padding: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Import Additional Data</h3>
        <p style={{ color: 'var(--silver)', fontSize: 13, marginBottom: 24 }}>
          Duplicate Transaction IDs are automatically skipped — safe to upload overlapping windows.
        </p>
        <div className="flex flex-col gap-4" style={{ marginBottom: 24 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Depop CSV (optional)</div>
            <input ref={depopRef} type="file" accept=".csv" className="input-glass" style={{ padding: 8, cursor: 'pointer' }} />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Pirate Ship CSV/XLSX (optional)</div>
            <input ref={psRef} type="file" accept=".csv,.xlsx,.xls" className="input-glass" style={{ padding: 8, cursor: 'pointer' }} />
          </div>
        </div>
        {status && <p style={{ color: 'var(--yellow)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 16 }}>{status}</p>}
        <div className="flex justify-end gap-3">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handle}>Import & Stack</button>
        </div>
      </div>
    </div>
  );
};

// ── MAIN APP ───────────────────────────────────────────────────────────────────
export default function App() {
  // Lazy-initialize all state from localStorage on first mount
  const [init] = useState(getInitialState);

  const [phase,            setPhase]           = useState(init.phase);
  const [baseResult,       setBaseResult]       = useState(init.baseResult);
  const [categoryDefaults, setCategoryDefaults] = useState(init.categoryDefaults);
  const [cogsOverrides,    setCogsOverrides]    = useState(init.cogsOverrides);
  const [forceLinks,       setForceLinks]       = useState(init.forceLinks);
  const [deletedIds,       setDeletedIds]       = useState(init.deletedIds);
  const [zeroCogsConfirmed, setZeroCogsConfirmed] = useState(init.zeroCogsConfirmed);
  const [seenIds,          setSeenIds]          = useState(init.seenIds);
  const [view,             setView]             = useState('dashboard');
  const [showImportMore,   setShowImportMore]   = useState(false);

  // ── Auto-save to localStorage whenever any persistent state changes ──
  useEffect(() => {
    if (phase !== 'app') return; // don't write during onboarding
    saveState({
      phase,
      transactions:      baseResult.transactions,
      orphanedLabels:    baseResult.orphanedLabels,
      refundedCount:     baseResult.refundedCount,
      categoryDefaults,
      cogsOverrides,
      forceLinks,
      deletedIds,
      zeroCogsConfirmed,
      seenIds,
    });
  }, [phase, baseResult, categoryDefaults, cogsOverrides, forceLinks, deletedIds, zeroCogsConfirmed, seenIds]);

  // ── Onboarding complete ──
  const handleOnboardingComplete = useCallback(({ mergeResult, categoryDefaults: cd, cogsOverrides: co }) => {
    setBaseResult(mergeResult);
    setCategoryDefaults(cd);
    setCogsOverrides(co);
    setSeenIds(new Set(mergeResult.transactions.map(t => t.transactionId)));
    setPhase('app');
  }, []);

  // ── Import more — Stacks raw data and reparses everything to fix matching ──
  const handleImportMore = useCallback((newDepop, newPs) => {
    setBaseResult(prev => {
      // 1. Combine old raw data with new raw data
      // Note: We'll assume your engine has dedupeDepopRows and dedupePsRows defined
      const updatedDepopRaw = dedupeDepopRows(prev.rawDepop || [], newDepop);
      const updatedPsRaw = dedupePsRows(prev.rawPs || [], newPs);

      // 2. Re-run the merge logic on the entire combined dataset
      // This allows 'old' sales to find matches in 'new' Pirate Ship files
      const result = mergeData(updatedDepopRaw, updatedPsRaw);

      return {
        ...result,
        rawDepop: updatedDepopRaw, // Keep the ingredients for the next upload
        rawPs: updatedPsRaw
      };
    });

    // 3. Update the seen IDs list to prevent internal UI duplicates
    setSeenIds(prev => {
      const next = new Set(prev);
      newDepop.forEach(r => {
        const tid = r['Transaction ID']?.trim();
        if (tid) next.add(tid);
      });
      return next;
    });
  }, []);

  // ── Reset — clears storage and reloads ──
  const handleReset = useCallback(() => {
    if (window.confirm('Reset all data and start over? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  }, []);

  // ── COGS override ──
  const handleCogsOverride = useCallback((txnId, val) => {
    setCogsOverrides(prev => ({ ...prev, [txnId]: val }));
    // If user sets a non-zero value, remove from confirmed-free set
    if (parseFloat(val) !== 0) {
      setZeroCogsConfirmed(prev => { const next = new Set(prev); next.delete(txnId); return next; });
    }
  }, []);

  // ── Confirm $0 COGS is intentional (free/gift) ──
  const handleConfirmFree = useCallback((txnId) => {
    setZeroCogsConfirmed(prev => new Set([...prev, txnId]));
  }, []);

  // ── Force-link ──
  const handleForceLink = useCallback((txnId, labelFp) => {
  setForceLinks(prev => ({ ...prev, [txnId]: labelFp }));
}, []);

  // ── Delete ──
  const handleDeleteSale = useCallback((txnId) => {
    setDeletedIds(prev => new Set([...prev, txnId]));
  }, []);

  // ── Derived transactions (force-links + deletes + COGS enrichment) ──
  const transactions = useMemo(() => {
    const withLinks = applyForceLinks(baseResult.transactions, baseResult.orphanedLabels, forceLinks);
    const active    = withLinks.filter(t => !deletedIds.has(t.transactionId));
    return computeStats(active, categoryDefaults, cogsOverrides);
  }, [baseResult, forceLinks, deletedIds, categoryDefaults, cogsOverrides]);

  // ── Remaining orphaned labels after force-links ──
  const orphanedLabels = useMemo(() => {
  const usedFps = new Set(Object.values(forceLinks));
  return baseResult.orphanedLabels.filter((label) => !usedFps.has(label._fp));
}, [baseResult.orphanedLabels, forceLinks]);

  const analytics   = useMemo(() => buildAnalytics(transactions), [transactions]);
  const orphanCount = transactions.filter(t => t.isOrphaned).length;

  // ── ONBOARDING ──
  if (phase === 'onboarding') {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // ── MAIN APP ──
  return (
    <div className="grain" style={{ minHeight: '100vh' }}>
      {view === 'dashboard' && (
        <Dashboard transactions={transactions} analytics={analytics} orphanCount={orphanCount} />
      )}
      {view === 'ledger' && (
        <Ledger
          transactions={transactions}
          onOverride={handleCogsOverride}
          onConfirmFree={handleConfirmFree}
          zeroCogsConfirmed={zeroCogsConfirmed}
          onImportMore={() => setShowImportMore(true)}
        />
      )}
      {view === 'exceptions' && (
        <Exceptions
          transactions={transactions}
          orphanedLabels={orphanedLabels}
          onForceLink={handleForceLink}
          onDeleteSale={handleDeleteSale}
        />
      )}

      <Dock view={view} setView={setView} orphanCount={orphanCount} onReset={handleReset} />

      {showImportMore && (
        <ImportMoreModal
          onClose={() => setShowImportMore(false)}
          onImport={handleImportMore}
        />
      )}
    </div>
  );
}
