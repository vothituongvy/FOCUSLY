'use client';

import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Spinner } from '@/components/ui';
import { Markdown } from '@/components/Markdown';

interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
}
const APK = 'https://github.com/vothituongvy/FOCUSLY/releases/latest/download/app-release.apk';

/** Bản mới của FOCUSLY: web tự cập nhật, app Android tải bản mới ở đây */
export default function UpdatePage() {
  const r = useResource<Release>('/app/latest').data;
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Cập nhật FOCUSLY')}</h1>
          <p className="muted">{tr('Bản web luôn tự cập nhật – chỉ cần tải lại trang. App Android tải bản mới bên dưới rồi cài đè, dữ liệu vẫn giữ nguyên.')}</p>
        </div>
      </div>
      <section className="card col">
        {!r ? (
          <Spinner />
        ) : (
          <>
            <h2>{tr('App Android {0}', r.tag_name.replace(/^v/i, ''))}</h2>
            {r.body && <Markdown text={r.body} />}
            <div className="row wrap">
              <a className="btn marker" href={APK}>
                {tr('Tải app Android mới nhất')}
              </a>
              <button className="btn secondary" onClick={() => location.reload()}>
                {tr('Tải lại trang web')}
              </button>
            </div>
            <p className="small muted">{tr('Trên điện thoại: mở file vừa tải → Cài đặt. Nếu máy hỏi, cho phép cài từ nguồn này.')}</p>
          </>
        )}
      </section>
    </div>
  );
}
