/**
 * "Vở ô li & bút dạ quang" – cùng hệ màu với bản Web.
 * Một màu nhấn duy nhất (marker) cho thứ đang được "tô": tab đang chọn, thời gian đã tập trung, nút bắt đầu học.
 */
export const colors = {
  bg: '#e9edf2', // mặt bàn
  surface: '#ffffff', // trang giấy
  surface2: '#f3f5f8',
  border: '#dde2ea',
  borderStrong: '#c6cedb',
  text: '#16203a', // mực
  text2: '#3c4662',
  muted: '#6f7790',
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

export const radius = 12;

export const type = {
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
};
