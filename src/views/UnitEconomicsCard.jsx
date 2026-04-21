/**
 * UnitEconomicsCard
 * Per-sale average breakdown: pie chart + ROI multiple headline.
 * Filterable by category or 'All'. Pure view on engine — no new data needed.
 */
import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { PieChart as PieIcon, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { buildUnitEconomics } from '../engine.js';

// Slice colors — profit is green (dopamine), costs get warm/cool variety
const SLICE_COLORS = {
  profit:   '#34D399',
  cogs:     '#A78BFA',
  shipping: '#F97316',
  depopFee: '#F87171',
  payFee:   '#FBBF24',
  boostFee: '#EC4899',
};

const fmt$ = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function UnitEconomicsCard({ transactions }) {
  const categories = useMemo(() => {
    const s = new Set(transactions.map(t => t.category).filter(Boolean));
    return ['All', ...Array.from(s).sort()];
  }, [transactions]);

  const [category, setCategory] = useState('All');
  const ue = useMemo(
    () => buildUnitEconomics(transactions, category),
    [transactions, category]
  );

  return (
    <div className="glass flex flex-col" style={{ padding: '22px 24px', gap: 16 }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieIcon size={14} style={{ color: 'var(--blue)' }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em', color: 'var(--silver)', textTransform: 'uppercase',
          }}>
            Unit Economics — Where Every Dollar Goes
          </span>
        </div>
        <select
          className="input-glass"
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ fontSize: 11, padding: '6px 10px', cursor: 'pointer' }}
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {ue.sampleSize === 0 ? (
        <div style={{ color: 'var(--silver)', fontSize: 13, padding: '24px 0' }}>
          No sales in {category === 'All' ? 'any category' : category}.
        </div>
      ) : (
        <>
          {/* ── Headline: three states ── */}
          {ue.profitPerDollarCogs === null ? (
            <HeadlineBox
              color="silver"
              icon={AlertCircle}
              label="Add COGS values to see your ROI multiple"
              value=""
            />
          ) : ue.isProfitable ? (
            <HeadlineBox
              color="green"
              icon={TrendingUp}
              label={<>For every <strong style={{ color: '#fff' }}>$1</strong> in COGS</>}
              value={`you net ${fmt$(ue.profitPerDollarCogs)} profit`}
            />
          ) : (
            <HeadlineBox
              color="red"
              icon={TrendingDown}
              label="Losing money on average"
              value={`${fmt$(ue.avgNetProfit)} per sale`}
            />
          )}

          {/* ── Pie + legend ── */}
          <div className="flex" style={{ gap: 20, alignItems: 'center' }}>
            <div style={{ flex: '0 0 190px' }}>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={ue.slices}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={86}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {ue.slices.map((s) => (
                      <Cell key={s.key} fill={SLICE_COLORS[s.key] || '#A0A0A0'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, _, { payload }) => [`${fmt$(v)} (${payload.pct}%)`, payload.name]}
                    contentStyle={{
                      background: 'rgba(13,13,13,0.95)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-col" style={{ flex: 1, gap: 8 }}>
              {ue.slices.map((s) => (
                <div key={s.key} className="flex items-center justify-between" style={{ gap: 12 }}>
                  <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                    <div style={{
                      width: 9, height: 9, borderRadius: 2,
                      background: SLICE_COLORS[s.key] || '#A0A0A0',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--silver)' }} className="truncate">
                      {s.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--silver)' }}>
                      {s.pct}%
                    </span>
                    <span className="mono" style={{
                      fontSize: 12, fontWeight: 600, minWidth: 60, textAlign: 'right',
                    }}>
                      {fmt$(s.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer context ── */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--silver)', opacity: 0.65,
            borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10,
          }}>
            Avg of {ue.sampleSize} sale{ue.sampleSize === 1 ? '' : 's'}
            {category !== 'All' ? ` in ${category}` : ''}
            {' · '}Avg price {fmt$(ue.avgPrice)}
            {ue.avgBuyerShipping > 0 ? ` + ${fmt$(ue.avgBuyerShipping)} shipping` : ''}
          </div>
        </>
      )}
    </div>
  );
}

// ── Subcomponent: colored callout box ──
const COLORS = {
  green:  { bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.18)', fg: 'var(--green)' },
  red:    { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.22)',  fg: 'var(--red)' },
  silver: { bg: 'rgba(160,160,160,0.05)', border: 'rgba(160,160,160,0.15)', fg: 'var(--silver)' },
};

function HeadlineBox({ color, icon: Icon, label, value }) {
  const c = COLORS[color];
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Icon size={18} style={{ color: c.fg, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, color: 'var(--silver)', marginBottom: value ? 2 : 0 }}>
          {label}
        </div>
        {value && (
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: c.fg }}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
}
