'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { Modal } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

type Target = 'quiz' | 'flashcards';
type Mode = 'auto' | 'parse' | 'ai';

const SAMPLE: Record<Target, string> = {
  quiz: `Câu 1: Thủ đô của Việt Nam là?
A. Hà Nội
B. Huế
Đáp án: A

Câu 2: Số nào là số nguyên tố? (nhiều đáp án)
A. 2
B. 4
C. 5
Đáp án: A, C

Câu 3: Trái Đất quay quanh Mặt Trời.
Đáp án: Đúng`,
  flashcards: `apple - quả táo
book - quyển sách
Quang hợp | Quá trình cây tạo chất hữu cơ từ ánh sáng`,
};

/**
 * Nút + hộp thoại "Tạo từ file": tải lên Word / Excel / PDF / TXT.
 * File soạn sẵn câu hỏi/thẻ -> nhập thẳng; file bài giảng -> AI soạn. Kết quả mở ra dạng bản nháp để xem lại rồi lưu.
 */
export function ImportFromFile({ target, className = 'btn secondary', label }: { target: Target; className?: string; label?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSample, setShowSample] = useState(false);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('target', target);
      fd.append('mode', mode);
      const r = await api<{ mode: 'parsed' | 'ai'; draft: Record<string, unknown> }>('/ai/import', { method: 'POST', body: fd });
      if (target === 'quiz') {
        sessionStorage.setItem('focusly.quizDraft', JSON.stringify(r.draft));
        router.push('/learn/quiz/new?draft=1');
      } else {
        sessionStorage.setItem('focusly.cardsDraft', JSON.stringify(r.draft));
        router.push('/learn/decks/new?draft=1');
      }
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Icon name="upload" size={16} /> {label ?? tr('Tạo từ file')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={target === 'quiz' ? tr('Tạo bộ câu hỏi từ file') : tr('Tạo bộ flashcard từ file')}>
        <div className="col" style={{ gap: 14 }}>
          <p className="small muted">{tr('Hỗ trợ Word (.docx), Excel (.xlsx), PDF, TXT, CSV – tối đa 15 MB. Bạn sẽ xem lại bản nháp trước khi lưu.')}</p>

          <button type="button" className="dropzone" onClick={() => input.current?.click()}>
            <Icon name="upload" size={22} />
            <span>{file ? file.name : tr('Chọn file từ máy')}</span>
          </button>
          <input
            ref={input}
            type="file"
            hidden
            accept=".docx,.xlsx,.pdf,.txt,.md,.csv,.tsv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError('');
            }}
          />

          <div className="col" style={{ gap: 8 }} role="radiogroup" aria-label={tr('Cách tạo')}>
            {(
              [
                ['auto', tr('Tự nhận biết'), tr('File có sẵn câu hỏi/thẻ thì nhập thẳng; nếu là bài giảng thì AI soạn.')],
                ['parse', tr('Nhập file soạn sẵn'), tr('Chỉ đọc câu hỏi/thẻ có sẵn trong file, không dùng AI.')],
                ['ai', tr('AI tạo từ nội dung'), target === 'quiz' ? tr('AI đọc tài liệu và soạn khoảng 10 câu hỏi.') : tr('AI đọc tài liệu và soạn khoảng 15 thẻ.')],
              ] as [Mode, string, string][]
            ).map(([v, l, d]) => (
              <label key={v} className={`choice ${mode === v ? 'on' : ''}`}>
                <input type="radio" name="import-mode" checked={mode === v} onChange={() => setMode(v)} />
                <span>
                  <b>{l}</b>
                  <span className="small muted" style={{ display: 'block' }}>{d}</span>
                </span>
              </label>
            ))}
          </div>

          <div>
            <button type="button" className="btn ghost sm" onClick={() => setShowSample(!showSample)}>
              {showSample ? tr('Ẩn mẫu định dạng') : tr('Xem mẫu file soạn sẵn')}
            </button>
            {showSample && (
              <>
                <pre className="sample">{SAMPLE[target]}</pre>
                <p className="small muted">
                  {target === 'quiz'
                    ? tr('Có thể đánh dấu đáp án đúng bằng dấu * trước lựa chọn. Excel: cột Câu hỏi | A | B | C | D | Đáp án | Giải thích.')
                    : tr('Mỗi dòng một thẻ. Bảng Word/Excel 2 cột (mặt trước | mặt sau) cũng được.')}
                </p>
              </>
            )}
          </div>

          {error && <p className="error-text">{error}</p>}
          <div className="row">
            <button type="button" className="btn" disabled={!file || busy} onClick={run}>
              {busy ? (mode === 'parse' ? tr('Đang đọc file...') : tr('Đang xử lý... (AI có thể mất 20–40 giây)')) : tr('Tạo bản nháp')}
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              {tr('Huỷ')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
