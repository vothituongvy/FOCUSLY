'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Modal, Progress, Spinner } from '@/components/ui';
import { ExamForm } from '@/components/ExamForm';
import { Icon } from '@/components/Icon';

interface ExamItem {
  id: string;
  title: string;
  date: string;
  daysLeft: number;
  progress: number;
  overloaded: boolean;
  todayLeft: number;
  perDay: number;
  topics: { done: boolean }[];
}

export default function ExamsPage() {
  const router = useRouter();
  const list = useResource<{ items: ExamItem[] }>('/exams', ['sessions']);
  const [open, setOpen] = useState(false);
  const upcoming = (list.data?.items ?? []).filter((e) => e.daysLeft >= 0);
  const past = (list.data?.items ?? []).filter((e) => e.daysLeft < 0);
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Ôn thi')}</h1>
          <p className="muted">{tr('Nhập ngày thi và các chủ đề – FOCUSLY chia lịch ôn ngược về từng ngày, tự điều chỉnh theo số phút bạn học thật và các thẻ sắp quên.')}</p>
        </div>
        <button className="btn marker" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} /> {tr('Thêm kỳ thi')}
        </button>
      </div>
      {!list.data ? (
        <Spinner />
      ) : upcoming.length === 0 ? (
        <div className="card">
          <Empty>{tr('Chưa có kỳ thi nào sắp tới. Thêm một kỳ thi để có lịch ôn từng ngày.')}</Empty>
        </div>
      ) : (
        <div className="grid grid-2">
          {upcoming.map((e) => (
            <Link key={e.id} href={`/exams/${e.id}`} className="card col exam-card">
              <div className="row between">
                <h3 className="truncate">{e.title}</h3>
                <span className="exam-days">
                  <b>{e.daysLeft}</b> {tr('ngày')}
                </span>
              </div>
              <span className="small muted">{tr('Thi ngày {0}', new Date(`${e.date}T12:00:00`).toLocaleDateString())}</span>
              <Progress value={e.progress} />
              <span className="small">
                {tr('Đã xong {0}%', Math.round(e.progress * 100))} · {e.todayLeft > 0 ? tr('hôm nay còn {0} phút', e.todayLeft) : tr('hôm nay đã đủ')}
              </span>
              {e.overloaded && <span className="small" style={{ color: 'var(--stop)' }}>{tr('Quá tải: cần ~{0} phút/ngày – cân nhắc tăng giới hạn hoặc bớt chủ đề.', e.perDay)}</span>}
            </Link>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <section className="card col">
          <h3>{tr('Đã thi')}</h3>
          {past.map((e) => (
            <Link key={e.id} href={`/exams/${e.id}`} className="list-item" style={{ color: 'inherit' }}>
              <span className="grow">{e.title}</span>
              <span className="small muted">{e.date}</span>
            </Link>
          ))}
        </section>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={tr('Kỳ thi mới')} width={720}>
        <ExamForm onCancel={() => setOpen(false)} onSaved={(id) => router.push(`/exams/${id}`)} />
      </Modal>
    </div>
  );
}
