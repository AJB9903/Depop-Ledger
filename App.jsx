import React, { useState, useRef, useMemo } from "react";
import { processArbitrageData } from "./lib/engine";

export default function ArbtApp() {
  const [txns, setTxns] = useState([]);
  const [unusedLabels, setUnusedLabels] = useState([]);
  const [cogs, setCogs] = useState({});
  const [tab, setTab] = useState("overview");
  
  const depopIn = useRef();
  const psIn = useRef();

  const handleProcess = async () => {
    const dFile = depopIn.current.files[0];
    const pFile = psIn.current.files[0];
    if (!dFile || !pFile) return alert("Mobilize both files before running audit.");

    try {
      const { newTxns, unusedLabels: newUnused, duplicates } = await processArbitrageData(dFile, pFile, txns);
      setTxns([...txns, ...newTxns]);
      setUnusedLabels(newUnused);
      alert(`Audit Complete. ${duplicates} duplicates ignored.`);
    } catch (error) {
      console.error("Merge failed", error);
      alert("Failed to process data.");
    }
  };

  const stats = useMemo(() => {
    const profit = txns.reduce((s, t) => s + t.revenue - t.fees - t.actualShip - (cogs[t.id] || 0) + (t.buyerPaidShip - t.actualShip), 0);
    return { profit, totalRemaining: Math.max(20000 - profit, 0) };
  }, [txns, cogs]);

  return (
    <div style={{ padding: "40px", backgroundColor: "#0B0F19", color: "#F8FAFC", minHeight: "100vh" }}>
      <h1>ARBT.</h1>
      
      <div style={{ display: "flex", gap: "20px", marginBottom: "40px" }}>
        <input ref={depopIn} type="file" title="Depop CSV" />
        <input ref={psIn} type="file" title="Pirate Ship XLSX" />
        <button onClick={handleProcess}>EXECUTE MERGE</button>
      </div>

      <div style={{ border: "1px solid #3B82F6", padding: "20px", borderRadius: "12px", marginBottom: "40px" }}>
        <h2>Student Loan Target: $20,000</h2>
        <p>Cleared: ${stats.profit.toLocaleString()}</p>
        <p>Remaining: ${stats.totalRemaining.toLocaleString()}</p>
      </div>

      <p>Code architecture modularized. UI ready for Claude Code generation.</p>
    </div>
  );
}
