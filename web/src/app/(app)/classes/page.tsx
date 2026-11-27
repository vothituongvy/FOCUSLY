'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Spinner } from '@/components/ui';

interface ClassItem {
  id: string;
  name: string;
  description: string;
  code?: string;
  isTeacher: boolean;
  members: number;
  assignments: number;
}

export default function ClassesPage() {
  const router = useRouter();
  const list = useResource<{ items: ClassItem[] }>('/classes');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const go = async (fn: () => Promise<{ id?: string; item?: { id: string } }>) => {
    setError('');
    try {
      const r = await fn();
      router.push(`/classes/${r.id ?? r.item!.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const teaching = (list.data?.items ?? []).filter((c) => c.isTeacher);
  const learning = (list.data?.items ?? []).filter((c) => !c.isTeacher);

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Lớp học')}</h1>
          <p className="muted">{tr('Giáo viên tạo lớp, gửi mã cho học sinh; giao bộ flashcard hoặc bài kiểm tra và theo dõi tiến độ cả lớp.')}</p>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="grid grid-2">
        <form
          className="card col"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void go(() => post('/classes/join', { code: code.trim() }));
          }}
        >
          <h3>{tr('Vào lớp (học sinh)')}</h3>
          <label className="field">
            {tr('Mã lớp giáo viên gửi')}
            <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={12} />
          </label>
          <button className="btn" disabled={!code.trim()}>
            {tr('Vào lớp')}
          </button>
        </form>
        <form
          className="card col"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void go(() => post('/classes', { name: name.trim(), description: desc }));
          }}
        >
          <h3>{tr('Tạo lớp (giáo viên)')}</h3>
          <label className="field">
            {tr('Tên lớp')}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('VD: Tiếng Anh 10A2')} maxLength={100} />
          </label>
          <label className="field">
            {tr('Mô tả (không bắt buộc)')}
            <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
          </label>
          <button className="btn secondary" disabled={!name.trim()}>
            {tr('Tạo lớp')}
          </button>
        </form>
      </div>

      {!list.data ? (
        <Spinner />
      ) : !list.data.items.length ? (
        <div className="card">
          <Empty>{tr('Bạn chưa ở lớp nào.')}</Empty>
        </div>
      ) : (
        <>
          {teaching.length > 0 && <ClassList title={tr('Lớp bạn dạy')} items={teaching} />}
          {learning.length > 0 && <ClassList title={tr('Lớp bạn học')} items={learning} />}
        </>
      )}
    </div>
  );
}

function ClassList({ title, items }: { title: string; items: ClassItem[] }) {
  return (
    <section className="card col">
      <h3>{title}</h3>
      <div className="list">
        {items.map((c) => (
          <Link key={c.id} href={`/classes/${c.id}`} className="list-item" style={{ color: 'inherit' }}>
            <span className="grow col" style={{ gap: 2 }}>
              <b>{c.name}</b>
              <span className="small muted">
                {tr('{0} học sinh', c.members)} · {tr('{0} bài được giao', c.assignments)}
                {c.code && ` · ${tr('Mã {0}', c.code)}`}
              </span>
            </span>
            <span className="badge">{c.isTeacher ? tr('giáo viên') : tr('học sinh')}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
