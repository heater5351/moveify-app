import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Plus, CheckCircle, AlertCircle, HelpCircle, BookOpen, Loader2, RotateCcw, Shield } from 'lucide-react';
import type { ProgramExercise } from '../types/index.ts';
import { streamAiChat, getAiUsage } from '../utils/ai';
import type { AiMessage, AiExerciseMatch, AiUsage } from '../utils/ai';

type AiAssistantPanelProps = {
  show: boolean;
  onClose: () => void;
  onAddToProgram: (exercises: ProgramExercise[]) => void;
  onOpenProtocols: () => void;
};

type DisplayMessage = {
  role: 'user' | 'assistant';
  content: string;
  exercises?: AiExerciseMatch[];
  isStreaming?: boolean;
};

const CONSENT_KEY = 'moveify_ai_consent';

export function AiAssistantPanel({ show, onClose, onAddToProgram, onOpenProtocols }: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [hasConsented, setHasConsented] = useState(() => localStorage.getItem(CONSENT_KEY) === 'true');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load usage on mount
  useEffect(() => {
    if (show && hasConsented) {
      getAiUsage().then(u => setUsage({ inputTokens: 0, outputTokens: 0, ...u })).catch(() => {});
    }
  }, [show, hasConsented]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (show && hasConsented) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [show, hasConsented]);

  const handleConsent = () => {
    localStorage.setItem(CONSENT_KEY, 'true');
    setHasConsented(true);
  };

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setInput('');
    const userMsg: DisplayMessage = { role: 'user', content: trimmed };
    const assistantMsg: DisplayMessage = { role: 'assistant', content: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // Build messages array for API (only role + content)
    const apiMessages: AiMessage[] = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAiChat(apiMessages, {
        onText: (text) => {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            return updated;
          });
        },
        onExercises: (exercises) => {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, exercises };
            }
            return updated;
          });
        },
        onDone: (usageData) => {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, isStreaming: false };
            }
            return updated;
          });
          setUsage(usageData);
          setIsStreaming(false);
        },
        onError: (errMsg) => {
          setError(errMsg);
          setMessages(prev => {
            const updated = [...prev];
            // Remove the empty assistant message
            if (updated[updated.length - 1]?.role === 'assistant' && !updated[updated.length - 1].content) {
              updated.pop();
            } else {
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, isStreaming: false };
              }
            }
            return updated;
          });
          setIsStreaming(false);
        },
      }, controller.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Failed to connect to AI assistant');
        setMessages(prev => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === 'assistant' && !updated[updated.length - 1].content) {
            updated.pop();
          }
          return updated;
        });
      }
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = { ...last, isStreaming: false };
      }
      return updated;
    });
  };

  const handleNewChat = () => {
    setMessages([]);
    setError(null);
  };

  const handleAddExercise = (match: AiExerciseMatch) => {
    if (!match.matched) return;
    const exercise: ProgramExercise = {
      id: 0,
      name: match.matched.name,
      category: 'Musculoskeletal',
      duration: '',
      description: '',
      exerciseType: (match.matched.exerciseType as 'reps' | 'duration' | 'cardio') || 'reps',
      equipment: match.matched.equipment || undefined,
      jointArea: match.matched.jointArea || undefined,
      muscleGroup: match.matched.muscleGroup || undefined,
      sets: match.suggested.sets || 3,
      reps: match.suggested.reps || 10,
      prescribedWeight: match.suggested.prescribedWeight,
      prescribedDuration: match.suggested.prescribedDuration,
      restDuration: match.suggested.restDuration,
      instructions: match.suggested.instructions,
      completed: false,
    };
    onAddToProgram([exercise]);
  };

  const handleAddAll = (exercises: AiExerciseMatch[]) => {
    const programExercises: ProgramExercise[] = exercises
      .filter(e => e.matched)
      .map(e => ({
        id: 0,
        name: e.matched!.name,
        category: 'Musculoskeletal',
        duration: '',
        description: '',
        exerciseType: (e.matched!.exerciseType as 'reps' | 'duration' | 'cardio') || 'reps',
        equipment: e.matched!.equipment || undefined,
        jointArea: e.matched!.jointArea || undefined,
        muscleGroup: e.matched!.muscleGroup || undefined,
        sets: e.suggested.sets || 3,
        reps: e.suggested.reps || 10,
        prescribedWeight: e.suggested.prescribedWeight,
        prescribedDuration: e.suggested.prescribedDuration,
        restDuration: e.suggested.restDuration,
        instructions: e.suggested.instructions,
        completed: false,
      }));
    if (programExercises.length > 0) {
      onAddToProgram(programExercises);
      onClose();
    }
  };

  // Strip the program-exercises code block from display text
  const stripCodeBlock = (text: string) => {
    return text.replace(/```program-exercises[\s\S]*?```\n?/g, '').trim();
  };

  const confidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'exact': return 'text-green-600 bg-green-50 border-green-200';
      case 'fuzzy': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-red-600 bg-red-50 border-red-200';
    }
  };

  const confidenceIcon = (confidence: string) => {
    switch (confidence) {
      case 'exact': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'fuzzy': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return <HelpCircle className="w-3.5 h-3.5" />;
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl border-l border-slate-200 flex flex-col z-50 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-primary-50 to-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary-500" />
          <h2 className="font-display font-semibold text-secondary-600">AI Assistant</h2>
          {usage && (
            <span className="text-xs text-slate-400 ml-1">
              {usage.dailyUsage}/{usage.dailyLimit} today
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenProtocols}
            className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
            title="Manage protocols"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewChat}
            className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
            title="New chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Privacy banner */}
      <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 text-xs text-slate-500">
        <Shield className="w-3 h-3 flex-shrink-0" />
        <span>PHI auto-removed &bull; Chat not saved &bull; Powered by Claude</span>
      </div>

      {/* Consent screen */}
      {!hasConsented ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <Sparkles className="w-12 h-12 text-primary-400 mx-auto mb-4" />
            <h3 className="font-display font-semibold text-lg text-secondary-600 mb-3">AI Exercise Assistant</h3>
            <p className="text-sm text-slate-600 mb-4">
              Generate exercise programs from SOAP notes or descriptions. Messages are processed by Anthropic's AI.
            </p>
            <div className="bg-slate-50 rounded-lg p-3 mb-4 text-left text-xs text-slate-600 space-y-1.5">
              <p><strong>Privacy:</strong> Patient identifying information (names, DOBs, contact details) is automatically removed before processing.</p>
              <p><strong>Storage:</strong> Chat history is not saved. Only token usage is logged.</p>
              <p><strong>Data:</strong> Messages are not used to train AI models.</p>
            </div>
            <button
              onClick={handleConsent}
              className="w-full py-2.5 bg-primary-400 hover:bg-primary-500 text-white rounded-lg font-medium text-sm transition-colors"
            >
              I understand, let's go
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 mt-12">
                <Sparkles className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-medium mb-2">How can I help?</p>
                <div className="space-y-2 text-xs">
                  <button
                    onClick={() => setInput('Generate a knee rehab program for post-ACL reconstruction, week 6-8')}
                    className="block w-full text-left px-3 py-2 bg-slate-50 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    "Generate a knee rehab program for post-ACL, week 6-8"
                  </button>
                  <button
                    onClick={() => setInput('Build a lower limb strengthening program with dumbbells, 3x per week')}
                    className="block w-full text-left px-3 py-2 bg-slate-50 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    "Lower limb strengthening with dumbbells, 3x per week"
                  </button>
                  <button
                    onClick={() => setInput('Shoulder rehabilitation program for rotator cuff tendinopathy, early stage')}
                    className="block w-full text-left px-3 py-2 bg-slate-50 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    "Shoulder rehab for rotator cuff tendinopathy, early stage"
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                {msg.role === 'user' ? (
                  <div className="bg-primary-400 text-white px-3.5 py-2 rounded-2xl rounded-tr-md max-w-[85%] text-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Text content */}
                    {stripCodeBlock(msg.content) && (
                      <div className="bg-slate-50 px-3.5 py-2.5 rounded-2xl rounded-tl-md max-w-[95%] text-sm text-slate-700 whitespace-pre-wrap">
                        {stripCodeBlock(msg.content)}
                        {msg.isStreaming && <span className="inline-block w-1.5 h-4 bg-primary-400 animate-pulse ml-0.5 align-text-bottom" />}
                      </div>
                    )}

                    {/* Exercise cards */}
                    {msg.exercises && msg.exercises.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-500 px-1">
                          Suggested exercises ({msg.exercises.length})
                        </div>
                        {msg.exercises.map((ex, j) => (
                          <div key={j} className={`border rounded-lg p-2.5 ${confidenceColor(ex.confidence)}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  {confidenceIcon(ex.confidence)}
                                  <span className="font-medium text-sm truncate">
                                    {ex.matched?.name || ex.suggested.name}
                                  </span>
                                </div>
                                {ex.confidence === 'fuzzy' && ex.matched && (
                                  <p className="text-xs opacity-75 mb-1">
                                    AI suggested: "{ex.suggested.name}"
                                  </p>
                                )}
                                <div className="flex items-center gap-2 text-xs opacity-75">
                                  {ex.suggested.sets && <span>{ex.suggested.sets} sets</span>}
                                  {ex.suggested.reps && <span>&times; {ex.suggested.reps} reps</span>}
                                  {ex.suggested.prescribedDuration && <span>&times; {ex.suggested.prescribedDuration}s</span>}
                                  {ex.suggested.prescribedWeight && <span>@ {ex.suggested.prescribedWeight}kg</span>}
                                </div>
                                {ex.suggested.instructions && (
                                  <p className="text-xs opacity-75 mt-1 italic">{ex.suggested.instructions}</p>
                                )}
                              </div>
                              {ex.matched && (
                                <button
                                  onClick={() => handleAddExercise(ex)}
                                  className="flex-shrink-0 p-1.5 hover:bg-white/50 rounded-lg transition-colors"
                                  title="Add to program"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Load All button */}
                        {msg.exercises.filter(e => e.matched).length > 1 && (
                          <button
                            onClick={() => handleAddAll(msg.exercises!)}
                            className="w-full py-2 px-3 bg-primary-400 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Load All into Program Builder ({msg.exercises.filter(e => e.matched).length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-200 p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the program you need..."
                className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent placeholder-slate-400 max-h-32"
                rows={2}
                disabled={isStreaming}
              />
              <div className="flex flex-col gap-1">
                {isStreaming ? (
                  <button
                    onClick={handleStop}
                    className="p-2.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-colors"
                    title="Stop generating"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="p-2.5 bg-primary-400 hover:bg-primary-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-colors"
                    title="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
