import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Cpu, Eye, EyeOff, KeyRound, Loader2, Plus, Save, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

type Provider = 'gemini' | 'openai' | 'ollama';
type Model = { id: string; label: string; description: string };
type Config = { provider: Provider; model: string; hasApiKey: boolean; maskedApiKey: string; ollamaBaseUrl?: string };
type Receipt = { id: string; timestamp: string; provider: Provider; requestedModel: string; providerReportedModel: string; providerRequestId?: string; outputSha256: string; receiptHash: string };

export const LLMSettings: React.FC = () => {
  const [config, setConfig] = useState<Config | null>(null);
  const [models, setModels] = useState<Record<Provider, Model[]>>({ gemini: [], openai: [], ollama: [] });
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://127.0.0.1:11434');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [showAddModel, setShowAddModel] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const [customModel, setCustomModel] = useState({ id: '', label: '', description: '' });

  const selectedModel = useMemo(() => models[provider]?.find(item => item.id === model), [models, provider, model]);
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/llm/config');
      const data = await response.json();
      if (!data.success) throw new Error();
      setConfig(data.config); setModels(data.models); setProvider(data.config.provider); setModel(data.config.model); setOllamaBaseUrl(data.config.ollamaBaseUrl || 'http://127.0.0.1:11434');
    } catch { toast.error('Could not load the active AI configuration.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const loadReceipts = async () => {
    try {
      const response = await fetch('/api/llm/receipts');
      const data = await response.json();
      if (data.success) setReceipts(data.receipts || []);
    } catch { /* Receipts are optional evidence; preserve normal settings behavior. */ }
  };
  useEffect(() => { loadReceipts(); }, []);
  const changeProvider = (value: Provider) => {
    setProvider(value); setModel(models[value]?.[0]?.id || ''); setApiKey('');
  };
  const addModel = async () => {
    setAddingModel(true);
    try {
      const response = await fetch('/api/llm/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, ...customModel }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to add this model.');
      setModels(data.models); setModel(customModel.id); setCustomModel({ id: '', label: '', description: '' }); setShowAddModel(false);
      toast.success(customModel.label + ' was added. Select Save & apply globally to activate it.');
    } catch (error: any) { toast.error(error.message || 'Unable to add this model.'); }
    finally { setAddingModel(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/llm/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, model, apiKey, ollamaBaseUrl, validate: true }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save configuration.');
      setConfig(data.config); setApiKey('');
      await loadReceipts();
      window.dispatchEvent(new Event('automatiqa-llm-config-changed'));
      toast.success(`${selectedModel?.label || model} is now active across AutomatiQA.`);
    } catch (error: any) { toast.error(error.message || 'Unable to validate and save this API key.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-10 flex items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-2" size={20} /> Loading AI configuration…</div>;
  return <div className="p-6 max-w-5xl mx-auto space-y-6">
    <section className="rounded-2xl overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-white shadow-xl">
      <div className="p-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div><div className="flex items-center gap-2 text-cyan-300"><Sparkles size={20} /><span className="text-xs font-black tracking-[0.18em] uppercase">Global AI configuration</span></div><h1 className="text-2xl font-black mt-2">LLM Provider & Model</h1><p className="text-sm text-slate-300 mt-2 max-w-xl">One secured configuration powers test generation, user stories, UI analysis, suggestions, scripts, and all other AI workflows.</p></div>
        {config?.hasApiKey ? <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/30 px-4 py-3 text-sm"><div className="flex gap-2 items-center text-emerald-300 font-bold"><CheckCircle2 size={17} /> Active model</div><div className="mt-1 font-semibold">{models[config.provider]?.find(x => x.id === config.model)?.label || config.model}</div></div> : <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 px-4 py-3 text-sm text-amber-200 flex gap-2"><TriangleAlert size={17} /> API key required</div>}
      </div>
    </section>
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-wider text-slate-500">1. AI provider</span><div className="relative"><select value={provider} onChange={e => changeProvider(e.target.value as Provider)} className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-500"><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="ollama">Ollama (local / GPU server)</option></select><ChevronDown className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" size={17} /></div></label>
        {provider === 'ollama' ? <label className="space-y-2"><span className="text-xs font-black uppercase tracking-wider text-slate-500">2. Ollama server URL (local or GPU host)</span><input value={ollamaBaseUrl} onChange={e => setOllamaBaseUrl(e.target.value)} placeholder="http://127.0.0.1:11434" className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-500" /></label> : <label className="space-y-2"><span className="text-xs font-black uppercase tracking-wider text-slate-500">2. API key</span><div className="relative"><KeyRound className="absolute left-3 top-3.5 text-slate-400" size={17} /><input value={apiKey} onChange={e => setApiKey(e.target.value)} type={showKey ? 'text' : 'password'} placeholder={config?.provider === provider && config.hasApiKey ? `Saved: ${config.maskedApiKey}` : `Enter ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key`} className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-10 py-3 text-sm outline-none focus:border-cyan-500" /><button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3 text-slate-400">{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>}
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-wider text-slate-500">3. Model</span><div className="relative"><select value={model} onChange={e => setModel(e.target.value)} className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-500">{models[provider]?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" size={17} /></div></label>
      </div>
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => setShowAddModel(!showAddModel)} className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-700 hover:text-cyan-900"><Plus size={15} /> {showAddModel ? 'Cancel adding model' : 'Add a model'}</button></div>
      {showAddModel && <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-sm font-black text-slate-800">Add a {provider === 'ollama' ? 'local Ollama' : provider === 'gemini' ? 'Gemini' : 'OpenAI'} model</p><p className="mt-1 text-xs text-slate-600">Use the exact model ID accepted by the selected provider. Ollama model IDs must already be pulled on the configured Ollama server.</p><div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3"><input value={customModel.id} onChange={e => setCustomModel(current => ({ ...current, id: e.target.value }))} placeholder="Model ID, e.g. qwen3:14b" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500" /><input value={customModel.label} onChange={e => setCustomModel(current => ({ ...current, label: e.target.value }))} placeholder="Display name" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500" /><input value={customModel.description} onChange={e => setCustomModel(current => ({ ...current, description: e.target.value }))} placeholder="Short description (optional)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500" /></div><button type="button" onClick={addModel} disabled={addingModel || !customModel.id.trim() || !customModel.label.trim()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-700 disabled:opacity-60">{addingModel ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{addingModel ? 'Adding…' : 'Add to model list'}</button></div>}
      <div className="mt-6 rounded-xl bg-cyan-50 border border-cyan-200 p-4 flex gap-3"><Cpu className="text-cyan-700 shrink-0" size={20} /><div><p className="font-bold text-slate-800 text-sm">{selectedModel?.label || 'Select a model'}</p><p className="text-xs text-slate-600 mt-1">{selectedModel?.description || 'Models shown here are restricted to the selected provider.'}</p></div></div>
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4"><div className="flex gap-2 text-xs text-slate-500"><ShieldCheck size={17} className="text-emerald-600" /> {provider === 'ollama' ? 'Ollama can run locally or on a GPU server. Use its reachable HTTPS URL; no API key is required by Ollama itself.' : 'Keys are encrypted on the server and never returned to the browser.'}</div><button onClick={save} disabled={saving || !model} className="w-full sm:w-auto flex justify-center items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-60"><>{saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}</> {saving ? 'Validating & applying…' : 'Save & apply globally'}</button></div>
    </section>
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8">
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-black text-slate-900">Verified execution receipts</h2><p className="text-xs text-slate-500 mt-1">The provider must report the exact selected model or its output is discarded. These records contain no prompt or output—only provider evidence and hashes.</p></div><button onClick={loadReceipts} className="text-xs font-bold text-cyan-700 hover:text-cyan-900">Refresh</button></div>
      {receipts.length === 0 ? <p className="mt-5 text-sm text-slate-500">No verified generations yet. Generate an AI artifact, then refresh.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500 border-b"><tr><th className="pb-2 pr-4">Time</th><th className="pb-2 pr-4">Verified model</th><th className="pb-2 pr-4">Provider request ID</th><th className="pb-2">Receipt hash</th></tr></thead><tbody>{receipts.map(r => <tr key={r.id} className="border-b border-slate-100 text-slate-700"><td className="py-3 pr-4 whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</td><td className="py-3 pr-4"><span className="font-bold text-emerald-700">✓ {r.providerReportedModel}</span><div className="text-slate-400 mt-0.5">Requested: {r.requestedModel} · {r.provider}</div></td><td className="py-3 pr-4 font-mono text-[10px]">{r.providerRequestId || 'Not supplied by provider'}</td><td className="py-3 font-mono text-[10px]" title={r.receiptHash}>{r.receiptHash.slice(0, 16)}…</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
};
