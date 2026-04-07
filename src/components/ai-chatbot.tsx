"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, X, Loader2, Settings, Minus } from "lucide-react";
import Link from "next/link";
import { loadAiConfig } from "@/app/dashboard/settings/page";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_QUESTIONS = [
  "Why did you suggest switching models?",
  "What can I do to reduce costs?",
  "Which user is spending the most?",
  "How is Engineering doing on budget?",
];

export function AiChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConfig, setHasConfig] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHasConfig(!!loadAiConfig().apiKey);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;

    const config = loadAiConfig();
    if (!config.apiKey) {
      setError("No API key configured. Go to Settings → AI Assistant to add one.");
      return;
    }

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? `Request failed (${res.status})`);

      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get response");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading]);

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-[9998] h-12 w-12 rounded-full bg-brand text-white shadow-lg hover:bg-brand-light transition-all duration-200 flex items-center justify-center hover:scale-105 active:scale-95"
        style={{ boxShadow: "0 4px 20px rgba(22, 22, 231, 0.3)" }}
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-[9998] w-[380px] max-h-[520px] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="h-8 w-8 rounded-lg bg-brand-subtle flex items-center justify-center">
              <Bot className="h-4 w-4 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">AI Assistant</p>
              <p className="text-[10px] text-muted-foreground">Ask about your AI usage & costs</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="text-center py-8">
                <div className="h-10 w-10 rounded-xl bg-brand-subtle flex items-center justify-center mx-auto mb-3">
                  <Bot className="h-5 w-5 text-brand" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">How can I help?</p>
                <p className="text-xs text-muted-foreground mb-4">
                  I can answer questions about your AI spend, usage, and optimization opportunities.
                </p>
                {!hasConfig ? (
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                  >
                    <Settings className="h-3 w-3" />
                    Configure API key in Settings
                  </Link>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {EXAMPLE_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => {
                          setInput(q);
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                        className="text-[11px] px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-brand/30 hover:bg-brand-subtle transition-colors text-left"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="h-6 w-6 rounded-md bg-brand-subtle flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-brand" />
                  </div>
                )}
                <div
                  className={`rounded-xl px-3.5 py-2 max-w-[82%] text-[13px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-brand text-white"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="h-6 w-6 rounded-md bg-brand-subtle flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3 w-3 text-brand" />
                </div>
                <div className="bg-muted rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-[13px] text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="hover:text-destructive/70 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-4 py-2.5 bg-card shrink-0">
            {messages.length > 0 && (
              <div className="flex justify-end mb-1.5">
                <button
                  onClick={() => setMessages([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear conversation
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={hasConfig ? "Ask a question..." : "Set up API key in Settings first"}
                disabled={!hasConfig}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 min-h-[36px] max-h-[100px]"
                style={{ height: "36px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "36px";
                  el.style.height = Math.min(el.scrollHeight, 100) + "px";
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading || !hasConfig}
                className="h-9 w-9 rounded-lg bg-brand text-white flex items-center justify-center hover:bg-brand-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
