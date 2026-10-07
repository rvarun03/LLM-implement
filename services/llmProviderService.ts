import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

export type LLMProvider = 'gemini' | 'openai' | 'ollama';

export interface LLMConfiguration {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
}

export interface ModelExecutionReceipt {
  id: string;
  timestamp: string;
  provider: LLMProvider;
  requestedModel: string;
  providerReportedModel: string;
  providerRequestId?: string;
  outputSha256: string;
  previousReceiptHash: string;
  receiptHash: string;
  verified: true;
}

export const PROVIDER_MODELS: Record<LLMProvider, Array<{ id: string; label: string; description: string }>> = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Used only after a timed-out Ollama request' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', description: 'Recommended: fast, long-context multimodal reasoning' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', description: 'Fastest current general-purpose option' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', description: 'Advanced reasoning model recommended by the Gemini API for new users' },
  ],
  openai: [
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', description: 'Fast and cost-efficient' },
    { id: 'gpt-4.1', label: 'GPT-4.1', description: 'Strong general-purpose reasoning' },
    { id: 'gpt-4o', label: 'GPT-4o', description: 'Multimodal general-purpose model' },
  ],
  ollama: [
    { id: 'qwen3:4b', label: 'Qwen 3 4B', description: 'Fast local text model for short documents (download required)' },
    { id: 'qwen3:4b', label: 'Qwen 3 4B', description: 'Fast local text model for smaller BRDs (download required)' },
    { id: 'qwen3:8b', label: 'Qwen 3 8B', description: 'Installed: capable local text model' },
    { id: 'qwen3:14b', label: 'Qwen 3 14B', description: 'Installed: stronger local text model (needs more RAM)' },
    { id: 'llama3.2:1b', label: 'Llama 3.2 1B', description: 'Very lightweight text model for CPU or low-VRAM GPUs' },
    { id: 'llama3.2:3b', label: 'Llama 3.2 3B', description: 'Compact, reliable general-purpose text model' },
    { id: 'llama3.1:8b', label: 'Llama 3.1 8B', description: 'Recommended Llama balance for AI stories, scenarios, and test cases' },
    { id: 'llama3.1:70b', label: 'Llama 3.1 70B', description: 'High-quality text model; needs a powerful GPU server' },
    { id: 'llama3.3:70b', label: 'Llama 3.3 70B', description: 'Advanced general-purpose Llama model; GPU server recommended' },
    { id: 'llama3.2-vision:11b', label: 'Llama 3.2 Vision 11B', description: 'Use for screenshot/image analysis on a GPU-hosted Ollama server' },
    { id: 'mistral:latest', label: 'Mistral 7B', description: 'Installed: general-purpose local text model' },
    { id: 'gemma:2b', label: 'Gemma 2B', description: 'Installed: lightweight local text model' },
    { id: 'gemma3:4b', label: 'Gemma 3 4B Vision', description: 'Vision + text; recommended lightweight local image model (download required)' },
    { id: 'deepseek-r1:1.5b', label: 'DeepSeek R1 1.5B', description: 'Fast local reasoning model; text-only (download required)' },
    { id: 'deepseek-r1:7b', label: 'DeepSeek R1 7B', description: 'Stronger local reasoning model; text-only and slower on CPU (download required)' },
    { id: 'deepseek-r1:1.5b', label: 'DeepSeek R1 1.5B', description: 'Pull required: compact local reasoning model (text only)' },
    { id: 'moondream:latest', label: 'Moondream Vision', description: 'Pull required: compact local vision model for screenshots and images' },
  ],
};

let activeConfig: LLMConfiguration = {
  provider: 'gemini',
  model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
};

// This configuration is not an active-provider switch. It is read only when
// the active provider is Ollama and its generation request times out.
let geminiTimeoutFallback: LLMConfiguration = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
};

// Stores evidence, not prompts or output. The hash chain makes in-memory receipt
// changes detectable while keeping customer data out of this audit view.
const MAX_RECEIPTS = 100;
const OLLAMA_CONNECT_TIMEOUT_MS = 8_000;
const OLLAMA_GENERATION_TIMEOUT_MS = 240_000;
let receipts: ModelExecutionReceipt[] = [];
let previousReceiptHash = 'GENESIS';
const normalizeModel = (model: string) => model.trim().replace(/^models\//, '');
const modelMatches = (requested: string, reported: string) => {
  const wanted = normalizeModel(requested), actual = normalizeModel(reported);
  // OpenAI can return the date-pinned snapshot for an alias such as gpt-4.1.
  return wanted === actual || actual.startsWith(`${wanted}-`);
};
const recordVerifiedExecution = (input: Omit<ModelExecutionReceipt, 'id' | 'previousReceiptHash' | 'receiptHash' | 'verified'>): ModelExecutionReceipt => {
  const id = crypto.randomUUID();
  const canonical = JSON.stringify({ ...input, id, previousReceiptHash });
  const receiptHash = crypto.createHash('sha256').update(canonical).digest('hex');
  const receipt: ModelExecutionReceipt = { ...input, id, previousReceiptHash, receiptHash, verified: true };
  receipts = [receipt, ...receipts].slice(0, MAX_RECEIPTS);
  previousReceiptHash = receiptHash;
  return receipt;
};

const toText = (contents: any): string => {
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) return contents.map(toText).filter(Boolean).join('\n');
  // Gemini-style content arrays contain { text } and { inlineData } parts. Ollama
  // needs only the text here; images are collected separately for its chat API.
  if (typeof contents?.text === 'string') return contents.text;
  if (contents?.inlineData) return '';
  if (contents?.parts) return contents.parts.map(toText).filter(Boolean).join('\n');
  return String(contents || '');
};

const toOllamaImages = (contents: any): string[] => {
  const parts = Array.isArray(contents) ? contents.flatMap((entry) => entry?.parts || [entry]) : (contents?.parts || [contents]);
  return parts.map((part: any) => /^image\//i.test(part?.inlineData?.mimeType || '') ? part.inlineData.data : '').filter(Boolean);
};

const toOpenAIContent = (contents: any): any[] => {
  const parts = Array.isArray(contents) ? contents.flatMap((entry) => entry?.parts || [entry]) : (contents?.parts || [contents]);
  return parts.map((part: any) => {
    if (typeof part === 'string') return { type: 'text', text: part };
    if (part?.text) return { type: 'text', text: part.text };
    if (part?.inlineData?.data) return { type: 'image_url', image_url: { url: `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}` } };
    return { type: 'text', text: JSON.stringify(part) };
  });
};

/** Single provider-neutral executor used by every server-side AI feature. */
export const llmProviderService = {
  configure(config: LLMConfiguration) {
    activeConfig = { ...config };
  },

  configureGeminiTimeoutFallback(apiKey: string) {
    geminiTimeoutFallback = { provider: 'gemini', model: 'gemini-2.5-flash', apiKey };
  },

  getGeminiTimeoutFallback() {
    return { enabled: Boolean(geminiTimeoutFallback.apiKey?.trim()), model: geminiTimeoutFallback.model };
  },

  getConfig(): LLMConfiguration {
    return { ...activeConfig };
  },

  getReceipts(limit = 25): ModelExecutionReceipt[] {
    return receipts.slice(0, Math.max(1, Math.min(limit, MAX_RECEIPTS)));
  },

  async validate(config: LLMConfiguration): Promise<void> {
    if (config.provider !== 'ollama' && !config.apiKey?.trim()) throw new Error('An API key is required.');
    await this.generateContentDirect({
      model: config.model,
      contents: 'Reply with the single word OK.',
      // Qwen models may spend a short token budget on hidden reasoning before
      // emitting content; eight tokens makes a healthy qwen3-vl model look broken.
      config: { maxOutputTokens: config.provider === 'ollama' && /qwen/i.test(config.model) ? 256 : 8 },
    }, config);
  },

  async generateContent(request: any, override?: LLMConfiguration): Promise<any> {
    const config = override || activeConfig;
    try {
      return await this.generateContentDirect(request, config);
    } catch (error: any) {
      const message = String(error?.message || '');
      const ollamaTimedOut = config.provider === 'ollama' && /ollama did not respond within|timeout|timed out/i.test(message);
      if (ollamaTimedOut && !geminiTimeoutFallback.apiKey?.trim()) {
        throw new Error('OLLAMA_TIMEOUT_GEMINI_FALLBACK_NOT_CONFIGURED: Ollama timed out. Save a Gemini API key under Gemini timeout fallback to retry with Gemini 2.5 Flash.');
      }
      if (ollamaTimedOut) {
        console.warn(`[LLM] Ollama ${config.model} timed out; retrying once with Gemini 2.5 Flash.`);
        try {
          const response = await this.generateContentDirect(request, geminiTimeoutFallback);
          response.fallbackProvider = 'gemini';
          response.fallbackReason = 'ollama_timeout';
          return response;
        } catch (fallbackError: any) {
          throw new Error(`OLLAMA_TIMEOUT_GEMINI_FALLBACK_FAILED: Gemini 2.5 Flash could not complete the retry. ${String(fallbackError?.message || fallbackError)}`);
        }
      }
      throw error;
    }
  },

  async generateContentDirect(request: any, override?: LLMConfiguration): Promise<any> {
    const config = override || activeConfig;
    if (config.provider !== 'ollama' && !config.apiKey) throw new Error(`No ${config.provider === 'gemini' ? 'Google Gemini' : 'OpenAI'} API key is configured.`);

    if (config.provider === 'gemini') {
      const client = new GoogleGenAI({ apiKey: config.apiKey });
      let response: any;
      let lastError: any;
      // Google can return a temporary 503 under high demand. Retry validation and
      // execution briefly instead of misreporting it as an invalid model/key.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await client.models.generateContent({ ...request, model: config.model });
          break;
        } catch (error: any) {
          lastError = error;
          const message = String(error?.message || '');
          if (!/503|UNAVAILABLE|high demand/i.test(message) || attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
        }
      }
      if (!response) throw lastError || new Error('Gemini returned no response.');
      // The provider-reported model is the proof. Never return an alias/fallback.
      const reportedModel = response.modelVersion || '';
      if (!reportedModel || !modelMatches(config.model, reportedModel)) {
        throw new Error(`MODEL_VERIFICATION_FAILED: requested ${config.model}, but Gemini reported ${reportedModel || 'no model version'}. Output was discarded.`);
      }
      const receipt = recordVerifiedExecution({
        timestamp: new Date().toISOString(), provider: config.provider, requestedModel: config.model,
        providerReportedModel: reportedModel, providerRequestId: response.responseId,
        outputSha256: crypto.createHash('sha256').update(response.text || '').digest('hex'),
      });
      response.model = reportedModel;
      response.requestedModel = config.model;
      response.provider = config.provider;
      response.executionReceipt = receipt;
      return response;
    }

    if (config.provider === 'ollama') {
      const baseUrl = (config.ollamaBaseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const wantsJson = request?.config?.responseMimeType === 'application/json' || Boolean(request?.config?.responseSchema);
      const images = toOllamaImages(request?.contents);
      // qwen3-vl and similar vision models are served most reliably through
      // Ollama's chat endpoint, including for text-only prompts.
      const useVisionChat = images.length > 0 || /(?:vl|vision|llava|minicpm-v|moondream)/i.test(config.model);
      const options = {
        temperature: request?.config?.temperature ?? 0.2,
        // Detailed JSON user-story arrays commonly exceed 600 tokens.
        num_predict: Math.min(Number(request?.config?.maxOutputTokens) || 1800, 2400),
        num_ctx: 4096,
      };
      let response: Response;
      const controller = new AbortController();
      // A stopped server, bad URL, or stalled local model must not leave the UI
      // waiting indefinitely. Validation is deliberately shorter than generation.
      const timeoutMs = Number(request?.config?.maxOutputTokens) <= 16
        ? OLLAMA_CONNECT_TIMEOUT_MS
        : OLLAMA_GENERATION_TIMEOUT_MS;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetch(baseUrl + (useVisionChat ? '/api/chat' : '/api/generate'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(useVisionChat
            ? { model: config.model, messages: [{ role: 'user', content: toText(request?.contents), images }], stream: false, keep_alive: '10m', format: wantsJson ? 'json' : undefined, think: false, options }
            : { model: config.model, prompt: toText(request?.contents), stream: false, keep_alive: '10m', format: wantsJson ? 'json' : undefined, think: false, options }),
        });
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          throw new Error('Ollama did not respond within ' + Math.round(timeoutMs / 1000) + ' seconds. Check that ' + config.model + ' fits in available RAM/VRAM, or use a smaller model such as llama3.2:latest.');
        }
        throw new Error('Could not reach Ollama at ' + baseUrl + '. Start Ollama, pull ' + config.model + ', and ensure this server can access it.');
      } finally {
        clearTimeout(timeout);
      }
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Ollama request failed (' + response.status + ')');
      const reportedModel = body?.model || '';
      if (!reportedModel || !modelMatches(config.model, reportedModel)) {
        throw new Error('MODEL_VERIFICATION_FAILED: requested ' + config.model + ', but Ollama reported ' + (reportedModel || 'no model name') + '. Output was discarded.');
      }
      const outputText = useVisionChat ? (body?.message?.content || '') : (body?.response || '');
      if (!outputText.trim()) {
        throw new Error('Ollama returned no output for ' + config.model + '. Retry the request, or restart the local model and try again.');
      }
      const receipt = recordVerifiedExecution({ timestamp: new Date().toISOString(), provider: config.provider,
        requestedModel: config.model, providerReportedModel: reportedModel, providerRequestId: body?.created_at,
        outputSha256: crypto.createHash('sha256').update(outputText).digest('hex') });
      return { text: outputText, model: reportedModel, requestedModel: config.model, provider: config.provider,
        executionReceipt: receipt,
        usageMetadata: { promptTokenCount: body?.prompt_eval_count || 0, candidatesTokenCount: body?.eval_count || 0,
          totalTokenCount: (body?.prompt_eval_count || 0) + (body?.eval_count || 0) } };
    }

    const wantsJson = request?.config?.responseMimeType === 'application/json' || Boolean(request?.config?.responseSchema);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: toOpenAIContent(request?.contents) }],
        max_tokens: request?.config?.maxOutputTokens,
        temperature: request?.config?.temperature,
        response_format: wantsJson ? { type: 'json_object' } : undefined,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error?.message || `OpenAI request failed (${response.status})`);
    }
    const body: any = await response.json();
    const reportedModel = body?.model || '';
    if (!reportedModel || !modelMatches(config.model, reportedModel)) {
      throw new Error(`MODEL_VERIFICATION_FAILED: requested ${config.model}, but OpenAI reported ${reportedModel || 'no model name'}. Output was discarded.`);
    }
    const outputText = body?.choices?.[0]?.message?.content || '';
    const receipt = recordVerifiedExecution({
      timestamp: new Date().toISOString(), provider: config.provider, requestedModel: config.model,
      providerReportedModel: reportedModel, providerRequestId: response.headers.get('x-request-id') || undefined,
      outputSha256: crypto.createHash('sha256').update(outputText).digest('hex'),
    });
    return {
      text: outputText,
      // OpenAI returns the concrete model used in its response body.
      model: reportedModel,
      requestedModel: config.model,
      provider: config.provider,
      executionReceipt: receipt,
      usageMetadata: {
        promptTokenCount: body?.usage?.prompt_tokens || 0,
        candidatesTokenCount: body?.usage?.completion_tokens || 0,
        totalTokenCount: body?.usage?.total_tokens || 0,
      },
    };
  },
};
