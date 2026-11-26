/**
 * "Vở ô li & bút dạ quang" – cùng hệ màu với bản Web.
 * Một màu nhấn duy nhất (marker) cho thứ đang được "tô": tab đang chọn, thời gian đã tập trung, nút bắt đầu học.
 */
export const colors = {
  bg: '#ffffff', // nền trắng cho mọi màn hình
  surface: '#ffffff',
  card: '#eef2ff', // nền thẻ: xanh oải hương nhạt, tách rõ khỏi nền trắng mà không chói
  cardBorder: '#d9e0fb',
  track: '#dfe5fb', // rãnh thanh tiến độ
  surface2: '#eef2ff',
  border: '#e2e7f6',
  borderStrong: '#c3cce8',
  text: '#16203a', // mực
  text2: '#3c4662',
  muted: '#667092',
  primary: '#16203a',
  primary50: '#fff4c4',
  marker: '#ffd94a',
  markerSoft: '#fff4c4',
  success: '#1f7a4d',
  successSoft: '#e3f3ea',
  warning: '#9a6a00',
  danger: '#b8402f',
  dangerSoft: '#fbe9e5',
  focusBg: '#121a2e',
  focusText: '#eef1f7',
  focusMuted: '#98a1b8',
};

/** Các tông pastel phối cùng nhau – mỗi loại thông tin một màu để nhìn là nhận ra */
export const tints = {
  mint: { bg: '#e4f6ec', border: '#c4e8d4', ink: '#1f7a4d' },
  lemon: { bg: '#fff4cc', border: '#f2df98', ink: '#8a5d00' },
  peach: { bg: '#fde8e1', border: '#f4c9bb', ink: '#a8432c' },
  sky: { bg: '#e3effe', border: '#c3d9fa', ink: '#1f5fae' },
  lilac: { bg: '#efe9fe', border: '#d8ccfa', ink: '#5b3fb0' },
};

export const radius = 12;

export const type = {
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
};
