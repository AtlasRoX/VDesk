import React, { useState, useRef, useEffect } from 'react';
import { WorkspaceDirector } from '../../utils/ai/director';
import { WorkspaceContext } from '../../utils/ai/contextEngine';
import { captureVideoFrame } from '../../utils/ai/screenshot';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
}

interface AIChatProps {
  context: WorkspaceContext;
  onRuleTriggered: (actionKey: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export default function AIChat({ context, onRuleTriggered, videoRef }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'AI Operating Layer online. NIM multi-model routing active. Waiting for query.'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingModel, setStreamingModel] = useState('');
  
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const directorRef = useRef<WorkspaceDirector | null>(null);

  useEffect(() => {
    directorRef.current = new WorkspaceDirector();
  }, []);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming || !directorRef.current) return;

    const userText = inputValue;
    const snapshot = captureVideoFrame(videoRef.current);
    
    const userMessageContent = snapshot 
      ? `📷 [Real-Time Frame Captured]\n${userText}` 
      : userText;

    setInputValue('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessageContent }]);
    setIsStreaming(true);

    // Initial placeholder for assistant streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    let currentChunk = '';
    try {
      const response = await directorRef.current.processQuery(
        userText,
        context,
        (chunk) => {
          currentChunk += chunk;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              last.content = currentChunk;
            }
            return next;
          });
        },
        snapshot
      );

      // Finalize with model info
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          last.content = response.response;
          last.modelUsed = response.modelUsed;
        }
        return next;
      });

      // Execute mapped preset triggers if classified
      if (response.actionKey) {
        onRuleTriggered(response.actionKey);
      }
    } catch (err) {
      console.error('Director error:', err);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-850 rounded-lg overflow-hidden backdrop-blur-sm">
      {/* Toggler header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 text-left flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono select-none hover:bg-zinc-850/40 transition"
      >
        <span>💬 AI Conversational Interface</span>
        <span className="text-[9px] text-zinc-550">{isOpen ? 'COLLAPSE' : 'EXPAND'}</span>
      </button>

      {isOpen && (
        <div className="p-4 space-y-4 border-t border-zinc-850">
          {/* Scroll messages slot */}
          <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1 text-[11px] font-mono leading-relaxed">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border text-xs ${
                  msg.role === 'user'
                    ? 'bg-zinc-950/45 border-zinc-850/50 ml-6 text-zinc-300'
                    : 'bg-zinc-950/80 border-zinc-855 text-zinc-200'
                }`}
              >
                <div className="text-[8px] font-bold text-zinc-500 uppercase mb-1 flex justify-between items-center tracking-wider">
                  <span>{msg.role === 'user' ? 'USER' : 'WORKSPACE LAYER'}</span>
                  {msg.modelUsed && (
                    <span className="text-zinc-600 font-mono text-[7px] lowercase tracking-normal">
                      routed: {msg.modelUsed}
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-line leading-relaxed">{msg.content || '...'}</div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* User chat input bar */}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isStreaming}
              placeholder={isStreaming ? 'AI processing...' : 'Ask about screen context, latency triggers...'}
              className="grow px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 outline-none focus:border-blue-500 hover:border-zinc-700 transition placeholder-zinc-650"
            />
            <button
              type="submit"
              disabled={isStreaming || !inputValue.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            >
              SEND
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
