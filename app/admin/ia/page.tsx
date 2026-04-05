"use client";
import { useState, useRef, useEffect } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface Mensagem {
  role: "user" | "assistant";
  content: string;
}

export default function IAPage() {
  const { password, user } = useAdmin();
  const senha = password;
  const usuario = user?.nome ?? "sistema";
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function analisarAutomatico() {
    setAnalisando(true);
    const msg = "Faça uma análise completa do estado atual do estoque: identifique divergências, produtos esgotados importantes, itens abaixo do mínimo, e qualquer alerta que você detectar nos dados.";
    await enviarMensagem(msg, true);
    setAnalisando(false);
  }

  async function enviarMensagem(texto: string, isAnalise = false) {
    if (!texto.trim() || loading) return;

    const novaMensagemUser: Mensagem = { role: "user", content: texto };
    const novaLista = [...mensagens, novaMensagemUser];
    setMensagens(novaLista);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": senha || "",
          "x-admin-user": usuario || "",
        },
        body: JSON.stringify({
          mensagem: texto,
          historico: mensagens,
          modo: isAnalise ? "analise" : "chat",
        }),
      });

      const data = await res.json();
      if (data.resposta) {
        setMensagens([...novaLista, { role: "assistant", content: data.resposta }]);
      }
    } catch {
      setMensagens([...novaLista, { role: "assistant", content: "❌ Erro ao conectar com a IA. Tente novamente." }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem(input);
    }
  }

  const sugestoes = [
    "Quais produtos estão esgotados e são mais vendidos?",
    "Tem alguma divergência de preço ou custo no estoque?",
    "Como estão as vendas dos últimos 30 dias?",
    "Quais produtos devo repor com urgência?",
    "Tem algum item nas pendências há mais de 15 dias?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🤖 Assistente IA</h1>
          <p className="text-sm text-gray-500">Analisa seu estoque, vendas e detecta problemas automaticamente</p>
        </div>
        <button
          onClick={analisarAutomatico}
          disabled={analisando || loading}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {analisando ? (
            <>
              <span className="animate-spin">⏳</span> Analisando...
            </>
          ) : (
            <>🔍 Análise Automática</>
          )}
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
        {mensagens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-10">
            <div className="text-6xl">🤖</div>
            <div>
              <p className="text-lg font-semibold text-gray-700">Olá! Sou o assistente da TigrãoImports.</p>
              <p className="text-sm text-gray-500 mt-1">Posso analisar seu estoque, detectar problemas e responder perguntas sobre o negócio.</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-lg">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sugestões de perguntas</p>
              {sugestoes.map((s, i) => (
                <button
                  key={i}
                  onClick={() => enviarMensagem(s)}
                  className="text-left text-sm bg-gray-50 hover:bg-purple-50 hover:text-purple-700 border border-gray-200 hover:border-purple-300 rounded-lg px-4 py-2 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {mensagens.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-purple-600 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <span className="text-xs font-semibold text-purple-600 block mb-1">🤖 Assistente IA</span>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  Pensando...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Sugestões rápidas (quando há conversa) */}
      {mensagens.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {sugestoes.slice(0, 3).map((s, i) => (
            <button
              key={i}
              onClick={() => enviarMensagem(s)}
              disabled={loading}
              className="text-xs bg-gray-100 hover:bg-purple-50 hover:text-purple-700 border border-gray-200 rounded-full px-3 py-1 transition disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte algo sobre estoque, vendas, produtos... (Enter para enviar)"
          disabled={loading}
          rows={2}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:opacity-50"
        />
        <button
          onClick={() => enviarMensagem(input)}
          disabled={!input.trim() || loading}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-4 py-3 font-medium transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 self-stretch"
        >
          {loading ? <span className="animate-spin text-lg">⏳</span> : <span className="text-lg">➤</span>}
        </button>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400">
        Powered by Claude Sonnet · Os dados são buscados em tempo real do sistema
      </p>
    </div>
  );
}
