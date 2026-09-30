import React, { useState, useEffect, useMemo } from 'react';
import { Project, TestScenario, TestCase, TestStatus, TestType, TestIntent, TestPriority } from '../types';
import { 
  X, 
  Search, 
  Filter, 
  Check, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Inbox, 
  ArrowRight,
  Sparkles,
  Link2
} from 'lucide-react';
import { generateScenariosFromInput, generateTestCasesFromScenario } from '../geminiService';
import { logActivity } from '../services/activityService';

import { parseApiResponse } from '../services/apiUtils';

interface JiraImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  user: { email: string, name: string };
  onUpdateProject: (updated: Project) => void;
}

export const JiraImportModal: React.FC<JiraImportModalProps> = ({
  isOpen,
  onClose,
  project,
  user,
  onUpdateProject
}) => {
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<{
    storiesCount: number;
    scenariosCount: number;
    testCasesCount: number;
  } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && project?.id) {
      fetchJiraIssues();
      setImportSuccess(null);
    } else {
      setIssues([]);
      setSelectedIssueIds(new Set());
      setError(null);
      setImportSuccess(null);
    }
  }, [isOpen, project]);

  const fetchJiraIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/integration/jira/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          jiraConfig: project.jiraConfig
        })
      });
      const parsed = await parseApiResponse(response);
      if (parsed.ok && parsed.data?.success) {
        setIssues(parsed.data.issues || []);
      } else {
        setError(parsed.error || 'Failed to fetch issues. Verify Jira Config Settings.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while calling server proxy.');
    } finally {
      setLoading(false);
    }
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      const matchesSearch = 
        issue.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (issue.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = typeFilter === 'All' || issue.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [issues, searchQuery, typeFilter]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIssueIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIssueIds(next);
  };

  const handleToggleSelectAll = () => {
    if (selectedIssueIds.size === filteredIssues.length) {
      setSelectedIssueIds(new Set());
    } else {
      setSelectedIssueIds(new Set(filteredIssues.map(issue => issue.id)));
    }
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
    ]);
  };

  const handleImport = async () => {
    if (importing) return;
    if (selectedIssueIds.size === 0) return;
    
    setImporting(true);
    setImportProgress('Contacting Gemini AI to convert Jira stories into test scenarios...');

    try {
      const selectedIssuesList = issues.filter(issue => selectedIssueIds.has(issue.id));
      const newlyCreatedScenarios: TestScenario[] = [];

      let count = 0;
      for (const issue of selectedIssuesList) {
        count++;
        setImportProgress(`Gemini AI Analyzing ${issue.key} (${count}/${selectedIssuesList.length})...`);

        // Format description
        const rawDesc = (issue.description || '')
          .replace(/\\n/g, '\n')
          .trim();

        const storyPromptText = `User Story Number: ${issue.key}\nUser Story Summary: ${issue.summary}\nUser Story Description:\n${rawDesc || issue.summary}`;

        let aiScenarios: any[] = [];
        try {
          aiScenarios = await withTimeout(
            generateScenariosFromInput(storyPromptText, 'text'),
            12000,
            []
          );
        } catch (aiGenErr) {
          console.warn(`AI scenario generation failed for Jira story ${issue.key}:`, aiGenErr);
        }

        const scenariosToProcess: TestScenario[] = [];

        if (Array.isArray(aiScenarios) && aiScenarios.length > 0) {
          aiScenarios.forEach((s: any, idx: number) => {
            const scenId = s.scenarioId && s.scenarioId.startsWith('TS-') 
              ? `${issue.key}-${s.scenarioId}` 
              : `TS-${issue.key}-${idx + 1}`;

            scenariosToProcess.push({
              id: 'scen_' + Math.random().toString(36).substr(2, 9),
              scenarioId: scenId,
              title: s.title || `Verify ${issue.summary}`,
              type: s.type === 'Non-functional' ? 'Non-functional' : 'Functional',
              description: s.description || rawDesc || issue.summary,
              expectedResults: s.expectedResults || `Verify expected behavior specified in ${issue.key}`,
              isApproved: false,
              moduleName: s.moduleName || issue.epicKey || issue.key,
              testCases: [],
              createdAt: new Date().toISOString(),
              userStoryNumber: issue.key,
              userStorySummary: issue.summary,
              userStoryId: issue.key,
              priority: s.priority || (issue.priority === 'High' || issue.priority === 'Highest' ? 'High' : 'Medium'),
              tags: Array.isArray(s.tags) && s.tags.length > 0 ? s.tags : ['jira-import', issue.key.toLowerCase()]
            });
          });
        } else {
          // Fallback if AI scenario generation returned empty array or timed out
          scenariosToProcess.push({
            id: 'scen_' + Math.random().toString(36).substr(2, 9),
            scenarioId: `TS-${issue.key}-01`,
            title: `Verify ${issue.summary}`,
            type: 'Functional',
            description: rawDesc || issue.summary,
            expectedResults: `Successfully complete actions specified in Jira story: ${issue.key}`,
            isApproved: false,
            moduleName: issue.epicKey || issue.key,
            testCases: [],
            createdAt: new Date().toISOString(),
            userStoryNumber: issue.key,
            userStorySummary: issue.summary,
            userStoryId: issue.key,
            priority: issue.priority === 'High' || issue.priority === 'Highest' ? 'High' : 'Medium',
            tags: ['jira-import', issue.key.toLowerCase()]
          });
        }

        setImportProgress(`Generating Test Cases for ${issue.key} (${scenariosToProcess.length} scenarios)...`);

        // For each scenario, trigger parallel AI generation of detailed test cases with timeout
        await Promise.all(
          scenariosToProcess.map(async (newScen) => {
            try {
              const aiGeneratedCases = await withTimeout(
                generateTestCasesFromScenario(newScen, { url: project.appUrl || '' }),
                10000,
                []
              );

              if (Array.isArray(aiGeneratedCases) && aiGeneratedCases.length > 0) {
                newScen.testCases = aiGeneratedCases.map((tc: any, index: number) => {
                  let priorityMap = TestPriority.MEDIUM;
                  if (issue.priority === 'Highest' || issue.priority === 'High') priorityMap = TestPriority.HIGH;
                  if (issue.priority === 'Lowest' || issue.priority === 'Low') priorityMap = TestPriority.LOW;

                  let parsedSteps: string[] = [];
                  if (Array.isArray(tc.steps)) {
                    parsedSteps = tc.steps;
                  } else if (tc.steps) {
                    parsedSteps = [tc.steps];
                  } else {
                    parsedSteps = [`Navigate and execute verification for ${issue.key}`];
                  }

                  return {
                    id: 'tc_' + Math.random().toString(36).substr(2, 9),
                    testCaseId: `${newScen.scenarioId}-TC-${index + 1}`,
                    title: tc.title || `Verify ${issue.key} flow ${index + 1}`,
                    description: tc.description || '',
                    steps: parsedSteps,
                    expectedResult: tc.expectedResult || 'Expected outcome met successfully.',
                    status: TestStatus.NOT_STARTED,
                    testType: tc.testType || TestType.FUNCTIONAL,
                    testIntent: tc.testIntent || TestIntent.POSITIVE,
                    priority: priorityMap,
                    testDataSets: tc.testDataSets || []
                  };
                });
              } else {
                // Fallback test cases if generation was empty or timed out
                newScen.testCases = [
                  {
                    id: 'tc_' + Math.random().toString(36).substr(2, 9),
                    testCaseId: `${newScen.scenarioId}-TC-1`,
                    title: `Verify ${newScen.title}`,
                    description: `Automated test case generated for ${issue.key}`,
                    steps: [
                      `Log into system and navigate to module: ${newScen.moduleName || issue.key}`,
                      `Execute user flow: ${newScen.title}`,
                      `Verify result matches expected behavior`
                    ],
                    expectedResult: newScen.expectedResults || 'Expected outcome met successfully.',
                    status: TestStatus.NOT_STARTED,
                    testType: TestType.FUNCTIONAL,
                    testIntent: TestIntent.POSITIVE,
                    priority: issue.priority === 'High' || issue.priority === 'Highest' ? TestPriority.HIGH : TestPriority.MEDIUM,
                    testDataSets: []
                  },
                  {
                    id: 'tc_' + Math.random().toString(36).substr(2, 9),
                    testCaseId: `${newScen.scenarioId}-TC-2`,
                    title: `Negative & Error Validation for ${newScen.title}`,
                    description: `Validate error handling and boundary conditions for ${issue.key}`,
                    steps: [
                      `Navigate to module: ${newScen.moduleName || issue.key}`,
                      `Provide invalid or incomplete input parameters`,
                      `Verify appropriate validation error is shown`
                    ],
                    expectedResult: 'System displays clear validation message without crashing.',
                    status: TestStatus.NOT_STARTED,
                    testType: TestType.FUNCTIONAL,
                    testIntent: TestIntent.NEGATIVE,
                    priority: TestPriority.LOW,
                    testDataSets: []
                  }
                ];
              }
            } catch (tcErr) {
              console.warn(`AI Test Case Gen failed for scenario ${newScen.scenarioId}:`, tcErr);
              newScen.testCases = [{
                id: 'tc_fail_' + Math.random().toString(36).substr(2, 9),
                testCaseId: `${newScen.scenarioId}-TC-1`,
                title: `Verify ${newScen.title}`,
                steps: [`Log into system`, `Navigate to feature related to ${issue.key}`, `Execute actions from scenario: ${newScen.description}`],
                expectedResult: `Actions are performed cleanly without bugs.`,
                status: TestStatus.NOT_STARTED,
                testType: TestType.FUNCTIONAL,
                testIntent: TestIntent.POSITIVE,
                priority: TestPriority.MEDIUM,
                testDataSets: []
              }];
            }

            newlyCreatedScenarios.push(newScen);
          })
        );
      }

      setImportProgress('Finalizing AI Coverage and updating project...');

      // Append new scenarios to the project scenarios list in firestore
      const currentScenarios = project.scenarios || [];
      const updatedScenarios = [...newlyCreatedScenarios, ...currentScenarios];

      onUpdateProject({
        ...project,
        scenarios: updatedScenarios
      });

      const totalCasesCount = newlyCreatedScenarios.reduce((acc, s) => acc + s.testCases.length, 0);

      await logActivity(
        user.email,
        user.name,
        `Imported ${selectedIssuesList.length} Jira stories and generated ${newlyCreatedScenarios.length} scenarios with ${totalCasesCount} test cases`,
        project.id,
        project.name
      );

      setImportSuccess({
        storiesCount: selectedIssuesList.length,
        scenariosCount: newlyCreatedScenarios.length,
        testCasesCount: totalCasesCount
      });
      setSelectedIssueIds(new Set());
    } catch (err: any) {
      alert(`Import failed: ${err.message || 'An error occurred during bulk generation.'}`);
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-8 py-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Sparkles size={20} className="text-yellow-300" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Import From Atlassian Jira</h3>
              <p className="text-indigo-200 text-xs font-semibold mt-0.5">Parse active stories into AI-generated test scenarios & cases</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white hover:text-indigo-200 p-2 hover:bg-white/10 rounded-full transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 relative p-6 space-y-4">
          
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center z-10 transition-all">
              <Loader2 className="animate-spin text-indigo-600 mb-2" size={36} />
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Syncing active Jira Tickets...</p>
            </div>
          )}

          {importing && (
            <div className="absolute inset-0 bg-indigo-900/40 backdrop-blur-sm flex flex-col items-center justify-center z-20 transition-all p-8 text-center">
              <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center max-w-md">
                <Loader2 className="animate-spin text-indigo-600 mb-4" size={44} />
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2">Gemini AI Operating</h4>
                <p className="text-xs text-slate-500 font-bold leading-relaxed">{importProgress}</p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-indigo-600 h-1.5 animate-pulse w-full"></div>
                </div>
              </div>
            </div>
          )}

          {importSuccess ? (
            <div className="flex-1 bg-white rounded-3xl border border-slate-100 p-8 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-200 my-auto">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4 border border-emerald-100 shadow-sm">
                <CheckCircle2 size={36} />
              </div>
              <span className="px-3.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
                Import & Coverage Complete
              </span>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">
                AI Scenarios Generated Successfully!
              </h3>
              <p className="text-xs text-slate-500 max-w-md font-semibold leading-relaxed mb-6">
                Successfully converted <span className="text-slate-800 font-black">{importSuccess.storiesCount} Jira Stories</span> into <span className="text-indigo-600 font-black">{importSuccess.scenariosCount} AI Test Scenarios</span> with <span className="text-emerald-600 font-black">{importSuccess.testCasesCount} Detailed Test Cases</span>.
              </p>

              {/* Breakdown Grid */}
              <div className="grid grid-cols-3 gap-4 w-full max-w-md mb-8">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stories</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{importSuccess.storiesCount}</p>
                </div>
                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">AI Scenarios</p>
                  <p className="text-2xl font-black text-indigo-600 mt-1">{importSuccess.scenariosCount}</p>
                </div>
                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Test Cases</p>
                  <p className="text-2xl font-black text-emerald-700 mt-1">{importSuccess.testCasesCount}</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setImportSuccess(null);
                  setSelectedIssueIds(new Set());
                  onClose();
                }}
                className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all cursor-pointer flex items-center gap-2"
              >
                <Check size={16} /> Done & View AI Scenarios
              </button>
            </div>
          ) : (
            <>

          {/* Filters & Actions Bar */}
          {!error && !loading && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search Key, Summary..."
                    value={searchQuery || ''}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                
                <div className="relative">
                  <select
                    value={typeFilter || ''}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                  >
                    <option value="All">All Types</option>
                    <option value="Story">Story</option>
                    <option value="Epic">Epic</option>
                    <option value="Task">Task</option>
                    <option value="Bug">Bug</option>
                  </select>
                  <Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {selectedIssueIds.size > 0 && (
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{selectedIssueIds.size} Selected</span>
                  <button 
                    onClick={handleImport}
                    disabled={importing}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? <Loader2 size={14} className="animate-spin" /> : null}
                    {importing ? 'Generating AI Coverage...' : 'Generate AI Coverage'}
                    {!importing && <ArrowRight size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {error ? (
            <div className="flex-1 bg-white rounded-3xl border border-slate-100 p-8 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4 border border-rose-100">
                <AlertCircle size={28} />
              </div>
              <h3 className="text-sm font-black text-rose-800 uppercase tracking-wider mb-2">Integration Sync Denied</h3>
              <p className="text-xs text-slate-500 max-w-sm font-semibold mb-4">{error}</p>
              <button 
                onClick={fetchJiraIssues}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Retry Fetch
              </button>
            </div>
          ) : issues.length === 0 && !loading ? (
            <div className="flex-1 bg-white rounded-3xl border border-slate-100 p-8 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <Inbox size={24} />
              </div>
              <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">No tickets fetched yet</p>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed font-semibold">Verify there are issues belonging to project key '{project.jiraConfig?.projectKey || 'None'}' inside your Jira workspace.</p>
            </div>
          ) : (
            // Issue List Grid
            <div className="flex-1 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-y-auto flex-1">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="py-4 px-6 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={filteredIssues.length > 0 && selectedIssueIds.size === filteredIssues.length}
                          onChange={handleToggleSelectAll}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                      </th>
                      <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 w-24">Key</th>
                      <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 w-28">Type</th>
                      <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500">Summary</th>
                      <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 w-24">Status</th>
                      <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 w-24">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue) => {
                      const isChecked = selectedIssueIds.has(issue.id);
                      return (
                        <tr 
                          key={issue.id}
                          className={`border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-all ${isChecked ? 'bg-indigo-50/20' : ''}`}
                          onClick={() => handleToggleSelect(issue.id)}
                        >
                          <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={Boolean(isChecked)}
                              onChange={() => handleToggleSelect(issue.id)}
                              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                            />
                          </td>
                          <td className="py-4 px-4 text-xs font-bold text-indigo-700">
                            <span className="flex items-center gap-1">
                              <Link2 size={12} />
                              {issue.key}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              issue.type === 'Bug' ? 'bg-rose-50 border border-rose-100 text-rose-600' :
                              issue.type === 'Epic' ? 'bg-indigo-50 border border-indigo-100 text-indigo-600' :
                              issue.type === 'Task' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 border border-amber-100 text-amber-600'
                            }`}>
                              {issue.type}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{issue.summary}</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{issue.description || 'No criteria provided.'}</p>
                          </td>
                          <td className="py-4 px-4 text-xs font-bold text-slate-500">{issue.status}</td>
                          <td className="py-4 px-4 text-xs font-bold text-slate-500">{issue.priority}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
};
