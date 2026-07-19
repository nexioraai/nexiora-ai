'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

type ChatMessage = {
  role: 'user' | 'assistant';
  content: ContentBlock[];
};

type ToolStatus = 'pending' | 'applying' | 'applied' | 'refused' | 'error';
type ToolState = { status: ToolStatus; error?: string };

type Props = {
  slug: string;
  onSiteUpdated?: (newSite: any) => void;
};

export default function AIAgentChat({ slug, onSiteUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({});
  const [error, setError] = useState('');

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const callChat = async (newMessages: ChatMessage[], newUserMessage?: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`/api/agent/${slug}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: newUserMessage ?? '',
          history: newMessages,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Agent error');

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.content || [],
      };
      setMessages((m) => [...m, assistantMsg]);

      const newStates: Record<string, ToolState> = {};
      for (const block of assistantMsg.content) {
        if (block.type === 'tool_use') {
          newStates[block.id] = { status: 'pending' };
        }
      }
      setToolStates((s) => ({ ...s, ...newStates }));
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const hasPendingTools = (): boolean => {
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return false;
    return last.content.some(
      (b) => b.type === 'tool_use' && toolStates[b.id]?.status === 'pending'
    );
  };

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    if (hasPendingTools()) {
      setError('Approve or refuse the pending proposal first.');
      return;
    }
    const text = input.trim();
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: [{ type: 'text', text }] };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    await callChat(newMessages, text);
  };

  const appendToolResult = async (toolUseId: string, content: string, isError = false) => {
    const resultMsg: ChatMessage = {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }],
    };
    const next = [...messagesRef.current, resultMsg];
    setMessages(next);
    // Relance l'agent avec le resultat : sans cela il ne peut pas confirmer
    // au marchand ce qui vient d'etre fait, et reste silencieux apres l'action.
    await callChat(next);
  };

  const handleApprove = async (toolUseId: string, toolName: string, toolInput: any) => {
    setToolStates((s) => ({ ...s, [toolUseId]: { status: 'applying' } }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`/api/agent/${slug}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Apply failed');

      setToolStates((s) => ({ ...s, [toolUseId]: { status: 'applied' } }));
      if (onSiteUpdated && data.site) onSiteUpdated(data.site);
      appendToolResult(toolUseId, 'User approved and the change was applied successfully.');
    } catch (err: any) {
      setToolStates((s) => ({ ...s, [toolUseId]: { status: 'error', error: err.message } }));
      appendToolResult(toolUseId, `Failed to apply: ${err.message}`, true);
    }
  };

  const handleRefuse = (toolUseId: string) => {
    setToolStates((s) => ({ ...s, [toolUseId]: { status: 'refused' } }));
    appendToolResult(toolUseId, 'User refused this proposal.');
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full btn-nexiora text-white shadow-2xl hover:scale-105 transition-transform flex items-center justify-center"
          aria-label="Open AI Agent"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#0a0a14] border-l border-white/10 z-50 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full btn-nexiora flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-white font-semibold text-sm">AI Agent</div>
                <div className="text-slate-500 text-xs">Your personal site assistant</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white p-2 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-500 mt-12 px-6">
                <Sparkles className="w-8 h-8 mx-auto mb-3 text-[#E07040]/60" />
                <p className="text-sm text-white/80 mb-3">Ask me anything about your site.</p>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>"Change the name to Garage Pro"</p>
                  <p>"Add a service for free delivery"</p>
                  <p>"Make the slogan more catchy"</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                toolStates={toolStates}
                onApprove={handleApprove}
                onRefuse={handleRefuse}
              />
            ))}

            {loading && (
              <div className="flex gap-2 items-center text-slate-400 text-sm py-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E07040] animate-pulse" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E07040] animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E07040] animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
                <span>Thinking…</span>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg p-3">
                {error}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask the agent to change something…"
                rows={2}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#E07040] resize-none"
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !input.trim()}
                className="btn-nexiora text-white px-4 rounded-xl disabled:opacity-40 transition flex items-center justify-center"
                aria-label="Send"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  message,
  toolStates,
  onApprove,
  onRefuse,
}: {
  message: ChatMessage;
  toolStates: Record<string, ToolState>;
  onApprove: (id: string, name: string, input: any) => void;
  onRefuse: (id: string) => void;
}) {
  if (message.role === 'user') {
    const textBlock = message.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    if (!textBlock) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-[#E07040]/15 border border-[#E07040]/30 text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm whitespace-pre-wrap">
          {textBlock.text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message.content.map((block, i) => {
        if (block.type === 'text' && block.text.trim()) {
          return (
            <div
              key={i}
              className="bg-white/[0.05] border border-white/10 text-white rounded-2xl rounded-tl-sm px-4 py-2 text-sm max-w-[90%] whitespace-pre-wrap"
            >
              {block.text}
            </div>
          );
        }
        if (block.type === 'tool_use') {
          const state = toolStates[block.id] || { status: 'pending' };
          return (
            <ToolProposalCard
              key={i}
              block={block}
              state={state}
              onApprove={() => onApprove(block.id, block.name, block.input)}
              onRefuse={() => onRefuse(block.id)}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function ToolProposalCard({
  block,
  state,
  onApprove,
  onRefuse,
}: {
  block: { type: 'tool_use'; id: string; name: string; input: any };
  state: ToolState;
  onApprove: () => void;
  onRefuse: () => void;
}) {
  const renderSummary = () => {
    const input = block.input || {};
    switch (block.name) {
      case 'propose_field_update':
        return (
          <>
            Change <strong className="text-[#E07040]">{input.field}</strong> to:{' '}
            <span className="text-white">"{input.value}"</span>
          </>
        );
      case 'propose_color_update':
        return (
          <>
            Change primary color to{' '}
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-mono text-white"
              style={{ backgroundColor: input.color }}
            >
              {input.color}
            </span>
          </>
        );
      case 'propose_theme_change':
        return (
          <>
            Change theme to <strong className="text-[#E07040]">{input.theme}</strong>
          </>
        );
      case 'propose_add_service':
        return (
          <>
            Add service: <strong className="text-[#E07040]">{input.title}</strong>
            <div className="text-xs text-slate-400 mt-1">{input.description}</div>
          </>
        );
      case 'propose_remove_service':
        return (
          <>
            Remove service at index <strong className="text-[#E07040]">{input.index}</strong>
          </>
        );
      case 'propose_update_social':
        return (
          <>
            Update <strong className="text-[#E07040]">{input.platform}</strong>:{' '}
            <span className="text-slate-300 break-all text-xs">{input.url}</span>
          </>
        );
      case 'propose_contact_update':
        return (
          <>
            Update contact <strong className="text-[#E07040]">{input.field}</strong>:{' '}
            <span className="text-white">"{input.value}"</span>
          </>
        );
      case 'propose_service_update':
        return (
          <>
            Update service #{input.index} <strong className="text-[#E07040]">{input.field}</strong>:{' '}
            <span className="text-white">"{input.value}"</span>
          </>
        );
      case 'propose_testimonial_add':
        return (
          <>
            Add testimonial: <strong className="text-[#E07040]">{input.name}</strong>{' '}
            <span className="text-slate-400">({input.rating}★)</span>
            <div className="text-xs text-slate-400 mt-1 italic">"{input.content}"</div>
          </>
        );
      case 'propose_testimonial_remove':
        return <>Remove testimonial #{input.index}</>;
      case 'propose_testimonial_update':
        return (
          <>
            Update testimonial #{input.index} <strong className="text-[#E07040]">{input.field}</strong>:{' '}
            <span className="text-white">"{String(input.value)}"</span>
          </>
        );
      case 'propose_product_add':
        return (
          <>
            Add product: <strong className="text-[#E07040]">{input.name}</strong>
            {input.price && <span className="text-slate-300"> — {input.price}</span>}
            {input.description && (
              <div className="text-xs text-slate-400 mt-1">{input.description}</div>
            )}
          </>
        );
      case 'propose_product_remove':
        return <>Remove product #{input.index}</>;
      case 'propose_product_update':
        return (
          <>
            Update product #{input.index} <strong className="text-[#E07040]">{input.field}</strong>:{' '}
            <span className="text-white">"{input.value}"</span>
          </>
        );
      case 'propose_gallery_remove':
        return <>Remove gallery image #{input.index}</>;
      case 'propose_gallery_clear':
        return <>Clear the entire gallery (remove all images)</>;
      default:
        return <>{block.name}</>;
    }
  };

  const statusBadge = () => {
    if (state.status === 'applied')
      return <span className="text-green-400 text-xs font-bold">✓ Applied</span>;
    if (state.status === 'refused')
      return <span className="text-slate-500 text-xs font-bold">✗ Refused</span>;
    if (state.status === 'applying')
      return <span className="text-slate-400 text-xs">Applying…</span>;
    if (state.status === 'error')
      return <span className="text-red-400 text-xs">Error</span>;
    return null;
  };

  const borderClass =
    state.status === 'applied'
      ? 'border-green-500/30 bg-green-500/5'
      : state.status === 'refused' || state.status === 'error'
      ? 'border-white/10 bg-white/[0.02] opacity-70'
      : 'border-[#E07040]/40 bg-[#E07040]/5';

  return (
    <div className={`border rounded-2xl p-4 text-sm space-y-3 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
          Proposed change
        </div>
        {statusBadge()}
      </div>
      <div className="text-white leading-relaxed">{renderSummary()}</div>
      {block.input?.reason && (
        <div className="text-xs text-slate-400 italic border-l-2 border-white/10 pl-3">
          {block.input.reason}
        </div>
      )}
      {state.status === 'error' && state.error && (
        <div className="text-xs text-red-400">{state.error}</div>
      )}
      {state.status === 'pending' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onRefuse}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition"
          >
            Refuse
          </button>
          <button
            onClick={onApprove}
            className="flex-1 btn-nexiora py-2 rounded-lg text-xs font-semibold text-white transition"
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
