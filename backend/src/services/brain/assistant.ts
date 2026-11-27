/**
 * FOCUSLY Brain – Trợ lý hỏi đáp.
 * 1) Hiểu ý định câu hỏi (hôm nay học bao lâu, việc cần làm, thẻ cần ôn, giờ học tốt, phân tâm, mẹo học…)
 *    -> trả lời bằng chính dữ liệu học tập của người dùng.
 * 2) Câu hỏi kiến thức -> tìm câu trả lời trong tài liệu, flashcard, ghi chú của người dùng (BM25) và trích dẫn nguồn.
 * Không bịa: nếu không tìm thấy thì nói rõ và gợi ý cách thêm tài liệu.
 */
import { CardModel, MaterialModel, MaterialNoteModel } from '../../models/Learn';
import { FocusSessionModel } from '../../models/FocusSession';
import { TaskModel } from '../../models/Learning';
import { UserModel } from '../../models/User';
import { DistractionModel } from '../../models/Distraction';
import { dayKey, safeTimeZone } from '../../utils/time';
import { bm25, type Doc, fold, isVietnamese, keyphrases, sentences, seeded, summarize } from './text';
import { definitions, explainFromText, makeQuiz, makeSummary } from './generate';
import { forecastFor } from './forecast';
import { memoryForecast } from './memory';
import { answerFromWiki, fetchWiki, lookup } from './wiki';
import { knowledgeArticle, learnArticle, searchKnowledge } from './knowledge';
import { formatEntry, isEnglishWord, lookupWord } from './dictionary';
import { notifyChange } from '../realtime';

const has = (q: string, re: RegExp) => re.test(q);

const TIPS = [
  'Chia việc lớn thành phiên 25–50 phút, mỗi phiên một mục tiêu cụ thể (VD: "làm xong 10 câu chương 3").',
  'Trước khi học, cất điện thoại khỏi tầm mắt và bật Focus Shield – chỉ cần thấy điện thoại cũng làm giảm tập trung.',
  'Sau mỗi phiên, viết lại 3 ý vừa học mà không nhìn tài liệu (Active Recall) – cách nhớ lâu hiệu quả nhất.',
  'Ôn flashcard theo lịch lặp lại ngắt quãng mỗi ngày 10–15 phút thay vì ôn dồn trước kỳ thi.',
  'Khi thấy buồn ngủ hoặc chán: đứng dậy đi lại 3 phút, uống nước, rồi bắt đầu lại bằng việc dễ nhất.',
  'Học môn khó vào khung giờ bạn tỉnh táo nhất; để việc nhẹ (ôn thẻ, đọc lướt) cho lúc mệt.',
  'Giải thích bài cho người khác (hoặc cho chính mình) – chỗ nào nói không trôi là chỗ chưa hiểu.',
];

/** Kho kiến thức của người dùng: câu trong tài liệu + flashcard + ghi chú */
async function knowledge(userId: string, materialId?: string | null): Promise<Doc[]> {
  const docs: Doc[] = [];
  const mats = await MaterialModel.find({ user: userId, deletedAt: null, hasText: true, ...(materialId ? { _id: materialId } : {}) })
    .select('+textContent title')
    .sort({ lastOpenedAt: -1, updatedAt: -1 })
    .limit(materialId ? 1 : 25)
    .lean();
  for (const m of mats) {
    const sents = sentences((m as { textContent?: string }).textContent ?? '', 25, 400).slice(0, 1500);
    sents.forEach((s, i) => docs.push({ id: `${m._id}:${i}`, text: s, source: m.title }));
  }
  if (!materialId) {
    const cards = await CardModel.find({ user: userId, deletedAt: null }).select('front back').limit(800).lean();
    cards.forEach((c) => docs.push({ id: `card:${c._id}`, text: `${c.front} – ${c.back}`, source: 'Flashcard' }));
    const notes = await MaterialNoteModel.find({ user: userId, deletedAt: null }).select('content quote').limit(400).lean();
    notes.forEach((n) => docs.push({ id: `note:${n._id}`, text: [n.quote, n.content].filter(Boolean).join(' – '), source: 'Ghi chú' }));
  }
  return docs;
}

async function materialText(userId: string, materialId: string) {
  const m = await MaterialModel.findOne({ _id: materialId, user: userId }).select('+textContent title').lean();
  return m ? { title: m.title, text: (m as { textContent?: string }).textContent ?? '' } : null;
}

/** Lấy khái niệm từ câu "giải thích X", "X là gì", "what is X" */
function conceptOf(msg: string): string | null {
  const m =
    /(?:giải thích|giai thich|định nghĩa|khái niệm|explain|define)\s+(?:cho (?:mình|tôi|em)\s+)?(?:về\s+)?["“]?(.{2,80}?)["”]?\s*[?.!]*$/iu.exec(msg) ??
    /^["“]?(.{2,80}?)["”]?\s+(?:là gì|la gi|nghĩa là gì|có nghĩa là gì)\s*[?.!]*$/iu.exec(msg) ??
    /^(?:what is|what are|what's)\s+(.{2,80}?)\s*\??$/iu.exec(msg);
  return m ? m[1].trim() : null;
}

/**
 * Câu hỏi về DỮ LIỆU của chính người dùng (thời gian học, nhiệm vụ, thẻ cần ôn, giờ học tốt, phân tâm, "lưu bài…")
 * -> Brain trả lời chính xác bằng số liệu thật. Câu hỏi khác trả null để LLM (nếu có) đảm nhận.
 */
export async function directAnswer(userId: string, message: string): Promise<string | null> {
  return (await answer(userId, message, null, true)) || null;
}

export async function answer(userId: string, message: string, materialId?: string | null, intentsOnly = false): Promise<string> {
  const q = fold(message);
  const vi = isVietnamese(message) || !/^[\x00-\x7f]*$/.test(message) || !/\b(what|how|when|why|explain|summar|quiz|today|task)\b/i.test(message);
  const user = await UserModel.findById(userId).select('name profile').lean();
  const tz = safeTimeZone(user?.profile?.timezone);
  const name = (user?.name ?? '').split(' ').pop() ?? '';

  /* ---------- "lưu bài X": lưu bài Wikipedia thành tài liệu của người dùng ---------- */
  const save = /^(?:lưu bài|luu bai|lưu|save)\s+["“]?(.{2,120}?)["”]?\s*$/iu.exec(message.trim());
  if (save) {
    const title = save[1];
    const a = (await fetchWiki(title, isVietnamese(title) ? 'vi' : 'en')) ?? (await lookup(title));
    if (!a) return `Mình không tìm thấy bài Wikipedia “${title}”. Thử gõ đúng tên bài, ví dụ “lưu bài Quang hợp”.`;
    const exists = await MaterialModel.findOne({ user: userId, url: a.url, deletedAt: null }).select('_id title');
    if (exists) return `Bài “${a.title}” đã có trong Tài liệu của bạn. Mở mục Tài liệu để tóm tắt hoặc tạo flashcard, câu hỏi từ bài.`;
    const doc = await MaterialModel.create({
      user: userId,
      title: a.title.slice(0, 200),
      description: `Wikipedia (${a.lang === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}) – nội dung theo giấy phép CC BY-SA.`,
      category: 'Wikipedia',
      type: 'link',
      url: a.url,
      textContent: a.text,
      hasText: true,
    });
    notifyChange(userId, 'materials', 'create', doc.toJSON());
    return `Đã lưu **${a.title}** vào Tài liệu (${Math.round(a.text.length / 1000)}k ký tự). Giờ bạn có thể mở tài liệu này để **tóm tắt**, **tạo flashcard** hoặc **tạo 10 câu hỏi** – và hỏi mình bất cứ điều gì trong bài.`;
  }

  /* ---------- chào hỏi / giới thiệu ---------- */
  if (!intentsOnly && (has(q, /^(xin chao|chao|hello|hi|hey|alo)\b/) || has(q, /(ban la ai|ban lam duoc gi|giup duoc gi|what can you do)/))) {
    return [
      `Chào ${name || 'bạn'}! Mình là **FOCUSLY Brain** – trợ lý học tập chạy ngay trong FOCUSLY.`,
      '',
      'Bạn có thể hỏi mình:',
      '- "Hôm nay mình học được bao lâu?" · "Việc cần làm hôm nay?" · "Có bao nhiêu thẻ cần ôn?"',
      '- "Mình nên học lúc mấy giờ?" · "Sao mình hay bị phân tâm?" · "Cho mình mẹo tập trung"',
      '- Câu hỏi kiến thức: "Quang hợp là gì?", "Giải thích định luật Newton" – mình tìm trong tài liệu của bạn, không có thì tra Wikipedia',
      '- "Lưu bài Quang hợp" – lưu bài Wikipedia thành tài liệu để tạo flashcard, câu hỏi',
      '- Khi đang mở một tài liệu: "Tóm tắt ý chính", "Hỏi tôi 3 câu kiểm tra"',
    ].join('\n');
  }

  /* ---------- đang hỏi về một tài liệu cụ thể ---------- */
  if (materialId && !intentsOnly) {
    const m = await materialText(userId, materialId);
    if (m?.text) {
      if (has(q, /(tom tat|y chinh|summar|main idea)/)) return makeSummary(m.text, m.title);
      // "Tài liệu này nói về gì?" -> giới thiệu ngắn: ý chính + từ khoá
      if (has(q, /(noi ve (gi|cai gi|van de gi)|ve cai gi|ve chu de gi|noi dung (chinh|la gi|gi)|chu de (chinh|la gi)|tai lieu nay|bai nay|about|overview|gioi thieu)/)) {
        const main = summarize(m.text, 4);
        const keys = keyphrases(m.text, 8).map((k) => k.text);
        return [
          `**“${m.title}”** chủ yếu nói về:`,
          ...main.map((s) => `- ${s}`),
          '',
          keys.length ? `**Từ khoá chính:** ${keys.join(' · ')}` : '',
          '',
          '_Muốn chi tiết hơn: bấm “Tóm tắt” hoặc hỏi về một phần cụ thể._',
        ]
          .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
          .join('\n');
      }
      if (has(q, /(hoi toi|kiem tra|cau hoi|quiz|test me|on tap)/)) {
        const quiz = makeQuiz(m.text, 3, ['mcq', 'short', 'true_false'], m.title).questions;
        if (quiz.length) {
          const body = quiz.map((x, i) => {
            const opts = x.options.length ? '\n' + x.options.map((o, k) => `   ${String.fromCharCode(65 + k)}. ${o}`).join('\n') : x.type === 'true_false' ? '\n   (Đúng / Sai)' : '';
            return `${i + 1}. ${x.prompt}${opts}`;
          });
          const keys = quiz.map((x, i) => `${i + 1}: ${x.type === 'mcq' ? String.fromCharCode(65 + (x.correctIndex ?? 0)) : x.type === 'true_false' ? (x.correctBoolean ? 'Đúng' : 'Sai') : x.acceptedAnswers[0]}`);
          return [`**3 câu kiểm tra từ “${m.title}”:**`, '', ...body, '', `_Đáp án: ${keys.join(' · ')}_`].join('\n');
        }
      }
      const concept = conceptOf(message);
      if (concept) {
        const ex = explainFromText(concept, m.text);
        if (ex) return ex;
      }
      // "giải thích phần khó nhất / khái niệm quan trọng" -> liệt kê các định nghĩa cần nắm
      if (has(q, /(kho hieu|kho nhat|phan kho|khai niem|quan trong|key concept|hardest)/)) {
        const defs = definitions(m.text).slice(0, 6);
        if (defs.length) return ['**Những khái niệm cần nắm chắc:**', ...defs.map((d) => `- **${d.term}**: ${d.definition}`), '', '_Mẹo: che phần giải thích, tự nói lại từng khái niệm rồi kiểm tra._'].join('\n');
      }
    }
  }

  /* ---------- từ điển Anh–Việt: "nghĩa của từ X", "X nghĩa là gì", "define X", "dịch từ X" ---------- */
  const dict =
    /^(?:nghĩa của từ|nghia cua tu|từ|tra từ|tra tu|dịch từ|dich tu|define|meaning of|what does)\s+["“']?([a-z][a-z' -]{0,40}?)["”']?(?:\s+(?:là gì|la gi|nghĩa là gì|nghia la gi|mean|means))?\s*\??$/iu.exec(message.trim()) ??
    /^["“']?([a-z][a-z' -]{0,40}?)["”']?\s+(?:nghĩa là gì|nghia la gi|là gì|la gi|có nghĩa là gì|nghĩa tiếng việt là gì|tiếng việt là gì)\s*\??$/iu.exec(message.trim());
  if (dict && isEnglishWord(dict[1])) {
    const e = await lookupWord(dict[1]).catch(() => null);
    // chỉ trả lời kiểu từ điển khi từ điển tiếng Anh thật sự có mục này (tránh nhầm tiếng Việt không dấu)
    if (e && e.senses.length) return formatEntry(e);
  }

  /* ---------- câu hỏi về dữ liệu học tập của chính người dùng ---------- */
  if (has(q, /(hom nay|today).*(hoc|tap trung|focus|bao lau)|(hoc|tap trung).*(bao lau|duoc bao nhieu)/)) {
    const since = new Date(Date.now() - 36 * 3600_000);
    const today = dayKey(new Date(), tz);
    const ss = (await FocusSessionModel.find({ user: userId, deletedAt: null, startedAt: { $gte: since } }).select('startedAt actualFocusSeconds status').lean()).filter((s) => dayKey(s.startedAt, tz) === today);
    const min = Math.round(ss.reduce((a, s) => a + (s.actualFocusSeconds ?? 0), 0) / 60);
    const target = user?.profile?.dailyTargetMinutes ?? 120;
    const left = Math.max(0, target - min);
    return min
      ? `Hôm nay bạn đã tập trung **${min} phút** qua ${ss.length} phiên (mục tiêu ${target} phút). ${left ? `Còn ${left} phút nữa là đạt mục tiêu – một phiên ${Math.min(left, 50)} phút là gần xong!` : 'Bạn đã đạt mục tiêu hôm nay 🎉'}`
      : `Hôm nay bạn chưa có phiên học nào. Mục tiêu là ${target} phút – bắt đầu bằng một phiên 25 phút ở tab Tập trung nhé.`;
  }

  if (has(q, /(nhiem vu|viec can lam|lam gi|ke hoach hom nay|to ?do|task)/)) {
    const tasks = await TaskModel.find({ user: userId, deletedAt: null, status: { $in: ['todo', 'in_progress'] } })
      .sort({ deadline: 1, scheduledDate: 1 })
      .limit(6)
      .select('title deadline estimatedMinutes')
      .lean();
    if (!tasks.length) return 'Bạn không còn nhiệm vụ nào chưa xong. Thêm nhiệm vụ mới ở tab Kế hoạch, hoặc mở "Đề xuất & kế hoạch" để FOCUSLY Brain gợi ý.';
    return ['**Việc nên làm tiếp:**', ...tasks.map((t, i) => `${i + 1}. ${t.title} – ${t.estimatedMinutes ?? 30} phút${t.deadline ? `, hạn ${new Date(t.deadline).toLocaleDateString('vi-VN', { timeZone: tz })}` : ''}`), '', 'Gợi ý: bắt đầu với việc đầu tiên – nó gần hạn nhất.'].join('\n');
  }

  if (has(q, /(sap quen|de quen|quen mat|forget)/)) {
    const mf = await memoryForecast(userId, 5);
    if (!mf.atRisk.length) return 'Bạn chưa ôn flashcard nào nên Brain chưa dự báo được. Ôn vài thẻ ở tab Ôn tập rồi hỏi lại nhé.';
    return [
      `Theo **model dự báo trí nhớ** (half-life regression), ${mf.forgettingSoon} thẻ có khả năng nhớ dưới 70% trong 24 giờ tới.`,
      '',
      '**Những thẻ dễ quên nhất lúc này:**',
      ...mf.atRisk.map((c) => `- ${c.front} – còn nhớ khoảng **${Math.round(c.recallNow * 100)}%**`),
      '',
      'Ôn ngay những thẻ này ở tab Ôn tập để giữ chúng trong trí nhớ dài hạn.',
    ].join('\n');
  }

  if (has(q, /(the|flashcard|on tap|on bai).*(can on|den han|bao nhieu)|can on gi/)) {
    const due = await CardModel.countDocuments({ user: userId, deletedAt: null, suspended: { $ne: true }, 'srs.due': { $lte: new Date() } });
    return due ? `Bạn có **${due} thẻ** đến hạn ôn. Mở tab Ôn tập và ôn khoảng ${Math.min(30, Math.ceil(due / 2))} phút là xong.` : 'Không có thẻ nào đến hạn. Bạn có thể học bài mới hoặc tạo thêm flashcard từ tài liệu.';
  }

  if (has(q, /(gio nao|khung gio|luc nao|may gio|best time|when should)/) || has(q, /(nen hoc).*(bao lau|may phut)/)) {
    const f = await forecastFor(userId);
    if (!f.trained) return `FOCUSLY Brain cần ít nhất 6 phiên học (bạn đang có ${f.samples}) để biết bạn học tốt nhất lúc nào. Cứ học đều vài ngày, mình sẽ tự rút ra!`;
    return [
      `Theo **model dự báo tập trung** học từ ${f.samples} phiên của bạn:`,
      `- Khung giờ tốt nhất: ${f.bestHours.map((b) => `**${b.hour}h** (${Math.round(b.probability * 100)}%)`).join(', ')}`,
      `- Độ dài phiên phù hợp: khoảng **${f.suggestedMinutes} phút**`,
      `- Bây giờ (${f.now.hour}h): khả năng giữ tập trung ${Math.round(f.now.probability * 100)}% – ${f.now.level === 'high' ? 'thời điểm tốt để học bài khó' : f.now.level === 'medium' ? 'ổn, nên chọn việc vừa sức' : 'dễ phân tâm, thử phiên ngắn + Phiên nghiêm ngặt'}`,
    ].join('\n');
  }

  if (has(q, /(phan tam|xao nhang|distract|mat tap trung|khong tap trung)/)) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const ds = await DistractionModel.find({ user: userId, occurredAt: { $gte: since }, deletedAt: null }).select('reason').lean();
    const by = new Map<string, number>();
    ds.forEach((d) => by.set(d.reason, (by.get(d.reason) ?? 0) + 1));
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const label: Record<string, string> = { phone: 'điện thoại', social_media: 'mạng xã hội', noise: 'tiếng ồn', tired: 'mệt mỏi', hungry: 'đói', thoughts: 'suy nghĩ lan man', left_app: 'rời app', other: 'lý do khác' };
    const rnd = seeded(message + Date.now().toString().slice(0, 8));
    return [
      ds.length ? `30 ngày qua bạn ghi nhận **${ds.length} lần phân tâm**, nhiều nhất do: ${top.map(([r, n]) => `${label[r] ?? r} (${n})`).join(', ')}.` : 'Bạn chưa ghi nhận lần phân tâm nào trong 30 ngày qua – tuyệt vời!',
      '',
      '**Thử ngay:**',
      `- ${TIPS[1]}`,
      `- ${TIPS[Math.floor(rnd() * TIPS.length)]}`,
    ].join('\n');
  }

  if (!intentsOnly && has(q, /(meo|bi quyet|lam sao de|cach (hoc|tap trung)|tip|met|chan|luoi|buon ngu|dong luc|motivat)/)) {
    const rnd = seeded(message + new Date().toDateString());
    const picks = [...TIPS].sort(() => rnd() - 0.5).slice(0, 3);
    return ['**Vài cách giúp bạn học hiệu quả hơn:**', ...picks.map((t) => `- ${t}`)].join('\n');
  }

  /* ---------- câu hỏi kiến thức: tìm trong tài liệu của người dùng ---------- */
  if (intentsOnly) return '';
  // 1) tài liệu, flashcard, ghi chú của chính người dùng  2) không có -> tra Wikipedia
  const docs = await knowledge(userId, materialId);
  const concept = conceptOf(message);
  if (concept && !materialId && docs.length) {
    const all = docs.filter((d) => d.source !== 'Flashcard' && d.source !== 'Ghi chú').map((d) => d.text).join('\n');
    const ex = explainFromText(concept, all);
    if (ex) return ex;
  }
  const hits = docs.length ? bm25(docs, message) : [];
  // đang hỏi trong một tài liệu mà không khớp từ khoá nào -> giới thiệu tài liệu thay vì đi tra Wikipedia
  if (materialId && !hits.length && docs.length) {
    const main = summarize(docs.map((d) => d.text).join('\n'), 4);
    return [`Mình không thấy đoạn nào khớp trực tiếp với câu hỏi. Tài liệu **“${docs[0].source}”** chủ yếu nói về:`, ...main.map((x) => `- ${x}`), '', '_Thử hỏi bằng tên một khái niệm trong bài, VD: “X là gì?”._'].join('\n');
  }
  if (!hits.length || (hits[0].score < 1.2 && !materialId)) {
    // thư viện kiến thức chung (đã tải sẵn) trước, rồi mới tra Wikipedia trực tiếp
    const lib = await libraryAnswer(message, concept);
    if (lib) return lib;
    const wiki = await answerFromWiki(message, concept);
    if (wiki) {
      void learnArticle(wiki.article).catch(() => undefined); // tự học: lưu bài vào thư viện cho lần sau
      return wiki.text;
    }
    return vi
      ? `Mình chưa tìm thấy nội dung về “${message.slice(0, 80)}” trong tài liệu của bạn lẫn trên Wikipedia. Thử hỏi ngắn gọn bằng tên khái niệm (VD: “Quang hợp là gì?”), hoặc thêm tài liệu về chủ đề này ở mục Tài liệu.`
      : `I couldn't find “${message.slice(0, 80)}” in your materials or on Wikipedia. Try asking with just the concept name, or add a material on this topic.`;
  }
  const top = hits.slice(0, 3).filter((h) => h.score >= hits[0].score * 0.45);
  const bySource = new Map<string, string[]>();
  top.forEach((h) => bySource.set(h.doc.source ?? '', [...(bySource.get(h.doc.source ?? '') ?? []), h.doc.text]));
  const lines: string[] = [];
  for (const [src, texts] of bySource) {
    lines.push(src === 'Flashcard' || src === 'Ghi chú' ? `**Từ ${src.toLowerCase()} của bạn:**` : `**Theo “${src}”:**`);
    texts.forEach((t) => lines.push(`- ${t}`));
    lines.push('');
  }
  lines.push(vi ? '_FOCUSLY Brain trích từ tài liệu của bạn – hãy đọc lại đoạn gốc để hiểu đầy đủ ngữ cảnh._' : '_Quoted from your own materials by FOCUSLY Brain._');
  return lines.join('\n');
}

/* ---------------- Dịch Anh ⇄ Việt miễn phí (MyMemory, không cần khoá) ---------------- */
export async function translateFree(text: string, to: 'auto' | 'vi' | 'en') {
  const from = isVietnamese(text) ? 'vi' : 'en';
  const target = to === 'auto' ? (from === 'vi' ? 'en' : 'vi') : to;
  const src = target === from ? (target === 'vi' ? 'en' : 'vi') : from;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${src}|${target}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const data = (await r.json()) as { responseData?: { translatedText?: string }; matches?: { translation?: string; quality?: string | number }[] };
    const translation = (data.responseData?.translatedText ?? '').trim();
    if (!translation) throw new Error('empty');
    const short = text.trim().split(/\s+/).length <= 4;
    const alternatives = short
      ? [...new Set((data.matches ?? []).map((m) => (m.translation ?? '').trim()).filter((t) => t && t.toLowerCase() !== translation.toLowerCase()))].slice(0, 3)
      : [];
    return { from: src as 'vi' | 'en', to: target as 'vi' | 'en', translation, phonetic: null, partOfSpeech: null, alternatives, example: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Trả lời bằng thư viện kiến thức chung của FOCUSLY (bài Wikipedia đã lưu sẵn) */
async function libraryAnswer(message: string, concept: string | null): Promise<string | null> {
  if (concept) {
    const art = await knowledgeArticle(concept).catch(() => null);
    if (art) {
      const ex = explainFromText(concept, art.text);
      const lead = sentences(art.text, 30, 420).slice(0, 2);
      const body = ex ?? lead.map((s) => `- ${s}`).join('\n');
      return `**Theo thư viện FOCUSLY – ${art.title}:**\n${body}\n\n[Đọc bài đầy đủ](${art.url}) · _Wikipedia, CC BY-SA_\n\nGõ **“lưu bài ${art.title}”** để lưu thành tài liệu của bạn.`;
    }
  }
  const hits = (await searchKnowledge(message, 5).catch(() => [])).filter((h) => h.score >= 3);
  if (!hits.length) return null;
  const best = hits[0];
  // lấy thêm đoạn khác của CÙNG bài nếu cũng sát câu hỏi
  const same = hits.filter((h) => h.title === best.title && h.score >= best.score * 0.6).slice(0, 2);
  const lines = [...new Set(same.flatMap((h) => h.sentences))].slice(0, 4);
  const others = [...new Set(hits.filter((h) => h.title !== best.title).map((h) => h.title))].slice(0, 3);
  return [
    `**Theo thư viện FOCUSLY – ${best.title}:**`,
    ...lines.map((x) => `- ${x}`),
    '',
    `[Đọc bài đầy đủ](${best.url}) · _Wikipedia, CC BY-SA_`,
    others.length ? `\nBài liên quan: ${others.join(' · ')}` : '',
    '',
    `Gõ **“lưu bài ${best.title}”** để lưu thành tài liệu và tạo flashcard, câu hỏi từ bài này.`,
  ].join('\n');
}

/**
 * Ngữ cảnh cho LLM (RAG): các đoạn liên quan trong tài liệu, flashcard, ghi chú của người dùng
 * và thư viện kiến thức FOCUSLY – để LLM trả lời sát bài học và ghi nguồn.
 */
export async function contextFor(userId: string, message: string): Promise<string> {
  const parts: string[] = [];
  const docs = await knowledge(userId, null).catch(() => [] as Doc[]);
  const own = docs.length ? bm25(docs, message).filter((h) => h.score >= 1.2).slice(0, 5) : [];
  if (own.length) parts.push('TÀI LIỆU CỦA NGƯỜI HỌC:\n' + own.map((h) => `- [${h.doc.source}] ${h.doc.text}`).join('\n'));
  const lib = (await searchKnowledge(message, 3).catch(() => [])).filter((h) => h.score >= 3);
  if (lib.length) parts.push('THƯ VIỆN FOCUSLY (Wikipedia):\n' + lib.map((h) => `- [${h.title}] ${h.sentences.join(' ')}`).join('\n'));
  return parts.join('\n\n').slice(0, 6000);
}
