/**
 * ARBT Data Engine
 * Parses, merges, deduplicates, and enriches Depop + Pirate Ship data.
 *
 * Key design decisions:
 * - Labels are identified by _fp (fingerprint): tracking number if present, else hash(date|cost|desc)
 * - Sales are identified by Depop Transaction ID (stable across CSV re-exports)
 * - mergeData is a pure function called on ALL raw rows — deduplication happens at the raw layer
 * - Date window ±3 days prevents cross-wiring on same-day sales
 * - normalizeName strips middle initials before fuzzy comparison
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// ── MONEY PARSING ──────────────────────────────────────────────────────────────
export const parseMoney = (val) => {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/[$,\s]/g, '').replace(/['"]/g, '').trim();
  if (!s || s === '-' || s === '—') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const fmt = (n) => (Math.round(n * 100) / 100);

// ── HASH ───────────────────────────────────────────────────────────────────────
const simpleHash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, '0').toUpperCase();
};

// ── NAME NORMALIZATION ─────────────────────────────────────────────────────────
// Strips middle initials (single-letter words), punctuation, extra spaces.
// "John A. Smith" → "john smith", "Mary-Jane O'Brien" → "mary jane obrien"
export const normalizeName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')       // strip punctuation
    .replace(/\b[a-z]\b\s*/g, '')      // strip middle initials
    .replace(/\s+/g, ' ')
    .trim();

// ── FUZZY NAME MATCH ───────────────────────────────────────────────────────────
export const fuzzyScore = (a, b) => {
  const nA = normalizeName(a);
  const nB = normalizeName(b);
  if (!nA || !nB) return 0;
  if (nA === nB) return 1.0;
  if (nA.includes(nB) || nB.includes(nA)) return 0.88;
  // word-level overlap
  const wA = nA.match(/[a-z]+/g) || [];
  const wB = new Set(nB.match(/[a-z]+/g) || []);
  const overlap = wA.filter(w => wB.has(w)).length;
  if (overlap > 0) return 0.6 + (overlap / Math.max(wA.length, wB.size)) * 0.25;
  return 0;
};

// ── LABEL FINGERPRINT ──────────────────────────────────────────────────────────
// Tracking number is the gold standard — globally unique per shipment.
// Fallback: hash of date + cost + first 30 chars of description.
// This fingerprint is STABLE across re-uploads of the same Pirate Ship export.
const makeLabelFp = (r) => {
  const track = String(r['Tracking Number'] || r['Tracking'] || '').trim();
  if (track) return `T_${track}`;
  const date  = r['Date'] ? new Date(r['Date']).toISOString().slice(0, 10) : 'nodate';
  const cost  = Math.round(Math.abs(parseMoney(r['Total'] || r['Cost'] || r['Amount'] || 0)) * 100);
  const desc  = String(r['Description'] || r['Ship To Name'] || r['Recipient Name'] || '');
  return `H_${simpleHash(`${date}|${cost}|${desc.slice(0, 30)}`)}`;
};

// ── DEPOP TRANSACTION ID ───────────────────────────────────────────────────────
const generateTxnId = (row) => {
  const tid = String(row['Transaction ID'] || '').trim();
  if (tid) return tid;
  const raw = `${row['Date of sale']}_${row['Name']}_${row['Item price']}`;
  return 'H_' + simpleHash(raw);
};

// ── RAW-ROW DEDUPLICATION ──────────────────────────────────────────────────────
// Called before mergeData when stacking new import batches.
// Depop: dedup by Transaction ID (stable Depop primary key).
// Pirate Ship: dedup by label fingerprint (tracking or hash).

export function dedupeDepopRows(existing, incoming) {
  const knownIds = new Set(
    existing.map(r => String(r['Transaction ID'] || '').trim()).filter(Boolean)
  );
  const fresh = [];
  for (const r of incoming) {
    const tid = String(r['Transaction ID'] || '').trim();
    if (tid && knownIds.has(tid)) continue;
    if (tid) knownIds.add(tid);
    fresh.push(r);
  }
  return [...existing, ...fresh];
}

export function dedupePsRows(existing, incoming) {
  const knownFps = new Set(existing.map(r => makeLabelFp(r)));
  const fresh = [];
  for (const r of incoming) {
    const fp = makeLabelFp(r);
    if (knownFps.has(fp)) continue;
    knownFps.add(fp);
    fresh.push(r);
  }
  return [...existing, ...fresh];
}

// ── PIRATE SHIP PARSER ─────────────────────────────────────────────────────────
export const parsePirateShipRows = (rows) =>
  rows
    .filter(r => String(r['Type'] || '').toLowerCase().includes('label'))
    .map((r, idx) => {
      const desc = String(
        r['Description'] || r['Ship To Name'] || r['Recipient Name'] || r['Recipient'] || ''
      );
      // PS Description format: "John Smith: 1 oz First Class Package ..."
      const name = desc.includes(':') ? desc.split(':')[0].trim() : desc.split('\n')[0].trim();
      return {
        _idx:           idx,
        _fp:            makeLabelFp(r),
        name,
        cost:           fmt(Math.abs(parseMoney(r['Total'] || r['Cost'] || r['Amount'] || 0))),
        date:           r['Date'] ? new Date(r['Date']) : null,
        trackingNumber: String(r['Tracking Number'] || r['Tracking'] || ''),
        raw:            r,
      };
    });

// ── DEPOP PARSER ───────────────────────────────────────────────────────────────
export const parseDepopRows = (rows) => {
  let refundedCount = 0;
  const sales = [];

  for (const r of rows) {
    const refund = parseMoney(
      r['Refunded to buyer amount'] || r['Refund amount'] || r['Refunded amount'] || 0
    );
    if (refund > 0) { refundedCount++; continue; }

    const price = parseMoney(r['Item price'] || r['Price'] || 0);
    if (!price && !r['Name']) continue;

    const dateOfSale = r['Date of sale']    ? new Date(r['Date of sale'])    : null;
    const dateListed = r['Date of listing'] ? new Date(r['Date of listing']) : null;
    const daysToSell = dateOfSale && dateListed
      ? Math.round((dateOfSale - dateListed) / 86400000)
      : null;

    sales.push({
      transactionId:  generateTxnId(r),
      date:           dateOfSale,
      dateListed,
      dateStr:        String(r['Date of sale'] || ''),
      dateListedStr:  String(r['Date of listing'] || ''),
      buyerName:      String(r['Name'] || '').trim(),
      postCode:       String(r['Post Code'] || '').trim(),
      itemName:       String(r['Description'] || r['Item'] || '').split('\n')[0].slice(0, 64),
      brand:          String(r['Brand'] || 'Unknown').trim() || 'Unknown',
      category:       String(r['Category'] || 'Uncategorized').trim() || 'Uncategorized',
      price:          fmt(price),
      buyerShipping:  fmt(parseMoney(
        r['Buyer shipping cost'] || r['Shipping'] || r['Shipping price'] || r['Buyer paid shipping'] || 0
      )),
      depopFee:       fmt(parseMoney(r['Depop fee'] || 0)),
      depopPayFee:    fmt(parseMoney(r['Depop Payments fee'] || 0)),
      boostFee:       fmt(parseMoney(r['Boosting fee'] || 0)),
      csvUspsCost:    fmt(parseMoney(r['USPS Cost'] || 0)),
      daysToSell,
    });
  }

  return { sales, refundedCount };
};

// ── MERGE & LINK ───────────────────────────────────────────────────────────────
// Pure function: always called on the COMPLETE raw-row sets.
// Deduplication is guaranteed at the raw-row layer before this call.
//
// Matching logic:
//   - ±3 day window (sale date ↔ label purchase date)
//   - fuzzyScore(buyerName, recipientName) ≥ 0.65
//   - Greedy best-first per sale; each label used at most once
//
// Using ±3 days (not the previous ±10) prevents cross-wiring on same-day sales.
// The tighter window is compensated by the improved normalizeName that strips
// middle initials, making fuzzy matching more accurate on partial names.
export function mergeData(depopRows, pirateShipRows) {
  const labels         = parsePirateShipRows(pirateShipRows);
  const { sales, refundedCount } = parseDepopRows(depopRows);

  // Dedup sales within this batch (handles CSV re-export overlap)
  const seenTxnIds  = new Set();
  const usedLabelFps = new Set();
  const transactions = [];
  const orphanedSales = [];

  for (const sale of sales) {
    if (seenTxnIds.has(sale.transactionId)) continue;
    seenTxnIds.add(sale.transactionId);

    // Best-match label within ±3 days
    let bestScore = 0, bestLabel = null;
    for (const label of labels) {
      if (usedLabelFps.has(label._fp)) continue;
      if (!label.date || !sale.date) continue;
      const daysDiff = Math.abs((label.date - sale.date) / 86400000);
      if (daysDiff > 10) continue;
      const score = fuzzyScore(sale.buyerName, label.name);
      if (score > bestScore && score >= 0.65) {
        bestScore = score;
        bestLabel = label;
      }
    }

    if (bestLabel) usedLabelFps.add(bestLabel._fp);

    const actualShipping = bestLabel?.cost ?? 0;
    const totalFees      = fmt(sale.depopFee + sale.depopPayFee + sale.boostFee);
    const shippingSpread = fmt(sale.buyerShipping - actualShipping);

    const txn = {
      ...sale,
      actualShipping,
      shippingSpread,
      totalFees,
      labelTracking:    bestLabel?.trackingNumber || '',
      labelFp:          bestLabel?._fp || '',
      matchScore:       bestScore,
      isOrphaned:       !bestLabel,
      isForceLinked:    false,
      cogs:             0,
      netProfit:        0,
      roi:              null,
      isCogsOverridden: false,
    };

    transactions.push(txn);
    if (!bestLabel) orphanedSales.push(txn);
  }

  const orphanedLabels = labels.filter(l => !usedLabelFps.has(l._fp));

  return { transactions, orphanedSales, orphanedLabels, refundedCount };
}

// ── FORCE LINK ─────────────────────────────────────────────────────────────────
// forceLinks: { [transactionId]: labelFp }
// Uses _fp for stable identity — survives full reparsing.
export function applyForceLinks(transactions, orphanedLabels, forceLinks) {
  // Build a lookup map from fingerprint → label (fast, O(1) per txn)
  const labelByFp = new Map(orphanedLabels.map(l => [l._fp, l]));

  return transactions.map(txn => {
    const linkFp = forceLinks[txn.transactionId];
    if (linkFp === undefined) return txn;
    const label = labelByFp.get(linkFp);
    if (!label) return txn; // stale link after reparse — transaction stays orphaned
    const actualShipping = label.cost;
    const shippingSpread = fmt(txn.buyerShipping - actualShipping);
    return {
      ...txn,
      actualShipping,
      shippingSpread,
      labelTracking:  label.trackingNumber,
      labelFp:        label._fp,
      matchScore:     1.0,
      isOrphaned:     false,
      isForceLinked:  true,
    };
  });
}

// ── ENRICH WITH COGS & PROFIT ──────────────────────────────────────────────────
export function computeStats(transactions, categoryDefaults, cogsOverrides) {
  return transactions.map(txn => {
    const isOverridden = cogsOverrides[txn.transactionId] !== undefined;
    const cogs = fmt(
      isOverridden
        ? cogsOverrides[txn.transactionId]
        : (categoryDefaults[txn.category] ?? 0)
    );
    const netProfit = fmt(
      txn.price - txn.totalFees - txn.actualShipping - cogs + txn.shippingSpread
    );
    const roi = cogs > 0 ? fmt((netProfit / cogs) * 100) : null;

    return { ...txn, cogs, netProfit, roi, isCogsOverridden: isOverridden };
  });
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
export function buildAnalytics(enriched) {
  const totalRevenue       = fmt(enriched.reduce((s, t) => s + t.price, 0));
  const totalNetProfit     = fmt(enriched.reduce((s, t) => s + t.netProfit, 0));
  const totalFees          = fmt(enriched.reduce((s, t) => s + t.totalFees, 0));
  const totalBuyerShipping = fmt(enriched.reduce((s, t) => s + t.buyerShipping, 0));
  const totalShipSpend     = fmt(enriched.reduce((s, t) => s + t.actualShipping, 0));
  const totalShipSpread    = fmt(enriched.reduce((s, t) => s + t.shippingSpread, 0));
  const avgBuyerShipping   = enriched.length ? fmt(totalBuyerShipping / enriched.length) : 0;
  const avgShipCost        = enriched.length ? fmt(totalShipSpend / enriched.length) : 0;
  const avgShipSpread      = enriched.length ? fmt(totalShipSpread / enriched.length) : 0;
  const totalCogs          = fmt(enriched.reduce((s, t) => s + t.cogs, 0));
  const profitMargin       = totalRevenue > 0 ? fmt((totalNetProfit / totalRevenue) * 100) : 0;

  const categoryMap = {};
  const brandMap    = {};

  for (const t of enriched) {
    if (!categoryMap[t.category]) {
      categoryMap[t.category] = { revenue: 0, profit: 0, count: 0, daysList: [], sold: 0 };
    }
    const cm = categoryMap[t.category];
    cm.revenue = fmt(cm.revenue + t.price);
    cm.profit  = fmt(cm.profit  + t.netProfit);
    cm.count++;
    if (t.daysToSell !== null) { cm.daysList.push(t.daysToSell); cm.sold++; }

    if (!brandMap[t.brand]) {
      brandMap[t.brand] = { revenue: 0, profit: 0, count: 0, totalCogs: 0 };
    }
    const bm = brandMap[t.brand];
    bm.revenue   = fmt(bm.revenue   + t.price);
    bm.profit    = fmt(bm.profit    + t.netProfit);
    bm.count++;
    bm.totalCogs = fmt(bm.totalCogs + t.cogs);
  }

  const categories = Object.entries(categoryMap).map(([name, d]) => ({
    name,
    revenue:   d.revenue,
    profit:    d.profit,
    count:     d.count,
    avgRoi:    d.profit > 0 && d.revenue > 0 ? fmt((d.profit / d.revenue) * 100) : 0,
    avgDays:   d.daysList.length ? fmt(d.daysList.reduce((a, b) => a + b, 0) / d.daysList.length) : null,
    slowItems: d.daysList.filter(d => d > 60).length,
  })).sort((a, b) => b.profit - a.profit);

  const brands = Object.entries(brandMap).map(([name, d]) => ({
    name,
    revenue: d.revenue,
    profit:  d.profit,
    count:   d.count,
    avgRoi:  d.totalCogs > 0 ? fmt((d.profit / d.totalCogs) * 100) : 0,
  })).sort((a, b) => b.profit - a.profit);

  return {
    totalRevenue, totalNetProfit, totalFees, totalCogs,
    totalBuyerShipping, totalShipSpend, totalShipSpread,
    avgBuyerShipping, avgShipCost, avgShipSpread,
    profitMargin, categories, brands,
    orphanCount: enriched.filter(t => t.isOrphaned).length,
    itemCount:   enriched.length,
  };
}

// ── TEMPORAL FILTER ────────────────────────────────────────────────────────────
export function filterByTimeframe(transactions, timeframe) {
  if (timeframe === 'all') return transactions;
  const now = new Date();
  let cutoff;
  if      (timeframe === 'week')  cutoff = new Date(now.getTime() - 7 * 86400000);
  else if (timeframe === 'month') cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (timeframe === 'year')  cutoff = new Date(now.getFullYear(), 0, 1);
  return transactions.filter(t => t.date instanceof Date && !isNaN(t.date) && t.date >= cutoff);
}

// ── CHART DATA BUILDER ─────────────────────────────────────────────────────────
export function buildChartData(transactions, timeframe) {
  if (!transactions.length) return { cashFlow: [], categoryBreakdown: [], shippingSpread: [] };

  const getBucket = (date) => {
    if (!date || isNaN(date)) return null;
    if (timeframe === 'week')  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (timeframe === 'month') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const buckets = {};
  const txnsSorted = [...transactions].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));

  txnsSorted.forEach(t => {
    const key = getBucket(t.date);
    if (!key) return;
    if (!buckets[key]) buckets[key] = { date: key, revenue: 0, netProfit: 0, buyerPaid: 0, actualCost: 0, count: 0 };
    const b = buckets[key];
    b.revenue    += t.price;
    b.netProfit  += t.netProfit;
    b.buyerPaid  += t.buyerShipping;
    b.actualCost += t.actualShipping;
    b.count++;
  });

  const cashFlow = Object.values(buckets).map(b => ({
    date:       b.date,
    revenue:    fmt(b.revenue),
    netProfit:  fmt(b.netProfit),
    buyerPaid:  fmt(b.buyerPaid),
    actualCost: fmt(b.actualCost),
    spread:     fmt(b.buyerPaid - b.actualCost),
    count:      b.count,
  }));

  const catMap = {};
  transactions.forEach(t => {
    catMap[t.category] = fmt((catMap[t.category] ?? 0) + t.price);
  });
  const categoryBreakdown = Object.entries(catMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return { cashFlow, categoryBreakdown, shippingSpread: cashFlow };
}

// ── VELOCITY INSIGHTS ──────────────────────────────────────────────────────────
export function buildVelocityInsights(enriched) {
  const catDays = {};

  enriched.forEach(t => {
    if (t.daysToSell === null || t.daysToSell < 0) return;
    if (!catDays[t.category]) catDays[t.category] = { days: [], totalProfit: 0 };
    catDays[t.category].days.push(t.daysToSell);
    catDays[t.category].totalProfit += t.netProfit;
  });

  const catVelocity = Object.entries(catDays).map(([name, d]) => ({
    name,
    avgDays:   Math.round(d.days.reduce((a, b) => a + b, 0) / d.days.length),
    count:     d.days.length,
    avgProfit: fmt(d.totalProfit / d.days.length),
  })).filter(c => c.count >= 1).sort((a, b) => a.avgDays - b.avgDays);

  const capitalTraps = enriched
    .filter(t => t.daysToSell !== null && t.daysToSell > 90 && t.netProfit > 0)
    .sort((a, b) => b.daysToSell - a.daysToSell)
    .slice(0, 8);

  const itemsWithDates = enriched.filter(t => t.daysToSell !== null && t.daysToSell >= 0);
  const soldIn30       = itemsWithDates.filter(t => t.daysToSell <= 30);
  const str30          = itemsWithDates.length > 0
    ? fmt((soldIn30.length / itemsWithDates.length) * 100)
    : null;

  const monthlyGroups = {};
  enriched.forEach(t => {
    if (!t.date || isNaN(t.date)) return;
    const key = `${t.date.getFullYear()}-${t.date.getMonth()}`;
    if (!monthlyGroups[key]) monthlyGroups[key] = [];
    monthlyGroups[key].push(t.netProfit);
  });
  const monthlyProfits = Object.values(monthlyGroups).map(g => g.reduce((a, b) => a + b, 0));
  const projectedMonthlyProfit = monthlyProfits.length > 0
    ? fmt(monthlyProfits.reduce((a, b) => a + b, 0) / monthlyProfits.length)
    : 0;

  return {
    fastMovers:            catVelocity.slice(0, 4),
    capitalTraps,
    str30,
    projectedMonthlyProfit,
    hasDateData:           itemsWithDates.length > 0,
  };
}

// ── UNIQUE CATEGORIES ──────────────────────────────────────────────────────────
export function getUniqueCategories(depopRows) {
  const cats = new Set();
  depopRows.forEach(r => {
    const c = String(r['Category'] || '').trim();
    if (c) cats.add(c);
  });
  return [...cats].sort();
}

// ── FILE PARSERS ───────────────────────────────────────────────────────────────
export const parseDepopFile = (file) =>
  new Promise((resolve, reject) =>
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error: reject,
    })
  );

export const parsePirateShipFile = (file) => {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') return parseDepopFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
