import { currentLang } from '../utils/lang';
import { z, ZodTypeAny } from 'zod';
import { env } from '../config/env';
import { AIUsageModel } from '../models/AI';
import { HttpError } from '../utils/http';

/**
 * PHASE 3 – Gọi Claude (Anthropic Messages API) qua fetch, không cần SDK.
 * Nguyên tắc: AI chỉ đưa GỢI Ý – mọi nội dung sinh ra là bản nháp để người học sửa/từ chối.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** AI luôn bật: mặc định chạy FOCUSLY Brain; chỉ dùng Claude khi AI_PROVIDER=claude và có khoá */
export const aiEnabled = () => true;

/** Số lượt AI trong 1 giờ qua. Lượt dịch được tính riêng để tra từ không làm hết lượt hỏi AI. */
export async function usedLastHour(userId: string, feature?: 'translate'): Promise<number> {
  const since = new Date(Date.now() - 3600_000);
  return AIUsageModel.countDocuments(
    feature ? { user: userId, feature, createdAt: { $gte: since } } : { user: userId, feature: { $ne: 'translate' }, createdAt: { $gte: since } },
  );
}

export const TRANSLATE_LIMIT_PER_HOUR = 200;

type CompleteOpts = {
  userId: string;
  feature: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
};

/** Các LLM đã cấu hình, theo thứ tự thử. Mặc định chỉ dùng gói MIỄN PHÍ (Groq, Gemini); Claude chỉ khi AI_PROVIDER=claude. */
export function llmProviders(): ('groq' | 'gemini' | 'claude')[] {
  const p = env.ai.provider;
  if (p === 'brain') return [];
  const list: ('groq' | 'gemini' | 'claude')[] = [];
  if (p === 'claude' && env.ai.apiKey) list.push('claude');
  if (env.ai.groqKey) list.push('groq');
  if (env.ai.geminiKey) list.push('gemini');
  return list;
}
export const llmReady = () => llmProviders().length > 0;

/** Gọi API kiểu OpenAI (Groq, Gemini đều hỗ trợ) */
async function openAiCompatible(base: string, key: string, model: string, opts: CompleteOpts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: opts.system }, ...opts.messages],
        max_tokens: Math.min(8000, (opts.maxTokens ?? 1500) * (/gpt-oss|thinking|r1|qwq/i.test(model) ? 2 : 1)),
        temperature: opts.temperature ?? 0.4,
        ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (!res.ok) throw new HttpError(res.status === 429 ? 429 : 502, `LLM lỗi ${res.status}: ${data.error?.message ?? ''}`, res.status === 429 ? 'AI_RATE_LIMIT' : 'AI_ERROR');
    const text = (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!text) throw new HttpError(502, 'LLM trả về rỗng', 'AI_ERROR');
    return { text, inTok: data.usage?.prompt_tokens ?? 0, outTok: data.usage?.completion_tokens ?? 0 };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, `Không kết nối được LLM: ${(e as Error).message}`, 'AI_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

async function callClaude(opts: CompleteOpts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ai.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.ai.model, max_tokens: opts.maxTokens ?? 1500, temperature: opts.temperature ?? 0.4, system: opts.system, messages: opts.messages }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new HttpError(502, `Không kết nối được dịch vụ AI: ${(e as Error).message}`, 'AI_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
  if (!res.ok) throw new HttpError(res.status === 429 ? 429 : 502, `Dịch vụ AI lỗi: ${data.error?.message ?? res.status}`, res.status === 429 ? 'AI_RATE_LIMIT' : 'AI_ERROR');
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  return { text, inTok: data.usage?.input_tokens ?? 0, outTok: data.usage?.output_tokens ?? 0 };
}

/**
 * Gọi LLM: thử lần lượt các nhà cung cấp đã cấu hình (Groq -> Gemini…); một nơi hết lượt / lỗi thì chuyển nơi khác.
 * Tất cả đều không dùng được -> lỗi LLM_DOWN để route chuyển sang FOCUSLY Brain.
 */
export async function complete(opts: CompleteOpts): Promise<string> {
  const providers = llmProviders();
  if (!providers.length) throw new HttpError(503, 'Chưa cấu hình LLM', 'AI_DISABLED');
  const isTranslate = opts.feature === 'translate';
  const limit = isTranslate ? TRANSLATE_LIMIT_PER_HOUR : env.ai.maxRequestsPerHour;
  if ((await usedLastHour(opts.userId, isTranslate ? 'translate' : undefined)) >= limit) {
    throw new HttpError(429, `Bạn đã dùng hết ${limit} lượt AI trong 1 giờ. Thử lại sau nhé.`, 'AI_RATE_LIMIT');
  }
  // Trả lời theo ngôn ngữ giao diện người dùng đang chọn
  if (!isTranslate && currentLang() === 'en') {
    opts = { ...opts, system: `${opts.system}\n\nIMPORTANT: The learner uses the English interface. Write every reply in English (JSON values included), unless the learner writes in another language.` };
  }
  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      const r =
        p === 'groq'
          ? await openAiCompatible('https://api.groq.com/openai/v1', env.ai.groqKey, env.ai.groqModel, opts)
          : p === 'gemini'
            ? await openAiCompatible('https://generativelanguage.googleapis.com/v1beta/openai', env.ai.geminiKey, env.ai.geminiModel, opts)
            : await callClaude(opts);
      await AIUsageModel.create({ user: opts.userId, feature: opts.feature, inputTokens: r.inTok, outputTokens: r.outTok });
      return r.text;
    } catch (e) {
      lastErr = e;
      console.warn(`[ai] ${p} không dùng được:`, (e as Error).message);
    }
  }
  throw new HttpError(503, `LLM tạm thời không dùng được (${(lastErr as Error)?.message ?? ''})`, 'LLM_DOWN');
}

/** Lấy JSON từ câu trả lời (bỏ ```json fences, lấy đoạn {...} hoặc [...] ngoài cùng) */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const starts = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) throw new Error('no json');
  const start = Math.min(...starts);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function completeJson<S extends ZodTypeAny>(opts: Parameters<typeof complete>[0] & { schema: S }): Promise<z.output<S>> {
  const system = `${opts.system}\n\nCHỈ trả về JSON hợp lệ, không thêm giải thích hay markdown.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete({ ...opts, system });
    try {
      const parsed = opts.schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
    } catch {
      /* thử lại */
    }
  }
  throw new HttpError(502, 'AI trả về dữ liệu không đúng định dạng, vui lòng thử lại', 'AI_BAD_OUTPUT');
}

/* ---------- RAG đơn giản: chọn đoạn tài liệu liên quan tới câu hỏi ---------- */

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');

export function relevantChunks(text: string, query: string, maxChars = 12_000, chunkSize = 2_500): string {
  if (text.length <= maxChars) return text;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
  const terms = [...new Set(normalize(query).split(/\s+/).filter((w) => w.length > 2))];
  const scored = chunks.map((c, i) => {
    const n = normalize(c);
    const score = terms.reduce((a, t) => a + (n.split(t).length - 1), 0);
    return { i, c, score };
  });
  const pick = new Set<number>([0]); // luôn kèm phần mở đầu (thường là mục lục/giới thiệu)
  scored
    .sort((a, b) => b.score - a.score)
    .forEach((s) => {
      if ((pick.size + 1) * chunkSize <= maxChars) pick.add(s.i);
    });
  return [...pick]
    .sort((a, b) => a - b)
    .map((i) => `[Đoạn ${i + 1}]\n${chunks[i]}`)
    .join('\n\n');
}

export const TUTOR_SYSTEM = `Bạn là FOCUSLY Tutor – trợ lý học tập thân thiện, trả lời bằng tiếng Việt (trừ khi người học dùng ngôn ngữ khác).
Nguyên tắc:
- Giải thích rõ ràng, có ví dụ cụ thể, chia ý ngắn gọn; dùng Markdown nhẹ (tiêu đề nhỏ, gạch đầu dòng, code block khi cần).
- Khuyến khích tư duy: khi phù hợp, đặt 1 câu hỏi gợi mở để người học tự kiểm tra.
- Nếu có tài liệu tham khảo, ưu tiên dựa vào tài liệu và nói rõ khi thông tin không có trong tài liệu.
- Không bịa đặt. Nếu không chắc chắn, hãy nói rõ.`;
