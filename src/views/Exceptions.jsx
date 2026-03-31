/**
 * Exception Center — Orphan management + Force-Link UI
 * Handles: unmatched sales, unmatched labels, fuzzy-match review
 */
import React, { useState } from 'react';
import { AlertTriangle, Link2, Trash2, Check, X, ChevronDown } from 'lucide-react';

const fmt$ = (n) => `$${Number(n || 0).toFixed(2)}`;

// ── FORCE-LINK MODAL ───────────────────────────────────────────────────────────
const ForceLinkModal = ({ sale, orphanedLabels, onLink, onClose }) => {
  const [selected, setSelected] = useState('');

  const handleLink = () => {
    if (selected === '') return;
    onLink(sale.transactionId, parseInt(selected, 10));
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div className="glass" style={{ width: '100%', maxWidth: 520, padding: 32 }}>
        <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>Force Link Label</h3>
            <p style={{ color: 'var(--silver)', fontSize: 13, marginTop: 6 }}>
              Manually assign a Pirate Ship label to this sale.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Sale info */}
        <div className="glass-sm" style={{ padding: '14px 18px', marginBottom: 20 }}>
          <div className="label" style={{ marginBottom: 8 }}>Sale</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{sale.buyerName}</div>
          <div style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>
            {sale.dateStr} · {fmt$(sale.price)} · {sale.brand}
          </div>
          {sale.itemName && (
            <div style={{ color: 'var(--silver)', fontSize: 12, marginTop: 2 }}>{sale.itemName}</div>
          )}
        </div>

        {/* Label picker */}
        <div style={{ marginBottom: 24 }}>
          <div className="label" style={{ marginBottom: 10 }}>Select Pirate Ship Label</div>
          {orphanedLabels.length === 0 ? (
            <div style={{ color: 'var(--silver)', fontSize: 13, fontStyle: 'italic' }}>
              No unmatched labels available.
            </div>
          ) : (
            <div className="flex flex-col gap-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {orphanedLabels.map((label, idx) => (
                <label
                  key={idx}
                  className={`glass-sm flex items-center gap-3 cursor-pointer ${selected === String(idx) ? 'glass-blue' : ''}`}
                  style={{ padding: '12px 16px' }}
                >
                  <input
                    type="radio"
                    name="label-pick"
                    value={idx}
                    checked={selected === String(idx)}
                    onChange={() => setSelected(String(idx))}
                    style={{ accentColor: 'var(--blue)', flexShrink: 0 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{label.name}</div>
                    <div style={{ color: 'var(--silver)', fontSize: 11, marginTop: 2 }}>
                      {label.date?.toLocaleDateString() ?? 'Unknown date'} ·{' '}
                      <span className="mono">{fmt$(label.cost)}</span>
                      {label.trackingNumber && ` · ${label.trackingNumber}`}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary flex items-center gap-2"
            disabled={selected === '' || orphanedLabels.length === 0}
            style={{ opacity: selected === '' ? 0.5 : 1 }}
            onClick={handleLink}
          >
            <Link2 size={13} /> Apply Link
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ORPHAN SALE ROW ────────────────────────────────────────────────────────────
const OrphanSaleRow = ({ txn, onForceLink, onDelete, onIgnore }) => (
  <div className="ledger-row flex items-center gap-4" style={{ padding: '14px 20px' }}>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3">
        <span style={{ fontWeight: 600, fontSize: 14 }}>{txn.buyerName}</span>
        <span className="badge badge-silver">{txn.category}</span>
        {txn.brand !== 'Unknown' && <span style={{ color: 'var(--silver)', fontSize: 12 }}>{txn.brand}</span>}
      </div>
      <div style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>
        {txn.dateStr} · <span className="mono">{fmt$(txn.price)}</span>
        {txn.itemName && <span> · {txn.itemName}</span>}
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <button className="btn btn-ghost btn-success flex items-center gap-1" onClick={() => onForceLink(txn)}>
        <Link2 size={12} /> Link Label
      </button>
      <button className="btn btn-ghost flex items-center gap-1" onClick={() => onIgnore(txn.transactionId)}>
        <Check size={12} /> Ignore
      </button>
      <button className="btn btn-ghost btn-danger flex items-center gap-1" onClick={() => onDelete(txn.transactionId)}>
        <Trash2 size={12} />
      </button>
    </div>
  </div>
);

// ── ORPHAN LABEL ROW ───────────────────────────────────────────────────────────
const OrphanLabelRow = ({ label, idx }) => (
  <div className="ledger-row flex items-center gap-4" style={{ padding: '14px 20px' }}>
    <div className="flex-1 min-w-0">
      <div style={{ fontWeight: 500, fontSize: 14 }}>{label.name || 'Unknown Name'}</div>
      <div style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>
        {label.date?.toLocaleDateString() ?? 'Unknown date'} ·{' '}
        <span className="mono">{fmt$(label.cost)}</span>
        {label.trackingNumber && <span> · {label.trackingNumber}</span>}
      </div>
    </div>
    <span className="badge badge-yellow">Unmatched Label</span>
  </div>
);

// ── FUZZY MATCH REVIEW ROW ─────────────────────────────────────────────────────
const FuzzyReviewRow = ({ txn, onApprove, onOverride }) => (
  <div className="ledger-row flex items-center gap-4" style={{ padding: '14px 20px' }}>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3">
        <span style={{ fontWeight: 600, fontSize: 14 }}>{txn.buyerName}</span>
        <span className="badge badge-yellow">{Math.round(txn.matchScore * 100)}% match</span>
      </div>
      <div style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>
        {txn.dateStr} · <span className="mono">{fmt$(txn.price)}</span>
        {txn.brand !== 'Unknown' && <span> · {txn.brand}</span>}
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <button className="btn btn-ghost btn-success flex items-center gap-1" onClick={() => onApprove(txn.transactionId)}>
        <Check size={12} /> Approve
      </button>
      <button className="btn btn-ghost flex items-center gap-1" onClick={() => onOverride(txn)}>
        <Link2 size={12} /> Override
      </button>
    </div>
  </div>
);

// ── COLLAPSIBLE SECTION ────────────────────────────────────────────────────────
const Section = ({ title, badge, badgeClass = 'badge-yellow', count, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        className="flex items-center justify-between w-full"
        style={{ padding: '18px 24px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--white)' }}
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
          {count > 0 && <span className={`badge ${badgeClass}`}>{count}</span>}
        </div>
        <ChevronDown
          size={16}
          style={{ color: 'var(--silver)', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
        />
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
};

// ── MAIN EXCEPTION CENTER ──────────────────────────────────────────────────────
export default function Exceptions({ transactions, orphanedLabels, onForceLink, onDeleteSale, onIgnoreSale }) {
  const [forceLinkTarget, setForceLinkTarget] = useState(null);
  const [ignored, setIgnored]                 = useState(new Set());
  const [approved, setApproved]               = useState(new Set());

  const orphanedSales = transactions.filter(
    t => t.isOrphaned && !t.isForceLinked && !ignored.has(t.transactionId)
  );
  const fuzzyMatches = transactions.filter(
    t => !t.isOrphaned && t.matchScore < 1 && !approved.has(t.transactionId)
  );
  const forceLinked = transactions.filter(t => t.isForceLinked);

  const handleApprove = (id) => setApproved(prev => new Set([...prev, id]));
  const handleIgnore  = (id) => {
    setIgnored(prev => new Set([...prev, id]));
    onIgnoreSale?.(id);
  };

  const totalIssues = orphanedSales.length + fuzzyMatches.length + orphanedLabels.length;

  return (
    <div style={{ padding: '32px 40px 120px' }}>
      {/* ── HEADER ── */}
      <div className="flex items-end justify-between" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>Exception Center</h2>
          <p style={{ color: 'var(--silver)', fontSize: 12, marginTop: 2 }}>
            Review and resolve unmatched or uncertain records
          </p>
        </div>
        {totalIssues === 0 && (
          <div className="badge badge-green flex items-center gap-1">
            <Check size={11} /> All Clear
          </div>
        )}
      </div>

      {/* ── OVERVIEW PILLS ── */}
      <div className="flex gap-4" style={{ marginBottom: 28 }}>
        <div className="glass-sm flex items-center gap-3 p-4">
          <AlertTriangle size={16} style={{ color: 'var(--yellow)' }} />
          <div>
            <div className="label" style={{ fontSize: 9 }}>Orphaned Sales</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: orphanedSales.length > 0 ? 'var(--yellow)' : 'var(--green)' }}>
              {orphanedSales.length}
            </div>
          </div>
        </div>
        <div className="glass-sm flex items-center gap-3 p-4">
          <AlertTriangle size={16} style={{ color: 'var(--silver)' }} />
          <div>
            <div className="label" style={{ fontSize: 9 }}>Orphaned Labels</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--silver)' }}>
              {orphanedLabels.length}
            </div>
          </div>
        </div>
        <div className="glass-sm flex items-center gap-3 p-4">
          <AlertTriangle size={16} style={{ color: 'var(--blue)' }} />
          <div>
            <div className="label" style={{ fontSize: 9 }}>Needs Review</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>
              {fuzzyMatches.length}
            </div>
          </div>
        </div>
        <div className="glass-sm flex items-center gap-3 p-4">
          <Link2 size={16} style={{ color: 'var(--green)' }} />
          <div>
            <div className="label" style={{ fontSize: 9 }}>Force-Linked</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>
              {forceLinked.length}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* ── ORPHANED SALES ── */}
        <Section title="Sales Without a Label" count={orphanedSales.length} badgeClass="badge-yellow">
          {orphanedSales.length === 0 ? (
            <div style={{ padding: '24px', color: 'var(--silver)', fontSize: 13 }}>No orphaned sales.</div>
          ) : (
            orphanedSales.map(t => (
              <OrphanSaleRow
                key={t.transactionId}
                txn={t}
                onForceLink={(txn) => setForceLinkTarget(txn)}
                onDelete={onDeleteSale}
                onIgnore={handleIgnore}
              />
            ))
          )}
        </Section>

        {/* ── FUZZY MATCHES NEEDING REVIEW ── */}
        {fuzzyMatches.length > 0 && (
          <Section title="Fuzzy Matches — Needs Review" count={fuzzyMatches.length} badgeClass="badge-blue">
            {fuzzyMatches.map(t => (
              <FuzzyReviewRow
                key={t.transactionId}
                txn={t}
                onApprove={handleApprove}
                onOverride={(txn) => setForceLinkTarget(txn)}
              />
            ))}
          </Section>
        )}

        {/* ── ORPHANED LABELS ── */}
        <Section title="Labels Without a Sale" count={orphanedLabels.length} badgeClass="badge-silver">
          {orphanedLabels.length === 0 ? (
            <div style={{ padding: '24px', color: 'var(--silver)', fontSize: 13 }}>No orphaned labels.</div>
          ) : (
            orphanedLabels.map((label, idx) => (
              <OrphanLabelRow key={idx} label={label} idx={idx} />
            ))
          )}
        </Section>

        {/* ── FORCE-LINKED (resolved) ── */}
        {forceLinked.length > 0 && (
          <Section title="Resolved — Force Linked" count={forceLinked.length} badgeClass="badge-green">
            {forceLinked.map(t => (
              <div key={t.transactionId} className="ledger-row flex items-center gap-4" style={{ padding: '14px 20px' }}>
                <div className="flex-1 min-w-0">
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{t.buyerName}</div>
                  <div style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>
                    {t.dateStr} · <span className="mono">{`$${t.price.toFixed(2)}`}</span> · {t.brand}
                  </div>
                </div>
                <span className="badge badge-blue"><Link2 size={10} /> Force-Linked</span>
              </div>
            ))}
          </Section>
        )}
      </div>

      {/* ── FORCE LINK MODAL ── */}
      {forceLinkTarget && (
        <ForceLinkModal
          sale={forceLinkTarget}
          orphanedLabels={orphanedLabels}
          onLink={(saleId, labelIdx) => onForceLink(saleId, labelIdx)}
          onClose={() => setForceLinkTarget(null)}
        />
      )}
    </div>
  );
}
