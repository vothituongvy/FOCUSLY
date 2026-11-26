'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { del, errorMessage, get, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { fmtRelative } from '@/lib/format';
import type { Conversation, Insight, Material } from '@/lib/types';
import { Markdown } from '@/components/Markdown';
import { Empty, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LOCALE, tr } from '@/lib/i18n';

interface AIStatus {
  enabled: boolean;
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
            {status.data.enabled ? tr('Model {0} · {1}/{2} lượt trong 1 giờ', status.data.model, status.data.usedLastHour, status.data.limitPerHour) : ''}
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

  // Chrome mới: scrollIntoView trả về Promise. Effect phải trả về hàm dọn dẹp hoặc không gì cả, nên dùng thân hàm có ngoặc { }
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages?.length, busy]);

  const open = async (id: string) => {
    const r = await get<{ item: Conversation }>(`/ai/conversations/${id}`);
    setConv(r.item);
    setMaterialId(r.item.material ?? '');
  };

  const send = async (text = input) => {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    const optimistic: Conversation = conv
      ? { ...conv, messages: [...(conv.messages ?? []), { role: 'user', content: text, at: new Date().toISOString() }] }
      : { id: '', title: text, material: materialId || null, subject: null, updatedAt: '', messages: [{ role: 'user', content: text, at: new Date().toISOString() }] };
    setConv(optimistic);
    setInput('');
    try {
      const r = await post<{ item: Conversation }>('/ai/chat', { conversationId: conv?.id || undefined, message: text, materialId: materialId || null });
      setConv(r.item);
      void convs.reload();
    } catch (e) {
      setError(errorMessage(e));
      setInput(text);
    } finally {
      setBusy(false);
    }
  };

  const textMaterials = (materials.data?.items ?? []).filter((m) => m.hasText);
  const suggestions = materialId
    ? [tr('Tóm tắt các ý chính của tài liệu'), tr('Giải thích phần khó hiểu nhất'), tr('Đặt cho tôi 3 câu hỏi kiểm tra')]
    : [tr('Giải thích đạo hàm bằng ví dụ đời thường'), tr('Phân biệt thì hiện tại hoàn thành và quá khứ đơn'), tr('Cách học hiệu quả với Pomodoro?')];

  return (
    <div className="grid" style={{ gridTemplateColumns: '240px minmax(0,1fr)', alignItems: 'start' }}>
      <div className="card col" style={{ gap: 4, maxHeight: '75vh', overflow: 'auto' }}>
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

      <div className="card col" style={{ minHeight: '70vh' }}>
        <div className="row">
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
        <div className="chat grow" style={{ overflow: 'auto', maxHeight: '58vh', padding: '6px 2px' }}>
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
              {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
            </div>
          ))}
          {busy && <div className="bubble assistant muted">{tr('Đang suy nghĩ…')}</div>}
          <div ref={endRef} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={tr('Nhập câu hỏi… (Enter để gửi, Shift+Enter xuống dòng)')}
            style={{ minHeight: 48 }}
          />
          <button className="btn" disabled={busy || !input.trim()} onClick={() => send()}>
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
        <div className="row">
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
