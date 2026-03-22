"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  function handleClear() {
    try {
      // Limpar todos os dados do admin no localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("admin_") || key.startsWith("tigrao_"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    // Reload limpo
    window.location.href = "/admin";
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F5F7", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, padding: 40, textAlign: "center", background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: "#1D1D1F" }}>Erro no Painel Admin</h2>
        <p style={{ color: "#86868B", fontSize: 14, marginBottom: 24 }}>
          {error?.message || "Ocorreu um erro inesperado"}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{ padding: "10px 24px", background: "#E8740E", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Tentar novamente
          </button>
          <button
            onClick={handleClear}
            style={{ padding: "10px 24px", background: "#E74C3C", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Limpar dados e recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
