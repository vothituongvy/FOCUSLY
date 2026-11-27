'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, del, errorMessage, get, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { fmtRelative } from '@/lib/format';
import type { Conversation, Insight, Material } from '@/lib/types';
import { Markdown } from '@/components/Markdown';
import { Empty, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ForecastCard } from '@/components/FocusForecast';
import { Feedback } from '@/components/Feedback';
import { LOCALE, tr } from '@/lib/i18n';

interface AIStatus {
  enabled: boolean;
  provider?: 'brain' | 'claude';
  knowledge?: { articles: number; topics: number } | null;
  model: string;
  usedLastHour: number;
  limitPerHour: number;
}

type Tab = 'chat' | 'coach';

function AIInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'chat');
  const status = useResource<AIStatus>('/ai/status');

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Trợ lý AI học tập')}</h1>
          <p className="muted">{tr('Hỏi đáp kiến thức, tóm tắt, giải thích, tạo câu hỏi và gợi ý kế hoạch học. AI chỉ gợi ý – bạn luôn có quyền sửa hoặc từ chối.')}</p>
        </div>
        {status.data && (
          <span className="small muted">
            {status.data.provider === 'brain'
              ? tr('FOCUSLY Brain · thư viện {0} bài kiến thức · không giới hạn lượt', status.data.knowledge?.articles ?? 0)
              : status.data.enabled
                ? tr('Model {0} · {1}/{2} lượt trong 1 giờ', status.data.model, status.data.usedLastHour, status.data.limitPerHour)
                : ''}
          </span>
        )}
      </div>
      {status.data && !status.data.enabled && (
        <div className="banner warn">{tr('AI chưa được bật trên máy chủ. Thêm ANTHROPIC_API_KEY vào backend/.env rồi khởi động lại API.')}</div>
      )}
      <div className="tabs">
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
          <Icon name="ai" size={16} />{' '}{tr('Hỏi đáp')}
        </button>
        <button className={`tab ${tab === 'coach' ? 'active' : ''}`} onClick={() => setTab('coach')}>
          <Icon name="focus" size={16} />{' '}{tr('Gợi ý & kế hoạch học')}
        </button>
      </div>
      {tab === 'chat' ? <Chat initialMaterial={params.get('material')} /> : <Coach />}
    </div>
  );
}

/* ======================= CHAT ======================= */
function Chat({ initialMaterial }: { initialMaterial: string | null }) {
  const convs = useResource<{ items: Conversation[] }>('/ai/conversations');
  const materials = useResource<{ items: Material[] }>('/materials?limit=200');
  const [conv, setConv] = useState<Conversation | null>(null);
  const [materialId, setMaterialId] = useState(initialMaterial ?? '');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // Khung chat vừa khít phần còn lại của màn hình: chỉ danh sách & tin nhắn cuộn, ô nhập luôn ở dưới
  useEffect(() => {
    const fit = () => {
      const el = shellRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(440, window.innerHeight - top - 20)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Chrome mới: scrollIntoView trả về Promise. Effect phải trả về hàm dọn dẹp hoặc không gì cả, nên dùng thân hàm có ngoặc { }
  useEffect(() => {
    // Chỉ cuộn khung tin nhắn, không kéo cả trang
    const box = endRef.current?.parentElement;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [conv?.messages?.length, busy]);

  const open = async (id: string) => {
    const r = await get<{ item: Conversation }>(`/ai/conversations/${id}`);
    setConv(r.item);
    setMaterialId(r.item.material ?? '');
  };

  /* ---- tệp đính kèm: ảnh (AI nhìn ảnh) + PDF/Word/Excel/TXT ---- */
  const [files, setFiles] = useState<Attach[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const addFiles = async (list: FileList | File[]) => {
    setError('');
    const picked: Attach[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPT_RE.test(f.name) && !f.type.startsWith('image/')) {
        setError(tr('“{0}” chưa hỗ trợ. Đính kèm ảnh, PDF, Word, Excel, TXT hoặc CSV.', f.name));
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        setError(tr('“{0}” lớn hơn 15MB.', f.name));
        continue;
      }
      const isImage = f.type.startsWith('image/');
      const file = isImage ? await shrinkImage(f) : f;
      picked.push({ file, preview: isImage ? URL.createObjectURL(file) : undefined });
    }
    setFiles((cur) => {
      const next = [...cur, ...picked];
      if (next.length > 4) setError(tr('Tối đa 4 tệp mỗi tin nhắn.'));
      return next.slice(0, 4);
    });
  };

  const send = async (text = input) => {
    if (!text.trim() && !files.length) return;
    setBusy(true);
    setError('');
    const sending = files;
    const attachments = sending.map((a) => ({ name: a.file.name, kind: a.preview ? 'image' : 'file', preview: a.preview }));
    const mine = { role: 'user' as const, content: text, at: new Date().toISOString(), ...(attachments.length ? { attachments } : {}) };
    const optimistic: Conversation = conv
      ? { ...conv, messages: [...(conv.messages ?? []), mine] }
      : { id: '', title: text || attachments.map((a) => a.name).join(', '), material: materialId || null, subject: null, updatedAt: '', messages: [mine] };
    setConv(optimistic);
    setInput('');
    setFiles([]);
    try {
      let r: { item: Conversation };
      if (sending.length) {
        const fd = new FormData();
        if (conv?.id) fd.append('conversationId', conv.id);
        fd.append('message', text);
        if (materialId) fd.append('materialId', materialId);
        sending.forEach((a) => fd.append('files', a.file, a.file.name));
        r = await api<{ item: Conversation }>('/ai/chat', { method: 'POST', body: fd });
        // giữ ảnh xem trước cho tin vừa gửi (máy chủ không lưu ảnh)
        const msgs = r.item.messages ?? [];
        const idx = msgs.length - 2;
        if (idx >= 0 && msgs[idx].attachments) msgs[idx] = { ...msgs[idx], attachments: attachments };
      } else {
        r = await post<{ item: Conversation }>('/ai/chat', { conversationId: conv?.id || undefined, message: text, materialId: materialId || null });
      }
      setConv(r.item);
      void convs.reload();
    } catch (e) {
      setError(errorMessage(e));
      setInput(text);
      setFiles(sending);
    } finally {
      setBusy(false);
    }
  };

  const textMaterials = (materials.data?.items ?? []).filter((m) => m.hasText);
  const suggestions = materialId
    ? [tr('Tóm tắt các ý chính của tài liệu'), tr('Giải thích phần khó hiểu nhất'), tr('Đặt cho tôi 3 câu hỏi kiểm tra')]
    : [tr('Hôm nay mình học được bao lâu?'), tr('Mình nên học lúc mấy giờ?'), tr('Việc cần làm tiếp theo?'), tr('Cho mình mẹo tập trung')];

  return (
    <div className="grid split-side chat-shell" ref={shellRef}>
      <div className="card col chat-list">
        <button
          className="btn sm block"
          onClick={() => {
            setConv(null);
            setError('');
          }}
        >
          {tr('+ Cuộc trò chuyện mới')}
        </button>
        {convs.data?.items.map((c) => (
          <div key={c.id} className="row" style={{ gap: 2 }}>
            <button className={`nav-link grow ${conv?.id === c.id ? 'active' : ''}`} style={{ border: 'none', background: conv?.id === c.id ? undefined : 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => open(c.id)}>
              <span className="truncate small">{c.title}</span>
            </button>
            <button
              className="icon-btn"
              onClick={async () => {
                await del(`/ai/conversations/${c.id}`);
                if (conv?.id === c.id) setConv(null);
                void convs.reload();
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div
        className={`card col chat-panel ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
      >
        <div className="row" style={{ flex: 'none' }}>
          <span className="small muted">{tr('Ngữ cảnh:')}</span>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} disabled={Boolean(conv?.id)} style={{ maxWidth: 360 }}>
            <option value="">{tr('Kiến thức chung')}</option>
            {textMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          {materialId && (
            <Link className="small" href={`/materials/${materialId}`}>
              {tr('Mở tài liệu')}
            </Link>
          )}
        </div>
        <div className="chat chat-scroll">
          {!conv?.messages?.length && (
            <div className="col" style={{ alignItems: 'center', padding: 30, gap: 10 }}>
              <p className="muted">{tr('Hỏi bất cứ điều gì bạn đang học.')}</p>
              <div className="chips" style={{ justifyContent: 'center' }}>
                {suggestions.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {conv?.messages?.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.attachments?.length ? <AttachmentChips items={m.attachments} /> : null}
              {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content.startsWith('📎 ') && m.attachments?.length ? null : m.content}
              {m.role === 'assistant' && conv?.id && (
                <Feedback kind="answer" origin={m.origin || 'brain'} text={conv.messages?.[i - 1]?.content} initial={m.vote ?? 0} conversationId={conv.id} index={i} />
              )}
            </div>
          ))}
          {busy && <div className="bubble assistant muted">{tr('Đang suy nghĩ…')}</div>}
          <div ref={endRef} />
        </div>
        {error && <p className="error-text">{error}</p>}
        {files.length > 0 && (
          <div className="attach-pending">
            {files.map((a, i) => (
              <span key={i} className="attach-chip">
                {a.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.preview} alt="" className="attach-mini" />
                ) : (
                  '📄'
                )}
                <span className="truncate">{a.file.name}</span>
                <button className="icon-btn" aria-label={tr('Bỏ tệp')} onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="row chat-input">
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept={ACCEPT}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button className="btn secondary icon-only" title={tr('Đính kèm ảnh hoặc tệp (PDF, Word, Excel, TXT)')} aria-label={tr('Đính kèm tệp')} disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="clip" size={18} />
          </button>
          <textarea
            value={input}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
              if (imgs.length) {
                e.preventDefault();
                void addFiles(imgs);
              }
            }}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={tr('Hỏi gì cũng được, hoặc đính kèm/dán ảnh, file… (Enter để gửi)')}
            rows={1} style={{ minHeight: 48, maxHeight: 160 }}
          />
          <button className="btn" disabled={busy || (!input.trim() && !files.length)} onClick={() => send()}>
            {tr('Gửi')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= COACH: Recommendations + Plan ======================= */
interface PlanItem {
  date: string;
  title: string;
  subject?: string | null;
  subjectId: string | null;
  estimatedMinutes: number;
  taskId?: string | null;
  timeOfDay?: string;
}
interface Reco {
  summary: string;
  recommendations: { title: string; reason: string }[];
  plan: PlanItem[];
  ruleInsights: Insight[];
}

function Coach() {
  const [reco, setReco] = useState<Reco | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const insights = useResource<{ insights: Insight[] }>('/analytics/insights');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const accept = () =>
    run('accept', async () => {
      const items = reco!.plan.filter((_, i) => selected.has(i)).filter((p) => !p.taskId);
      for (const p of items) {
        await post('/tasks', {
          title: p.title,
          subject: p.subjectId,
          estimatedMinutes: p.estimatedMinutes,
          scheduledDate: new Date(`${p.date}T${p.timeOfDay ?? '00:00'}:00`).toISOString(),
          priority: 'medium',
        });
      }
      setMsg(tr('Đã thêm {0} nhiệm vụ vào Kế hoạch học.', items.length));
      setSelected(new Set());
    });

  return (
    <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 14 }}>
        <ForecastCard />
        <div className="row wrap">
          <button className="btn" disabled={!!busy} onClick={() => run('reco', async () => setReco(await post<Reco>('/ai/recommendations')))}>
            {busy === 'reco' ? tr('AI đang phân tích dữ liệu...') : tr('Đề xuất & lập kế hoạch 7 ngày')}
          </button>
          <button className="btn secondary" disabled={!!busy} onClick={() => run('perf', async () => setAnalysis((await post<{ analysis: string }>('/ai/performance', { range: 'week' })).analysis))}>
            {busy === 'perf' ? tr('Đang phân tích...') : tr('Phân tích kết quả tuần')}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {analysis && (
          <div className="card">
            <Markdown text={analysis} />
          </div>
        )}
        {reco && (
          <>
            <div className="card col">
              <h3>{tr('Nhận xét')}</h3>
              <p>{reco.summary}</p>
              {reco.recommendations.map((r) => (
                <div key={r.title} className="card insight tip" style={{ boxShadow: 'none', padding: 12 }}>
                  <b>{r.title}</b>
                  <div className="small muted">{r.reason}</div>
                </div>
              ))}
            </div>
            <div className="card col">
              <div className="row between">
                <h3>{tr('Kế hoạch đề xuất')}</h3>
                <button className="btn sm" disabled={!selected.size || busy === 'accept'} onClick={accept}>
                  {tr('Thêm')}{' '}{selected.size || ''}{' '}{tr('mục vào kế hoạch')}
                </button>
              </div>
              {msg && <p className="success-text">{msg}</p>}
              <table className="table">
                <tbody>
                  {reco.plan.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={Boolean(p.taskId)}
                          checked={selected.has(i)}
                          onChange={() => setSelected((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))}
                        />
                      </td>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(`${p.date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit' })} {p.timeOfDay}
                      </td>
                      <td>
                        {p.title}
                        {p.taskId && <span className="badge" style={{ marginLeft: 6 }}>{tr('nhiệm vụ có sẵn')}</span>}
                      </td>
                      <td className="small muted">{p.subject}</td>
                      <td className="small">{p.estimatedMinutes}p</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!reco && !analysis && <Empty>{tr('AI sẽ đọc số liệu học tập (thời gian, nhiệm vụ, phân tâm, kết quả kiểm tra) để đề xuất cách cải thiện.')}</Empty>}
      </div>

      <div className="card col">
        <h3>Focus Intelligence</h3>
        <p className="small muted">{tr('Phân tích tự động 30 ngày (không dùng AI)')}</p>
        {!insights.data ? <Spinner /> : insights.data.insights.length === 0 ? <Empty>{tr('Cần thêm dữ liệu học tập.')}</Empty> : null}
        {insights.data?.insights.map((i) => (
          <div key={i.id} className={`card insight ${i.kind}`} style={{ boxShadow: 'none', padding: 12 }}>
            <b className="small">{i.title}</b>
            <div className="small muted">{i.detail}</div>
            {i.action && (
              <Link href={i.action.link} className="small">
                {i.action.label}
              </Link>
            )}
          </div>
        ))}
        <p className="small muted">{tr('Cập nhật {0}', fmtRelative(new Date().toISOString()))}</p>
      </div>
    </div>
  );
}

export default function AIPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AIInner />
    </Suspense>
  );
}

type Attach = { file: File; preview?: string };
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.xlsx,.txt,.md,.csv,.tsv';
const ACCEPT_RE = /\.(png|jpe?g|webp|gif|pdf|docx|xlsx|txt|md|csv|tsv)$/i;

/** Thu nhỏ ảnh lớn (≤ 1600px, JPEG) để gửi nhanh và vừa giới hạn của AI */
async function shrinkImage(f: File): Promise<File> {
  if (f.size < 900 * 1024 || f.type === 'image/gif') return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return f;
  }
}

function AttachmentChips({ items }: { items: { name: string; kind: string; preview?: string }[] }) {
  return (
    <div className="attach-row">
      {items.map((a, i) =>
        a.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={a.preview} alt={a.name} className="attach-thumb" />
        ) : (
          <span key={i} className="attach-chip" title={a.name}>
            {a.kind === 'image' ? '🖼' : '📄'} <span className="truncate">{a.name}</span>
          </span>
        ),
      )}
    </div>
  );
}
