/**
 * The Ledger — Full transaction table
 * Features: Sort, COGS override (click-to-edit), shipping spread, status badges, zero-COGS warnings
 */
import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Pencil, AlertTriangle } from 'lucide-react';

const fmt$ = (n) => `$${Number(n || 0).toFixed(2)}`;
const sign$ = (n) => `${n >= 0 ? '+' : ''}${fmt$(n)}`;

// ── SORT HEADER ────────────────────────────────────────────────────────────────
const SortTh = ({ col, label, sort, onSort }) => {
  const active = sort.col === col;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon size={11} style={{ color: active ? 'var(--blue)' : 'var(--border)', flexShrink: 0 }} />
      </div>
    </th>
  );
};

// ── INLINE COGS EDITOR ─────────────────────────────────────────────────────────
// Three states:
//   1. cogs > 0                          → normal display (estimated or overridden)
//   2. cogs === 0, not confirmed          → bright red warning with action buttons
//   3. cogs === 0, confirmed free/gift    → muted FREE badge
const CogsCell = ({ txn, onOverride, onConfirmFree, zeroCogsConfirmed }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState('');

  const isZero      = txn.cogs === 0;
  const isConfirmed = zeroCogsConfirmed?.has(txn.transactionId);

  const start = () => { setVal(txn.cogs); setEditing(true); };
  const commit = () => {
    const n = parseFloat(val);
    if (!isNaN(n)) onOverride(txn.transactionId, n);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="input-glass"
          style={{ width: 70 }}
          value={val}
          step="0.01"
          min="0"
          autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        />
      </div>
    );
  }

  // State 2: zero COGS, unconfirmed — high-contrast warning
  if (isZero && !isConfirmed) {
    return (
      <div style={{
        background: 'rgba(239,68,68,0.15)',
        border: '1px solid rgba(239,68,68,0.5)',
        borderRadius: 8,
        padding: '4px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 140,
      }}>
        <div className="flex items-center gap-1" style={{ color: '#EF4444' }}>
          <AlertTriangle size={10} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>
            $0.00 COGS
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onConfirmFree(txn.transactionId)}
            style={{
              background: 'rgba(239,68,68,0.2)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 4,
              color: '#FCA5A5',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '2px 5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Free/Gift ✓
          </button>
          <button
            onClick={start}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: 'var(--silver)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '2px 5px',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  // State 3: zero COGS, confirmed free/gift — muted badge
  if (isZero && isConfirmed) {
    return (
      <div
        className="flex items-center gap-2"
        style={{ cursor: 'pointer' }}
        onClick={start}
        title="Click to set COGS"
      >
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--silver)',
          background: 'rgba(160,160,160,0.1)',
          border: '1px solid rgba(160,160,160,0.2)',
          borderRadius: 4,
          padding: '1px 5px',
        }}>
          FREE
        </span>
        <Pencil size={10} style={{ color: 'var(--border)', flexShrink: 0 }} />
      </div>
    );
  }

  // State 1: normal — Red Alert (Zero), estimated (gray), or overridden (blue)
  return (
    <div
      className="flex items-center gap-2"
      style={{ cursor: 'pointer' }}
      onClick={start}
      title="Click to override COGS"
    >
      <span className={`mono ${
        txn.cogs === 0 && !txn.isCogsOverridden 
          ? 'text-red-500 font-bold animate-pulse' // The "Red Alert" for missing data
          : txn.isCogsOverridden 
            ? 'cogs-overridden' 
            : 'cogs-estimated'
      }`}>
        {fmt$(txn.cogs)}
      </span>
      <Pencil size={10} style={{ color: 'var(--border)', flexShrink: 0 }} />
    </div>
  );
};

// ── MAIN LEDGER ────────────────────────────────────────────────────────────────
export default function Ledger({ transactions, onOverride, onConfirmFree, zeroCogsConfirmed, onImportMore }) {
  const [sort, setSort]         = useState({ col: 'date', dir: 'desc' });
  const [filter, setFilter]     = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const categories = useMemo(() => {
    const s = new Set(transactions.map(t => t.category));
    return ['all', ...s];
  }, [transactions]);

  // Count unresolved zero-COGS items
  const unresolvedZero = useMemo(() =>
    transactions.filter(t => t.cogs === 0 && !zeroCogsConfirmed?.has(t.transactionId)).length,
  [transactions, zeroCogsConfirmed]);

  const sorted = useMemo(() => {
    let rows = [...transactions];

    // Text filter
    if (filter.trim()) {
      const q = filter.toLowerCase();
      rows = rows.filter(t =>
        t.buyerName.toLowerCase().includes(q) ||
        t.brand.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.itemName || '').toLowerCase().includes(q)
      );
    }

    // Category filter
    if (catFilter !== 'all') rows = rows.filter(t => t.category === catFilter);

    // Sort
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = a[sort.col] ?? 0;
      const vb = b[sort.col] ?? 0;
      if (va instanceof Date && vb instanceof Date) return (va - vb) * dir;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });

    return rows;
  }, [transactions, sort, filter, catFilter]);

  const handleSort = (col) => {
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };

  // Totals
  const totals = useMemo(() => ({
    revenue:       sorted.reduce((s, t) => s + t.price, 0),
    fees:          sorted.reduce((s, t) => s + t.totalFees, 0),
    buyerShipping: sorted.reduce((s, t) => s + t.buyerShipping, 0),
    shipping:      sorted.reduce((s, t) => s + t.actualShipping, 0),
    spread:        sorted.reduce((s, t) => s + t.shippingSpread, 0),
    cogs:          sorted.reduce((s, t) => s + t.cogs, 0),
    profit:        sorted.reduce((s, t) => s + t.netProfit, 0),
  }), [sorted]);

  return (
    <div style={{ padding: '32px 40px 120px' }}>
      {/* ── ZERO COGS BANNER ── */}
      {unresolvedZero > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 12,
          padding: '12px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertTriangle size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#FCA5A5' }}>
            <strong style={{ color: '#EF4444' }}>{unresolvedZero}</strong> transaction{unresolvedZero !== 1 ? 's' : ''} with{' '}
            <strong style={{ color: '#EF4444' }}>$0.00 COGS</strong> — confirm as Free/Gift or enter a cost.
          </span>
        </div>
      )}

      {/* ── TOOLBAR ── */}
      <div className="flex items-center justify-between gap-4" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>The Ledger</h2>
          <p style={{ color: 'var(--silver)', fontSize: 12, marginTop: 2 }}>
            {sorted.length} of {transactions.length} transactions
            {unresolvedZero > 0 && (
              <span style={{
                marginLeft: 10,
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6,
                padding: '1px 7px',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: '#EF4444',
                fontWeight: 700,
              }}>
                {unresolvedZero} COGS missing
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="input-glass"
            style={{ width: 160 }}
          >
            {categories.map(c => (
              <option key={c} value={c} style={{ background: '#111' }}>
                {c === 'all' ? 'All Categories' : c}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input-glass"
            placeholder="Search brand, buyer, item..."
            style={{ width: 240 }}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button className="btn" onClick={onImportMore}>+ Import More</button>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead style={{ background: 'rgba(0,0,0,0.3)' }}>
              <tr>
                <SortTh col="date"           label="Date"        sort={sort} onSort={handleSort} />
                <SortTh col="brand"          label="Brand"       sort={sort} onSort={handleSort} />
                <th>Category</th>
                <th>Buyer</th>
                <th style={{ maxWidth: 180 }}>Item</th>
                <SortTh col="price"          label="Price"       sort={sort} onSort={handleSort} />
                <th>Buyer Ship</th>
                <th>Actual Ship</th>
                <SortTh col="shippingSpread" label="Spread"      sort={sort} onSort={handleSort} />
                <th>Fees</th>
                <th>COGS</th>
                <SortTh col="netProfit"      label="Net Profit"  sort={sort} onSort={handleSort} />
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => {
                const isUnresolvedZero = t.cogs === 0 && !zeroCogsConfirmed?.has(t.transactionId);
                return (
                  <tr
                    key={t.transactionId}
                    className="ledger-row"
                    style={isUnresolvedZero ? {
                      background: 'rgba(239,68,68,0.06)',
                      borderLeft: '2px solid rgba(239,68,68,0.5)',
                    } : undefined}
                  >
                    <td className="mono" style={{ color: 'var(--silver)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {t.dateStr || '—'}
                    </td>
                    <td style={{ fontWeight: 500, maxWidth: 100 }} className="truncate">{t.brand}</td>
                    <td>
                      <span className="badge badge-silver">{t.category}</span>
                    </td>
                    <td style={{ color: 'var(--silver)', maxWidth: 120 }} className="truncate">{t.buyerName}</td>
                    <td style={{ color: 'var(--silver)', maxWidth: 160 }} className="truncate">{t.itemName || '—'}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{fmt$(t.price)}</td>
                    <td className="mono" style={{ color: 'var(--silver)' }}>{t.buyerShipping > 0 ? fmt$(t.buyerShipping) : '—'}</td>
                    <td className="mono" style={{ color: t.isOrphaned ? 'var(--red)' : 'var(--silver)' }}>
                      {t.isOrphaned ? 'MISSING' : fmt$(t.actualShipping)}
                    </td>
                    <td className="mono" style={{
                      fontWeight: 600,
                      color: t.shippingSpread > 0 ? 'var(--green)' : t.shippingSpread < 0 ? 'var(--red)' : 'var(--silver)',
                    }}>
                      {t.buyerShipping > 0 ? sign$(t.shippingSpread) : '—'}
                    </td>
                    <td className="mono" style={{ color: 'var(--silver)' }}>{fmt$(t.totalFees)}</td>
                    <td>
                      <CogsCell
                        txn={t}
                        onOverride={onOverride}
                        onConfirmFree={onConfirmFree}
                        zeroCogsConfirmed={zeroCogsConfirmed}
                      />
                    </td>
                    <td className="mono" style={{
                      fontWeight: 700,
                      color: t.netProfit >= 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                      {sign$(t.netProfit)}
                    </td>
                    <td>
                      {t.isOrphaned && !t.isForceLinked
                        ? <span className="badge badge-yellow">No Label</span>
                        : t.isForceLinked
                        ? <span className="badge badge-blue">Force-Linked</span>
                        : t.matchScore < 1
                        ? <span className="badge badge-silver">{Math.round(t.matchScore * 100)}% match</span>
                        : <span className="badge badge-green">Matched</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* ── TOTALS ROW ── */}
            {sorted.length > 0 && (
              <tfoot>
                <tr style={{ background: 'rgba(56,189,248,0.05)', borderTop: '1px solid var(--border-blue)' }}>
                  <td colSpan={5} style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--silver)', letterSpacing: '0.1em' }}>
                    TOTALS ({sorted.length} items)
                  </td>
                  <td className="mono" style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--blue)' }}>{fmt$(totals.revenue)}</td>
                  <td className="mono" style={{ padding: '12px 16px', color: 'var(--silver)' }}>{fmt$(totals.buyerShipping)}</td>
                  <td className="mono" style={{ padding: '12px 16px', color: 'var(--silver)' }}>{fmt$(totals.shipping)}</td>
                  <td className="mono" style={{ padding: '12px 16px', fontWeight: 600, color: totals.spread >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {sign$(totals.spread)}
                  </td>
                  <td className="mono" style={{ padding: '12px 16px', color: 'var(--silver)' }}>{fmt$(totals.fees)}</td>
                  <td className="mono" style={{ padding: '12px 16px', color: 'var(--silver)' }}>{fmt$(totals.cogs)}</td>
                  <td className="mono" style={{ padding: '12px 16px', fontWeight: 700, color: totals.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {sign$(totals.profit)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {sorted.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--silver)' }}>
            No transactions match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
