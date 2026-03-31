/**
 * Onboarding — 3-step COGS setup wizard
 * Step 0: Upload files
 * Step 1: Set Default COGS per Category
 * Step 2: Review inventory table + manual overrides
 */
import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, ChevronRight, Check, AlertCircle, Package, AlertTriangle } from 'lucide-react';
import { parseDepopFile, parsePirateShipFile, getUniqueCategories, mergeData } from '../engine.js';

// ── DRAG-DROP UPLOAD ZONE ──────────────────────────────────────────────────────
const UploadZone = ({ label, hint, accept, file, onFile, icon: Icon }) => {
  const [drag, setDrag] = useState(false);
  const ref = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      className={`upload-zone flex flex-col items-center justify-center gap-3 p-8 cursor-pointer ${drag ? 'drag-over' : ''}`}
      style={{ minHeight: 180 }}
      onClick={() => ref.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-full" style={{ background: 'var(--green-dim)', border: '1px solid rgba(52,211,153,0.3)' }}>
            <Check size={22} style={{ color: 'var(--green)' }} />
          </div>
          <div className="text-center">
            <p style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{file.name}</p>
            <p style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>Click to replace</p>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-full" style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)' }}>
            <Icon size={22} style={{ color: 'var(--silver)' }} />
          </div>
          <div className="text-center">
            <p style={{ color: 'var(--white)', fontSize: 14, fontWeight: 500 }}>{label}</p>
            <p style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>{hint}</p>
          </div>
        </>
      )}
    </div>
  );
};

// ── STEP 0: FILE UPLOAD ────────────────────────────────────────────────────────
const StepUpload = ({ onComplete }) => {
  const [depopFile, setDepopFile]   = useState(null);
  const [psFile,    setPsFile]      = useState(null);
  const [loading,   setLoading]     = useState(false);
  const [error,     setError]       = useState('');

  const handleParse = async () => {
    if (!depopFile || !psFile) { setError('Select both files to continue.'); return; }
    setLoading(true); setError('');
    try {
      const [depopRows, psRows] = await Promise.all([
        parseDepopFile(depopFile),
        parsePirateShipFile(psFile),
      ]);
      onComplete({ depopRows, psRows });
    } catch (e) {
      setError(`Parse error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>Import Your Data</h2>
        <p style={{ color: 'var(--silver)', marginTop: 8, fontSize: 14 }}>
          Upload your Depop sales export (CSV) and Pirate Ship billing export (CSV or XLSX).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="flex flex-col gap-3">
          <div className="label">Depop Sales Export</div>
          <UploadZone
            label="Drop Depop CSV here"
            hint="From Seller Hub → Sold Items → Export"
            accept=".csv"
            file={depopFile}
            onFile={setDepopFile}
            icon={FileText}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="label">Pirate Ship Export</div>
          <UploadZone
            label="Drop Pirate Ship file here"
            hint="CSV or XLSX from Pirate Ship billing"
            accept=".csv,.xlsx,.xls"
            file={psFile}
            onFile={setPsFile}
            icon={Package}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 glass-sm" style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'var(--red-dim)' }}>
          <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={handleParse}
          disabled={loading || !depopFile || !psFile}
          style={{ opacity: (!depopFile || !psFile) ? 0.4 : 1 }}
        >
          {loading ? 'Parsing...' : 'Parse Files'}
          {!loading && <ChevronRight size={14} />}
        </button>
      </div>
    </div>
  );
};

// ── BASE PRESETS (always shown; Accessories guaranteed) ───────────────────────
const BASE_PRESETS = {
  Tops: 8, Bottoms: 10, Dresses: 12, Outerwear: 20,
  Shoes: 15, Accessories: 5, Bags: 12, Swimwear: 8, Other: 8,
};

// ── CAT ROW — defined at module level to prevent remount on each keystroke ────
// If defined inside StepCategoryDefaults, React treats it as a NEW component
// type on every render, unmounting the input and losing focus.
const CatRow = ({ cat, isUnknown, value, onPreset, onChange }) => (
  <div
    className="glass-sm flex items-center justify-between p-4"
    style={isUnknown ? { borderColor: 'rgba(251,191,36,0.35)', background: 'var(--yellow-dim)' } : {}}
  >
    <div className="flex items-center gap-3">
      <div className={`badge ${isUnknown ? 'badge-yellow' : 'badge-silver'}`}>{cat}</div>
      {isUnknown && (
        <span style={{ fontSize: 10, color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>
          NEW — required
        </span>
      )}
    </div>
    <div className="flex items-center gap-3">
      {BASE_PRESETS[cat] && (value === '' || value === undefined) && (
        <button className="btn btn-ghost" onClick={() => onPreset(cat)} style={{ fontSize: 10 }}>
          Use ${BASE_PRESETS[cat]}
        </button>
      )}
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--silver)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>$</span>
        <input
          type="number"
          className="input-glass"
          style={{ width: 90, textAlign: 'right', borderColor: isUnknown && !value ? 'rgba(251,191,36,0.5)' : undefined }}
          placeholder="0.00"
          step="0.01"
          min="0"
          value={value ?? ''}
          onChange={e => onChange(cat, e.target.value)}
        />
      </div>
    </div>
  </div>
);

// ── STEP 1: CATEGORY COGS DEFAULTS ────────────────────────────────────────────
const StepCategoryDefaults = ({ categories, defaults, onChange, onNext }) => {
  const unknownCats    = categories.filter(c => !(c in BASE_PRESETS));
  const knownCats      = categories.filter(c =>  (c in BASE_PRESETS));
  const unknownMissing = unknownCats.filter(c => defaults[c] === '' || defaults[c] === undefined);
  const canProceed     = unknownMissing.length === 0;

  const handlePreset = (cat) => onChange(cat, BASE_PRESETS[cat]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>Set Default COGS</h2>
        <p style={{ color: 'var(--silver)', marginTop: 8, fontSize: 14 }}>
          Enter your average cost-of-goods per category. These are the baseline — override individual items on the next step.
        </p>
      </div>

      {/* ── Unknown categories — must fill before continuing ── */}
      {unknownCats.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <AlertCircle size={14} style={{ color: 'var(--yellow)' }} />
            <span style={{ fontSize: 12, color: 'var(--yellow)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              {unknownCats.length} NEW CATEGOR{unknownCats.length > 1 ? 'IES' : 'Y'} DETECTED — SET COGS TO CONTINUE
            </span>
          </div>
          {unknownCats.map(cat => (
            <CatRow key={cat} cat={cat} isUnknown value={defaults[cat]} onPreset={handlePreset} onChange={onChange} />
          ))}
        </div>
      )}

      {/* ── Known categories ── */}
      {knownCats.length > 0 && (
        <div className="flex flex-col gap-2">
          {unknownCats.length > 0 && (
            <div className="label" style={{ marginBottom: 4 }}>Standard Categories</div>
          )}
          {knownCats.map(cat => (
            <CatRow key={cat} cat={cat} isUnknown={false} value={defaults[cat]} onPreset={handlePreset} onChange={onChange} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p style={{ color: 'var(--silver)', fontSize: 12 }}>
            {Object.keys(defaults).filter(k => defaults[k] !== '' && defaults[k] !== undefined).length} of {categories.length} set
          </p>
          {!canProceed && (
            <p style={{ color: 'var(--yellow)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              Set COGS for {unknownMissing.join(', ')} to continue
            </p>
          )}
        </div>
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={onNext}
          disabled={!canProceed}
          style={{ opacity: canProceed ? 1 : 0.4, cursor: canProceed ? 'pointer' : 'not-allowed' }}
        >
          Review Inventory <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

// ── STEP 2: INVENTORY REVIEW ───────────────────────────────────────────────────
const StepReview = ({ mergeResult, categories, categoryDefaults, cogsOverrides, onOverride, onComplete }) => {
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal]     = useState('');

  const { transactions, orphanedSales, refundedCount } = mergeResult;

  const startEdit = (t) => {
    setEditingId(t.transactionId);
    setEditVal(
      cogsOverrides[t.transactionId] !== undefined
        ? cogsOverrides[t.transactionId]
        : (categoryDefaults[t.category] ?? 0)
    );
  };

  const commitEdit = (id) => {
    const v = parseFloat(editVal);
    if (!isNaN(v)) onOverride(id, v);
    setEditingId(null);
  };

  const zeroCogCount = transactions.filter(t => {
    const cogs = cogsOverrides[t.transactionId] !== undefined
      ? cogsOverrides[t.transactionId]
      : (categoryDefaults[t.category] ?? 0);
    return cogs === 0;
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>Review & Override</h2>
        <p style={{ color: 'var(--silver)', marginTop: 8, fontSize: 14 }}>
          Click any COGS value to override it for that specific item. Gray = estimated, Blue = manually set.
        </p>
      </div>

      {/* Stats row */}
      <div className="flex gap-4">
        <div className="glass-sm flex-1 p-4">
          <div className="label">Total Items</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--blue)', marginTop: 8 }}>
            {transactions.length}
          </div>
        </div>
        <div className="glass-sm flex-1 p-4">
          <div className="label">Unmatched Labels</div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: orphanedSales.length > 0 ? 'var(--yellow)' : 'var(--green)', marginTop: 8 }}>
            {orphanedSales.length}
          </div>
        </div>
        {refundedCount > 0 && (
          <div className="glass-sm flex-1 p-4">
            <div className="label">Refunds Excluded</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--silver)', marginTop: 8 }}>
              {refundedCount}
            </div>
          </div>
        )}
      </div>

      {/* Zero COGS warning banner */}
      {zeroCogCount > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 10,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertTriangle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#FCA5A5' }}>
            <strong style={{ color: '#EF4444' }}>{zeroCogCount}</strong> item{zeroCogCount !== 1 ? 's' : ''} have{' '}
            <strong style={{ color: '#EF4444' }}>$0.00 COGS</strong> — click the cell to set a cost, or confirm as free/gift in the Ledger after import.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="glass" style={{ padding: 0, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#111' }}>
            <tr>
              {['Brand', 'Category', 'Item', 'Price', 'Est. COGS', 'Est. Profit'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => {
              const cogs = cogsOverrides[t.transactionId] !== undefined
                ? cogsOverrides[t.transactionId]
                : (categoryDefaults[t.category] ?? 0);
              const estProfit = t.price - t.totalFees - (t.actualShipping || 0) - cogs;
              const isOverridden = cogsOverrides[t.transactionId] !== undefined;
              const isEditing = editingId === t.transactionId;
              const isZeroCogs = cogs === 0;

              return (
                <tr
                  key={t.transactionId}
                  className="ledger-row"
                  style={isZeroCogs && !isEditing ? {
                    background: 'rgba(239,68,68,0.06)',
                    borderLeft: '2px solid rgba(239,68,68,0.45)',
                  } : undefined}
                >
                  <td style={{ fontWeight: 500, maxWidth: 120 }} className="truncate">{t.brand}</td>
                  <td><span className="badge badge-silver">{t.category}</span></td>
                  <td style={{ color: 'var(--silver)', maxWidth: 200 }} className="truncate">{t.itemName || '—'}</td>
                  <td className="mono" style={{ color: 'var(--white)' }}>${t.price.toFixed(2)}</td>
                  <td
                    className="mono"
                    style={{ cursor: 'pointer', minWidth: 90 }}
                    onClick={() => !isEditing && startEdit(t)}
                  >
                    {isEditing ? (
                      <input
                        type="number"
                        className="input-glass"
                        style={{ width: 70 }}
                        value={editVal}
                        step="0.01"
                        min="0"
                        autoFocus
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitEdit(t.transactionId)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(t.transactionId); if (e.key === 'Escape') setEditingId(null); }}
                      />
                    ) : isZeroCogs ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444' }}>
                        <AlertTriangle size={10} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>$0.00</span>
                      </span>
                    ) : (
                      <span className={isOverridden ? 'cogs-overridden' : 'cogs-estimated'}>
                        ${Number(cogs).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="mono" style={{ color: estProfit >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {estProfit >= 0 ? '+' : ''}${estProfit.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button className="btn btn-primary flex items-center gap-2" onClick={onComplete}>
          <Check size={14} /> Enter Dashboard
        </button>
      </div>
    </div>
  );
};

// ── STEP PROGRESS BAR ──────────────────────────────────────────────────────────
const StepBar = ({ step }) => {
  const steps = ['Import Data', 'COGS Defaults', 'Review & Override'];
  return (
    <div className="flex items-center gap-4">
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-2">
            <div
              className={`step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}
            />
            <span style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: i === step ? 'var(--white)' : i < step ? 'var(--green)' : 'var(--silver)',
              letterSpacing: '0.06em',
            }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1" style={{ height: 1, background: i < step ? 'var(--green)' : 'var(--border)', minWidth: 32 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ── MAIN ONBOARDING COMPONENT ──────────────────────────────────────────────────
export default function Onboarding({ onComplete }) {
  const [step,            setStep]           = useState(0);
  const [depopRows,       setDepopRows]      = useState([]);
  const [psRows,          setPsRows]         = useState([]);
  const [mergeResult,     setMergeResult]    = useState(null);
  const [categoryDefaults, setCategoryDefaults] = useState({});
  const [cogsOverrides,   setCogsOverrides]  = useState({});
  const categories = depopRows.length ? getUniqueCategories(depopRows) : [];

  const handleFilesReady = ({ depopRows: dr, psRows: pr }) => {
    setDepopRows(dr); setPsRows(pr);
    const result = mergeData(dr, pr);
    setMergeResult(result);
    setStep(1);
  };

  // Store raw string while typing so "12." doesn't get coerced mid-entry
  const handleDefaultChange = (cat, val) => {
    setCategoryDefaults(prev => ({ ...prev, [cat]: val }));
  };

  const handleOverride = (id, val) => {
    setCogsOverrides(prev => ({ ...prev, [id]: val }));
  };

  const handleComplete = () => {
    onComplete({
      depopRows,
      psRows,
      mergeResult,
      categoryDefaults: Object.fromEntries(
        Object.entries(categoryDefaults).map(([k, v]) => [k, parseFloat(v) || 0])
      ),
      cogsOverrides,
    });
  };

  return (
    <div className="grain" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.05em', margin: 0 }}>
          ARBT<span style={{ color: 'var(--blue)' }}>.</span>
        </h1>
        <p style={{ color: 'var(--silver)', fontSize: 13, marginTop: 6 }}>Arbitrage Ledger — Initial Setup</p>
      </div>

      <div className="glass" style={{ width: '100%', maxWidth: 760, padding: 40 }}>
        {/* Step progress */}
        <div style={{ marginBottom: 40 }}>
          <StepBar step={step} />
        </div>

        {step === 0 && <StepUpload onComplete={handleFilesReady} />}
        {step === 1 && (
          <StepCategoryDefaults
            categories={categories}
            defaults={categoryDefaults}
            onChange={handleDefaultChange}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && mergeResult && (
          <StepReview
            mergeResult={mergeResult}
            categories={categories}
            categoryDefaults={Object.fromEntries(
              Object.entries(categoryDefaults).map(([k, v]) => [k, parseFloat(v) || 0])
            )}
            cogsOverrides={cogsOverrides}
            onOverride={handleOverride}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  );
}
