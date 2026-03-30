import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const parseMoney = (val) => {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/[$,]/g, "").trim();
  if (["", "-", '="-"', '"-"'].includes(s)) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

export const generateHash = (row) => {
  if (row["Transaction ID"]) return String(row["Transaction ID"]).trim();
  const raw = `${row["Date of sale"]}_${row["Name"]}_${row["Item price"]}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) + hash) ^ raw.charCodeAt(i); }
  return "H_" + (hash >>> 0).toString(16).toUpperCase();
};

export const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const processArbitrageData = (depopFile, pirateShipFile, existingTxns = []) => {
  return new Promise((resolve, reject) => {
    Papa.parse(depopFile, {
      header: true,
      complete: (dResults) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const pRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            
            const labels = pRows.filter(r => r.Type === "Label").map((r, i) => ({
              labelId: `LBL_${i}`,
              name: normalize(String(r.Description || "").split(":")[0]),
              rawName: String(r.Description || "").split(":")[0].trim(),
              cost: Math.abs(parseMoney(r.Total)),
              date: r.Date
            }));

            const masterIds = new Set(existingTxns.map(t => t.id));
            const newTxns = [];
            const usedLabelIds = new Set();
            let duplicates = 0;

            dResults.data.forEach(row => {
              if (parseMoney(row["Refunded to buyer amount"]) > 0) return;
              const id = generateHash(row);
              if (masterIds.has(id)) { duplicates++; return; }

              const buyer = normalize(row["Name"]);
              const matchIdx = labels.findIndex(l => !usedLabelIds.has(l.labelId) && (l.name === buyer || buyer.includes(l.name)));
              
              let labelData = { cost: 0, labelId: null };
              if (matchIdx !== -1) {
                labelData = { cost: labels[matchIdx].cost, labelId: labels[matchIdx].labelId };
                usedLabelIds.add(labels[matchIdx].labelId);
              }

              newTxns.push({
                id,
                date: row["Date of sale"],
                item: String(row["Description"] || "").split("\n")[0].slice(0, 45),
                brand: row["Brand"] || "Other",
                category: row["Category"] || "Other",
                revenue: parseMoney(row["Item price"]),
                buyerPaidShip: parseMoney(row["Buyer shipping cost"]),
                fees: parseMoney(row["Depop fee"]) + parseMoney(row["Depop Payments fee"]) + parseMoney(row["Boosting fee"]),
                actualShip: labelData.cost,
                labelId: labelData.labelId,
                isOrphan: !labelData.labelId
              });
            });

            const unusedLabels = labels.filter(l => !usedLabelIds.has(l.labelId));
            resolve({ newTxns, unusedLabels, duplicates });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsArrayBuffer(pirateShipFile);
      },
      error: (err) => reject(err)
    });
  });
};
