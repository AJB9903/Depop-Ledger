/**
 * Dashboard — Visual-first home screen
 * Temporal control · Cash flow chart · Category donut · Shipping spread · Velocity insights
 */
import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, DollarSign, Package, Clock, AlertTriangle,
  Zap, ShoppingBag, Flame, Anchor, X,
} from 'lucide-react';
import {
  filterByTimeframe, buildAnalytics, buildChartData, buildVelocityInsights,
} from '../engine.js';

// ── FORMATTERS ─────────────────────────────────────────────────────────────────
const fmt$  = (n) => `$${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fmtN  = (n) => Number(n || 0).toFixed(1);
const sign$ = (n) => `${n >= 0 ? '+' : ''}${fmt$(n)}`;

// ── CHART THEME ────────────────────────────────────────────────────────────────
const CHART = {
  blue:   '#38BDF8',
  green:  '#34D399',
  red:    '#F87171',
  yellow: '#FBBF24',
  silver: '#A0A0A0',
  bg:     'transparent',
  grid:   'rgba(255,255,255,0.04)',
  text:   '#A0A0A0',
};

const DONUT_COLORS = [
  '#38BDF8', '#34D399', '#FBBF24', '#F87171', '#A78BFA',
  '#F97316', '#EC4899', '#14B8A6', '#84CC16', '#E879F9',
];

const chartStyle = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  fill: CHART.text,
};

const CustomTooltip = ({ active, payload, label, prefix = '$' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(13,13,13,0.95)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--silver)', marginBottom: 6, fontSize: 10 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{prefix}{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

// ── SEGMENTED TIME CONTROL ─────────────────────────────────────────────────────
const TimeControl = ({ value, onChange }) => {
  const segs = [
    { id: 'week',  label: 'Week'  },
    { id: 'month', label: 'Month' },
    { id: 'year',  label: 'Year'  },
    { id: 'all',   label: 'All Time' },
  ];
  return (
    <div
      className="glass-sm"
      style={{ display: 'inline-flex', padding: 4, gap: 2 }}
    >
      {segs.map(s => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          style={{
            padding: '7px 16px',
            borderRadius: 9,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            transition: 'all 0.18s ease',
            background: value === s.id ? 'var(--blue-dim)' : 'transparent',
            color:      value === s.id ? 'var(--blue)'     : 'var(--silver)',
            boxShadow:  value === s.id ? '0 0 0 1px var(--border-blue)' : 'none',
          }}
        >
          {s.label.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

// ── METRIC CARD ────────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, sub, color = 'var(--blue)', icon: Icon }) => (
  <div className="glass glass-hover flex-1" style={{ padding: '22px 24px', minWidth: 0 }}>
    <div className="flex items-start justify-between" style={{ marginBottom: 14 }}>
      <span className="label">{label}</span>
      {Icon && (
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} style={{ color }} />
        </div>
      )}
    </div>
    <div className="mono" style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 10, color: 'var(--silver)', marginTop: 8, lineHeight: 1.4 }}>{sub}</div>}
  </div>
);

// ── SECTION HEADER ─────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, label, color = 'var(--silver)' }) => (
  <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
    <Icon size={13} style={{ color }} />
    <span className="label">{label}</span>
  </div>
);

// ── SHIPPING BUBBLE ────────────────────────────────────────────────────────────
const ShippingBubble = ({ stats, onClose }) => (
  <div className="glass" style={{
    position: 'fixed', bottom: 100, right: 32, width: 300,
    padding: 24, zIndex: 200,
    border: '1px solid var(--border-blue)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
  }}>
    <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
      <div className="flex items-center gap-2">
        <Package size={13} style={{ color: 'var(--blue)' }} />
        <span className="label" style={{ color: 'var(--blue)', fontSize: 10 }}>Shipping Numbers</span>
      </div>
      <button className="btn btn-ghost" onClick={onClose} style={{ padding: '3px 5px' }}>
        <X size={12} />
      </button>
    </div>
    <div className="flex flex-col gap-3">
      {[
        ['Buyers paid (total)', fmt$(stats.totalBuyerShipping), 'var(--white)'],
        ['You spent (actual labels)', fmt$(stats.totalShipSpend), 'var(--white)'],
      ].map(([l, v, c]) => (
        <div key={l} className="flex justify-between items-center">
          <span style={{ fontSize: 12, color: 'var(--silver)' }}>{l}</span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: c }}>{v}</span>
        </div>
      ))}
      <div className="divider" />
      {[
        ['Avg buyer paid / item',  fmt$(stats.avgBuyerShipping), 'var(--silver)'],
        ['Avg label cost / item',  fmt$(stats.avgShipCost),      'var(--silver)'],
        ['Avg spread / item',      sign$(stats.avgShipSpread),   stats.avgShipSpread >= 0 ? 'var(--green)' : 'var(--red)'],
      ].map(([l, v, c]) => (
        <div key={l} className="flex justify-between items-center">
          <span style={{ fontSize: 12, color: 'var(--silver)' }}>{l}</span>
          <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: c }}>{v}</span>
        </div>
      ))}
      <div className="divider" />
      <div className="glass-sm" style={{ padding: '10px 14px', background: stats.totalShipSpread >= 0 ? 'var(--green-dim)' : 'var(--red-dim)' }}>
        <div style={{ fontSize: 9, color: 'var(--silver)', marginBottom: 4, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Realized Shipping Alpha
        </div>
        <div style={{ fontSize: 10, color: 'var(--silver)', marginBottom: 6 }}>
          {fmt$(stats.totalBuyerShipping)} collected − {fmt$(stats.totalShipSpend)} spent
        </div>
        <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: stats.totalShipSpread >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {sign$(stats.totalShipSpread)}
        </div>
      </div>
    </div>
  </div>
);

// ── LEADERBOARD ────────────────────────────────────────────────────────────────
const Leaderboard = ({ items, valueKey = 'profit', labelKey = 'name', colorFn }) => (
  <div className="flex flex-col gap-1">
    {items.slice(0, 6).map((item, i) => {
      const value = item[valueKey] ?? 0;
      const maxVal = Math.max(...items.map(x => Math.abs(x[valueKey] ?? 0)), 1);
      const pct = Math.abs(value / maxVal) * 100;
      const color = colorFn ? colorFn(item, i) : (i === 0 ? 'var(--blue)' : 'var(--silver)');
      return (
        <div key={item[labelKey]} style={{ padding: '8px 0' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--silver)', width: 14 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: 13, fontWeight: i === 0 ? 600 : 400 }}>{item[labelKey]}</span>
            </div>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color }}>
              {value >= 0 ? '+' : ''}{fmt$(value)}
            </span>
          </div>
          <div style={{ height: 2, background: 'var(--surface-hi)', borderRadius: 1 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 1, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      );
    })}
  </div>
);

// ── VELOCITY FAST MOVERS ───────────────────────────────────────────────────────
const VelocityCard = ({ cat, type }) => (
  <div className="glass-sm flex-1" style={{
    padding: '14px 16px',
    borderColor: type === 'fast' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)',
    background: type === 'fast' ? 'var(--green-dim)' : 'rgba(248,113,113,0.06)',
  }}>
    <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
      {type === 'fast'
        ? <Flame size={12} style={{ color: 'var(--green)' }} />
        : <Anchor size={12} style={{ color: 'var(--red)' }} />}
      <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: type === 'fast' ? 'var(--green)' : 'var(--red)' }}>
        {cat.avgDays}
      </span>
      <span style={{ fontSize: 11, color: 'var(--silver)' }}>days avg</span>
    </div>
    <div style={{ fontSize: 11, color: 'var(--silver)', marginTop: 4 }}>
      {cat.count} item{cat.count !== 1 ? 's' : ''} · avg {fmt$(cat.avgProfit)} profit
    </div>
  </div>
);

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────────
export default function Dashboard({ transactions, analytics: globalAnalytics, orphanCount }) {
  const [timeframe,    setTimeframe]    = useState('month');
  const [showShipping, setShowShipping] = useState(false);

  // Filter + re-derive analytics for the selected timeframe
  const filtered = useMemo(
    () => filterByTimeframe(transactions, timeframe),
    [transactions, timeframe]
  );
  const analytics = useMemo(() => buildAnalytics(filtered), [filtered]);
  const chartData = useMemo(() => buildChartData(filtered, timeframe), [filtered, timeframe]);
  const velocity  = useMemo(() => buildVelocityInsights(filtered), [filtered]);

  const {
    totalRevenue, totalNetProfit, profitMargin,
    totalBuyerShipping, totalShipSpend, totalShipSpread,
    avgBuyerShipping, avgShipCost, avgShipSpread,
    brands, categories, itemCount,
  } = analytics;

  const avgSellDays = useMemo(() => {
    const cats = categories.filter(c => c.avgDays != null);
    return cats.length ? cats.reduce((s, c) => s + c.avgDays, 0) / cats.length : null;
  }, [categories]);

  const isEmpty = filtered.length === 0;

  return (
    <div style={{ padding: '28px 40px 120px' }}>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>
            ARBT<span style={{ color: 'var(--blue)' }}>.</span>
          </h1>
          <p style={{ color: 'var(--silver)', fontSize: 12, marginTop: 4 }}>
            {itemCount} transactions · {timeframe === 'all' ? 'all time' : `this ${timeframe}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {globalAnalytics.orphanCount > 0 && (
            <div className="badge badge-yellow flex items-center gap-1">
              <AlertTriangle size={10} />
              {globalAnalytics.orphanCount} unmatched
            </div>
          )}
          <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowShipping(v => !v)}>
            <Package size={12} /> Shipping Numbers
          </button>
        </div>
      </div>

      {/* ── TIME CONTROL ── */}
      <div style={{ marginBottom: 28 }}>
        <TimeControl value={timeframe} onChange={setTimeframe} />
      </div>

      {/* ── METRIC CARDS ── */}
      <div className="flex gap-4" style={{ marginBottom: 28 }}>
        <MetricCard
          label="Revenue"
          value={fmt$(totalRevenue)}
          sub={`${itemCount} items · ${fmtN(profitMargin)}% margin`}
          color="var(--blue)"
          icon={DollarSign}
        />
        <MetricCard
          label="Net Profit"
          value={fmt$(totalNetProfit)}
          sub={velocity.projectedMonthlyProfit > 0 ? `~${fmt$(velocity.projectedMonthlyProfit)}/mo projected` : 'Fees + shipping + COGS deducted'}
          color={totalNetProfit >= 0 ? 'var(--green)' : 'var(--red)'}
          icon={TrendingUp}
        />
        <MetricCard
          label="Avg Sell Time"
          value={avgSellDays != null ? `${fmtN(avgSellDays)}d` : '—'}
          sub={velocity.str30 != null ? `${fmtN(velocity.str30)}% sold ≤30 days` : 'No date data'}
          color="var(--yellow)"
          icon={Clock}
        />
        <MetricCard
          label="Shipping Alpha"
          value={sign$(totalShipSpread)}
          sub={`Collected ${fmt$(totalBuyerShipping)} · Spent ${fmt$(totalShipSpend)}`}
          color={totalShipSpread >= 0 ? 'var(--green)' : 'var(--red)'}
          icon={Package}
        />
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div style={{ fontSize: 40, opacity: 0.15 }}>📊</div>
          <p style={{ color: 'var(--silver)', fontSize: 14 }}>No transactions in this timeframe.</p>
          <button className="btn" onClick={() => setTimeframe('all')}>View All Time</button>
        </div>
      ) : (
        <>
          {/* ── ROW 1: CASH FLOW + CATEGORY DONUT ── */}
          <div className="flex gap-5" style={{ marginBottom: 20 }}>

            {/* Cash Flow Line Chart */}
            <div className="glass flex flex-col" style={{ flex: 2, padding: '22px 24px' }}>
              <SectionHeader icon={TrendingUp} label="Cash Flow — Revenue vs Net Profit" color="var(--blue)" />
              {chartData.cashFlow.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData.cashFlow} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={chartStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="revenue"   name="Revenue"    stroke={CHART.blue}   strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="netProfit" name="Net Profit"  stroke={CHART.green}  strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--silver)', fontSize: 13 }}>
                  Not enough data points for this timeframe.
                </div>
              )}
            </div>

            {/* Category Donut */}
            <div className="glass flex flex-col" style={{ flex: 1, padding: '22px 24px' }}>
              <SectionHeader icon={Zap} label="Revenue by Category" color="var(--yellow)" />
              {chartData.categoryBreakdown.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={chartData.categoryBreakdown}
                        cx="50%" cy="50%"
                        innerRadius={48} outerRadius={72}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {chartData.categoryBreakdown.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue']} contentStyle={{ background: 'rgba(13,13,13,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>
                    {chartData.categoryBreakdown.slice(0, 5).map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--silver)' }}>{c.name}</span>
                        </div>
                        <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>{fmt$(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--silver)', fontSize: 13 }}>
                  No category data.
                </div>
              )}
            </div>
          </div>

          {/* ── ROW 2: SHIPPING SPREAD AREA CHART ── */}
          {chartData.shippingSpread.length > 1 && (
            <div className="glass" style={{ padding: '22px 24px', marginBottom: 20 }}>
              <SectionHeader icon={Package} label="Shipping Spread — Buyer Paid vs Actual Cost" color="var(--green)" />
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData.shippingSpread} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradBuyer" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART.blue}  stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART.blue}  stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART.green} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={chartStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="buyerPaid"  name="Buyer Paid"    stroke={CHART.blue}  fill="url(#gradBuyer)"  strokeWidth={2} />
                  <Area type="monotone" dataKey="actualCost" name="Actual Cost"   stroke={CHART.green} fill="url(#gradActual)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── ROW 3: VELOCITY INSIGHTS + LEADERBOARDS ── */}
          <div className="flex gap-5" style={{ marginBottom: 20 }}>

            {/* Velocity Insights */}
            <div className="glass flex flex-col" style={{ flex: 1, padding: '22px 24px' }}>
              <SectionHeader icon={Flame} label="Velocity Insights" color="var(--green)" />
              {velocity.hasDateData ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Fast Movers</div>
                    <div className="flex gap-2 flex-wrap">
                      {velocity.fastMovers.slice(0, 2).map(c => (
                        <VelocityCard key={c.name} cat={c} type="fast" />
                      ))}
                    </div>
                  </div>
                  {velocity.capitalTraps.length > 0 && (
                    <div>
                      <div className="label" style={{ fontSize: 9, marginBottom: 8, color: 'var(--red)' }}>
                        Capital Traps (&gt;90 days to sell)
                      </div>
                      <div className="flex flex-col gap-1">
                        {velocity.capitalTraps.slice(0, 3).map(t => (
                          <div key={t.transactionId} className="glass-sm flex items-center justify-between" style={{ padding: '8px 12px', background: 'rgba(248,113,113,0.04)' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{t.brand} — {t.category}</div>
                              <div style={{ fontSize: 11, color: 'var(--silver)' }}>{t.itemName?.slice(0, 40) || '—'}</div>
                            </div>
                            <div className="text-right">
                              <div className="mono" style={{ fontSize: 12, color: 'var(--red)' }}>{t.daysToSell}d</div>
                              <div className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>{fmt$(t.netProfit)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {velocity.capitalTraps.length === 0 && velocity.fastMovers.length > 0 && (
                    <div className="badge badge-green" style={{ alignSelf: 'flex-start', marginTop: 4 }}>No capital traps — inventory moving fast</div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--silver)', fontSize: 12 }}>
                  Velocity data requires "Date of listing" and "Date of sale" columns in your Depop CSV.
                </div>
              )}
            </div>

            {/* Brand Leaderboard */}
            <div className="glass flex flex-col" style={{ flex: 1, padding: '22px 24px' }}>
              <SectionHeader icon={ShoppingBag} label="Top Brands — Net Profit" color="var(--silver)" />
              {brands.length > 0 ? (
                <Leaderboard
                  items={brands}
                  valueKey="profit"
                  labelKey="name"
                  colorFn={(_, i) => i === 0 ? 'var(--blue)' : 'var(--silver)'}
                />
              ) : (
                <p style={{ color: 'var(--silver)', fontSize: 12 }}>No data.</p>
              )}
            </div>

            {/* Category Leaderboard */}
            <div className="glass flex flex-col" style={{ flex: 1, padding: '22px 24px' }}>
              <SectionHeader icon={Zap} label="Top Categories — Net Profit" color="var(--silver)" />
              {categories.length > 0 ? (
                <Leaderboard
                  items={categories}
                  valueKey="profit"
                  labelKey="name"
                  colorFn={(item, i) => {
                    if (i === 0) return 'var(--green)';
                    if (item.avgDays > 60) return 'var(--red)';
                    return 'var(--silver)';
                  }}
                />
              ) : (
                <p style={{ color: 'var(--silver)', fontSize: 12 }}>No data.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── SHIPPING BUBBLE ── */}
      {showShipping && (
        <ShippingBubble
          stats={{ totalBuyerShipping, totalShipSpend, totalShipSpread, avgBuyerShipping, avgShipCost, avgShipSpread }}
          onClose={() => setShowShipping(false)}
        />
      )}
    </div>
  );
}
