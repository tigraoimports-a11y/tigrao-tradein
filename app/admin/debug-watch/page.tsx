"use client";
import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

export default function DebugWatchPage() {
  const { apiHeaders, password } = useAdmin();
  const [data, setData] = useState<unknown>(null);
  const [err, setErr] = useState<string>("");
  const [running, setRunning] = useState(false);

  async function load() {
    setErr("");
    try {
      const r = await fetch("/api/admin/debug-watch", { headers: apiHeaders() });
      const j = await r.json();
      setData(j);
    } catch (e) { setErr(String(e)); }
  }

  async function runRename() {
    if (!confirm("Rodar rename SE 42/46mm → Series 11 agora?")) return;
    setRunning(true);
    try {
      const r = await fetch("/api/admin/debug-watch", {
        method: "POST",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename" }),
      });
      const j = await r.json();
      alert(JSON.stringify(j, null, 2));
      await load();
    } catch (e) { alert(String(e)); }
    setRunning(false);
  }

  useEffect(() => { if (password) load(); }, [password]);

  return (
    <div style={{ padding: 24, fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>🔍 Debug Apple Watch</h1>
      <button onClick={load} style={{ padding: "8px 16px", marginRight: 8 }}>🔄 Recarregar</button>
      <button onClick={runRename} disabled={running} style={{ padding: "8px 16px", background: "#E8740E", color: "white", border: "none", borderRadius: 4 }}>
        {running ? "Rodando..." : "▶ Rodar Rename SE → Series 11"}
      </button>
      {err && <pre style={{ color: "red" }}>{err}</pre>}
      {data != null && <pre style={{ marginTop: 16, padding: 12, background: "#f0f0f0", borderRadius: 4, whiteSpace: "pre-wrap" }}>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
