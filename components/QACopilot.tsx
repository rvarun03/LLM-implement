import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  X,
  Minus,
  Maximize2,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  ArrowUpRight,
  Shield,
  Coins,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { Project, User } from '../types';
import { getPageSuggestions, mapTabToFeatureId } from '../services/qaCopilotKnowledge';
import {
  CopilotMessage,
  CopilotContextPayload,
  askQACopilot,
  submitCopilotFeedback
} from '../services/qaCopilotService';
import { getProjectPlanSync } from '../services/tokenConsumptionService';

interface QACopilotProps {
  user: User | null;
  activeTab: string;
  activeProject: Project | null;
  projects: Project[];
  onNavigate: (tabId: any) => void;
  lastError?: { code?: string; message?: string } | null;
}

export const QACopilot: React.FC<QACopilotProps> = ({
  user,
  activeTab,
  activeProject,
  projects,
  onNavigate,
  lastError
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Derive human-readable page name
  const getPageDisplayName = (tab: string): string => {
    switch (tab) {
      case 'dashboard': return 'Dashboard';
      case 'projects': return 'Projects';
      case 'user_management': return 'Access Control';
      case 'ai_user_generator': return 'AI User Stories';
      case 'scenarios': return 'AI Test Scenarios';
      case 'cases':
      case 'manual': return 'AI Test Cases';
      case 'scripts': return 'Automation Script Generator';
      case 'record_play': return 'Record & Play - Web App';
      case 'mobile_testing': return 'Record & Play - Mobile App';
      case 'ui_testing': return 'UI Testing';
      case 'api': return 'API Testing';
      case 'performance': return 'API Performance Testing';
      case 'web_performance': return 'Web Performance Testing';
      case 'reports': return 'Reports';
      case 'token_consumption':
      case 'settings_credits': return 'Credits Consumption';
      case 'settings_jira': return 'Jira Settings';
      case 'settings_github': return 'GitHub Settings';
      case 'settings_slack': return 'Slack Settings';
      case 'settings_cache': return 'AI Cache Settings';
      default:
        if (tab.startsWith('execution')) return 'Execution Hub';
        return 'AutomatiQA';
    }
  };

  const pageDisplayName = getPageDisplayName(activeTab);

  // Refresh page-specific suggested questions whenever activeTab changes
  useEffect(() => {
    const suggestions = getPageSuggestions(activeTab);
    setSuggestedQuestions(suggestions);
  }, [activeTab]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen, isMinimized]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized]);

  // Get project credit info
  const projectPlan = activeProject ? getProjectPlanSync(activeProject.id, activeProject.name) : null;

  // Build context payload
  const buildContextPayload = (): CopilotContextPayload => {
    return {
      currentPage: pageDisplayName,
      currentRoute: `/${activeTab}`,
      currentFeature: pageDisplayName,
      userId: user?.email || 'guest',
      userEmail: user?.email || '',
      userRole: user?.role || 'Team Member',
      projectId: activeProject?.id || '',
      projectName: activeProject?.name || 'Default Project',
      lastError: lastError ? { code: lastError.code, message: lastError.message } : undefined,
      relevantCreditInfo: projectPlan ? {
        planType: projectPlan.planType,
        remainingCredits: projectPlan.remainingCredits,
        totalCredits: projectPlan.totalCredits,
        status: projectPlan.status
      } : undefined
    };
  };

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputValue).trim();
    if (!textToSend || isLoading) return;

    setErrorBanner(null);

    const userMessage: CopilotMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      // Build conversation history for API (last 6 messages)
      const conversationHistory = newMessages.slice(-6).map(m => ({
        role: m.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: m.content }]
      }));

      const context = buildContextPayload();
      const response = await askQACopilot({
        question: textToSend,
        conversationHistory,
        context
      });

      if (response.success && response.answer) {
        const assistantMessage: CopilotMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: response.answer,
          timestamp: Date.now(),
          intent: response.intent,
          navigationTarget: response.navigationTarget
        };
        setMessages([...newMessages, assistantMessage]);
      } else {
        setErrorBanner(response.error || 'Unable to retrieve answer. Please try again.');
        const fallbackMessage: CopilotMessage = {
          id: `msg-${Date.now()}-err`,
          role: 'assistant',
          content: response.error || 'QA Copilot is temporarily unable to respond. Please try again in a moment.',
          timestamp: Date.now()
        };
        setMessages([...newMessages, fallbackMessage]);
      }
    } catch (err: any) {
      console.warn('[QA Copilot Client error]:', err);
      setErrorBanner('QA Copilot encountered a network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageId: string, rating: 'helpful' | 'not_helpful') => {
    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg || targetMsg.feedbackGiven) return;

    // Find preceding question
    const msgIndex = messages.findIndex(m => m.id === messageId);
    const userQuestion = msgIndex > 0 ? messages[msgIndex - 1]?.content : 'N/A';

    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedbackGiven: rating } : m));

    await submitCopilotFeedback({
      question: userQuestion,
      answer: targetMsg.content,
      page: pageDisplayName,
      feature: pageDisplayName,
      rating,
      userEmail: user?.email,
      projectId: activeProject?.id
    });
  };

  const handleClearHistory = () => {
    setMessages([]);
    setErrorBanner(null);
  };

  // Helper to render markdown-like text (bolding, lists, code spans) cleanly
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');

    return (
      <div className="space-y-1.5 text-[13px] leading-relaxed select-text">
        {lines.map((line, idx) => {
          const trimmed = line.trim();

          if (!trimmed) {
            return <div key={idx} className="h-1" />;
          }

          // Numbered item: e.g. "1. Step description"
          const numberMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
          if (numberMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold shrink-0 mt-0.5 border border-teal-500/30">
                  {numberMatch[1]}
                </span>
                <span className="flex-1 text-slate-200">
                  {renderInlineFormatting(numberMatch[2])}
                </span>
              </div>
            );
          }

          // Bullet item: e.g. "- Item" or "* Item"
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const bulletText = trimmed.slice(2);
            return (
              <div key={idx} className="flex items-start gap-2 pl-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-2 shrink-0" />
                <span className="flex-1 text-slate-200">
                  {renderInlineFormatting(bulletText)}
                </span>
              </div>
            );
          }

          // Header line
          if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
            const title = trimmed.replace(/^#+\s*/, '');
            return (
              <p key={idx} className="font-bold text-teal-300 text-sm mt-2 mb-1 border-b border-slate-800 pb-1">
                {renderInlineFormatting(title)}
              </p>
            );
          }

          return (
            <p key={idx} className="text-slate-200">
              {renderInlineFormatting(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const renderInlineFormatting = (text: string) => {
    if (!text || typeof text !== 'string') return text || '';
    // Match bold **text** or inline `code`
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (!part || typeof part !== 'string') return part;
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1.5 py-0.5 bg-slate-800 text-teal-300 rounded text-xs font-mono border border-slate-700">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  // If user is not logged in, do not render Copilot
  if (!user) return null;

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          id="qa-copilot-trigger-btn"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 px-4 py-3 bg-slate-900/95 hover:bg-slate-850 text-white rounded-full border border-teal-500/40 hover:border-teal-400 shadow-xl shadow-slate-950/40 backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95 group"
          title="Open QA Copilot Assistant"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-teal-600 to-cyan-500 text-white shadow-md">
            <Bot size={18} className="transition-transform group-hover:rotate-12" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
            </span>
          </div>

          <div className="flex flex-col items-start text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white tracking-wide">QA Copilot</span>
              <span className="px-1.5 py-0.2 bg-teal-500/20 text-teal-300 text-[10px] font-semibold rounded border border-teal-500/30">
                AI
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              {pageDisplayName}
            </span>
          </div>
        </button>
      )}

      {/* Floating Copilot Panel */}
      {isOpen && (
        <div
          id="qa-copilot-panel"
          className={`fixed right-6 bottom-6 z-50 flex flex-col bg-slate-950/95 text-slate-100 border border-slate-800/80 rounded-2xl shadow-2xl backdrop-blur-xl transition-all duration-300 overflow-hidden ${
            isMinimized
              ? 'w-80 h-14'
              : 'w-[440px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-5rem)]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-teal-600 to-cyan-500 flex items-center justify-center text-white shrink-0 shadow">
                <Bot size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight truncate">QA Copilot</h3>
                  <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-300 text-[10px] font-medium rounded border border-teal-500/30 shrink-0">
                    Product Assistant
                  </span>
                </div>
                {!isMinimized && (
                  <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                    <span>📍 {pageDisplayName}</span>
                    {activeProject && (
                      <>
                        <span>•</span>
                        <span className="text-teal-400/90 truncate">📁 {activeProject.name}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!isMinimized && messages.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title="Clear Chat History"
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expand' : 'Minimize'}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                {isMinimized ? <Maximize2 size={15} /> : <Minus size={15} />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close QA Copilot"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Context / Credit Quick Status Pill */}
              <div className="px-3.5 py-1.5 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5 truncate">
                  <Shield size={12} className="text-teal-400 shrink-0" />
                  <span className="truncate">Role: <strong className="text-slate-200">{user.role}</strong></span>
                </div>
                {projectPlan && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Coins size={12} className="text-amber-400" />
                    <span>
                      <strong className="text-slate-200">{projectPlan.remainingCredits}</strong> / {projectPlan.totalCredits} Credits
                    </span>
                  </div>
                )}
              </div>

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {/* Intro message if no messages yet */}
                {messages.length === 0 && (
                  <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/30">
                        <Sparkles size={16} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-white">Welcome to AutomatiQA QA Copilot</h4>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          I am your dedicated product guide. Ask me anything about <strong>{pageDisplayName}</strong>, workflow steps, permissions, project credits, or troubleshooting.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <p className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1">
                        <HelpCircle size={12} className="text-teal-400" /> Suggested questions for this page:
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {suggestedQuestions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(q)}
                            className="text-left text-xs text-teal-300/90 hover:text-teal-200 bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-teal-500/40 px-3 py-2 rounded-lg transition-all flex items-center justify-between group"
                          >
                            <span className="truncate">{q}</span>
                            <ArrowUpRight size={13} className="text-slate-500 group-hover:text-teal-300 shrink-0 ml-1 transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Message stream */}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-teal-600 text-white rounded-br-none'
                          : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="text-xs font-medium whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="space-y-2">
                          {renderFormattedContent(msg.content)}

                          {/* Interactive Navigation Button */}
                          {msg.navigationTarget && (
                            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">Quick Action:</span>
                              <button
                                onClick={() => {
                                  if (msg.navigationTarget?.tab) {
                                    onNavigate(msg.navigationTarget.tab);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95"
                              >
                                <span>{msg.navigationTarget.label}</span>
                                <ArrowUpRight size={13} />
                              </button>
                            </div>
                          )}

                          {/* Feedback Row */}
                          <div className="pt-1.5 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/40">
                            <span>AutomatiQA Verified Knowledge</span>
                            <div className="flex items-center gap-2">
                              {msg.feedbackGiven ? (
                                <span className="text-teal-400 flex items-center gap-1">
                                  <CheckCircle2 size={11} /> Feedback recorded
                                </span>
                              ) : (
                                <>
                                  <span className="text-slate-500">Helpful?</span>
                                  <button
                                    onClick={() => handleFeedback(msg.id, 'helpful')}
                                    title="Helpful"
                                    className="p-1 hover:text-teal-300 hover:bg-slate-800 rounded transition-colors"
                                  >
                                    <ThumbsUp size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleFeedback(msg.id, 'not_helpful')}
                                    title="Not helpful"
                                    className="p-1 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                                  >
                                    <ThumbsDown size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-teal-400 shrink-0">
                      <Bot size={15} className="animate-spin" />
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-none px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium">
                        Analyzing AutomatiQA knowledge base...
                      </p>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {errorBanner && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-center justify-between text-xs text-rose-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={15} className="text-rose-400 shrink-0" />
                      <span>{errorBanner}</span>
                    </div>
                    <button
                      onClick={() => handleSendMessage()}
                      className="px-2 py-1 bg-rose-900 hover:bg-rose-850 text-white rounded flex items-center gap-1 font-semibold text-[11px]"
                    >
                      <RotateCcw size={11} /> Retry
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Suggestions Chips above Input */}
              {messages.length > 0 && suggestedQuestions.length > 0 && (
                <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-850 flex items-center gap-1.5 overflow-x-auto custom-scrollbar whitespace-nowrap">
                  <span className="text-[10px] text-slate-500 shrink-0 font-medium">Suggestions:</span>
                  {suggestedQuestions.slice(0, 3).map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(q)}
                      className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-teal-300 border border-slate-800 text-[11px] shrink-0 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input Footer */}
              <div className="p-3 bg-slate-900 border-t border-slate-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={`Ask about ${pageDisplayName}, credits, steps...`}
                    disabled={isLoading}
                    className="flex-1 bg-slate-950 border border-slate-750 focus:border-teal-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none transition-all disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isLoading}
                    className="p-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 text-white disabled:text-slate-600 rounded-xl transition-all disabled:cursor-not-allowed shrink-0 shadow"
                    title="Send message"
                  >
                    <Send size={15} />
                  </button>
                </form>

                <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-slate-500">
                  <span>Read-only guide · No project data altered</span>
                  <span>AutomatiQA v2.4</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};
