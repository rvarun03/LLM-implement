import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';

export const AICacheNotification: React.FC = () => {
  useEffect(() => {
    const handleCacheHit = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { functionName, savedTimeMs, source } = customEvent.detail || {};

      const prettyNames: Record<string, string> = {
        generateScenariosFromInput: 'AI Scenario Generation',
        generateTestCasesFromScenario: 'AI Test Case Generation',
        generateAutomationScript: 'Automation Script Generation',
        generateScenariosFromApiResponse: 'API Test Generation',
        generatePerformanceScenarios: 'Performance Test Generation',
        performUITesting: 'UI Screenshot Analysis',
        performFigmaDesignReview: 'Figma Design Review',
        generateUserStoriesFromDoc: 'Acceptance Criteria Generation',
        analyzePrImpact: 'PR Impact Analysis',
        generateSyntheticUsers: 'Synthetic User Generation',
        generateAutomationScriptFromFlow: 'Recorded Flow Automation Script'
      };

      const displayName = prettyNames[functionName] || 'AI Request';
      const savedSec = savedTimeMs ? (savedTimeMs / 1000).toFixed(1) : '3.0';

      toast.custom((t) => (
        <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-indigo-500/40 text-xs font-medium">
          <span className="p-1.5 bg-yellow-400/20 rounded-lg text-yellow-400 shrink-0">
            <Zap size={16} className="fill-yellow-400" />
          </span>
          <div className="space-y-0.5">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>⚡ Served from AI Cache</span>
              <span className="text-[10px] text-indigo-300 bg-indigo-900/80 px-1.5 py-0.5 rounded border border-indigo-700">Instant</span>
            </div>
            <p className="text-slate-300 text-[11px]">
              {displayName} returned instantly (saved ~{savedSec}s).
            </p>
          </div>
        </div>
      ), { duration: 3500, id: `cache-hit-${functionName}` });
    };

    window.addEventListener('ai-cache-hit', handleCacheHit);
    return () => {
      window.removeEventListener('ai-cache-hit', handleCacheHit);
    };
  }, []);

  return null;
};
