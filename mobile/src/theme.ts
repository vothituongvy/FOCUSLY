import { Platform } from 'react-native';

/**
 * Vàng + trắng: nền trắng, vàng hướng dương chỉ để tô thứ đang chọn và điểm nhấn,
 * mực nâu đen ấm cho chữ. Không dùng xanh/tím pastel.
 */
export const colors = {
  bg: '#ffffff', // giấy trắng
  surface: '#ffffff',
  card: '#ffffff',
  cardBorder: '#efe4c2', // viền thẻ: vàng nhạt
  track: '#f6eed3', // rãnh thanh tiến độ
  surface2: '#fffaea', // ô nhập, ô chọn: kem
  border: '#f1e8cc',
  borderStrong: '#e0d09a',
  text: '#1f1b12', // mực nâu đen
  text2: '#4a4334',
  muted: '#857c66',
  primary: '#1f1b12',
  primary50: '#fff4c7',
  board: '#ffffff', // thanh trên, thanh tab: trắng
  boardText: '#1f1b12',
  boardMuted: '#8a826c',
  marker: '#ffcf2e', // tô điểm nhấn trên nền trắng
  markerSoft: '#fff4c7',
  redPen: '#c93b2c',
  redSoft: '#fde6e1',
  success: '#2e7d4f',
  successSoft: '#e5f2e8',
  warning: '#8a6100',
  danger: '#c93b2c',
  dangerSoft: '#fde6e1',
  focusBg: '#1f1b12', // màn hình học: nâu đen, đồng hồ vàng
  focusText: '#fff8e0',
  focusMuted: '#bdb39a',
};

/** Các sắc độ vàng – kem để phân nhóm thông tin mà vẫn giữ tông vàng trắng */
export const tints = {
  mint: { bg: '#fff8dc', border: '#f3e3a6', ink: '#1f1b12', accent: '#ffcf2e' },
  lemon: { bg: '#ffe98a', border: '#f5d25a', ink: '#1f1b12', accent: '#e5b300' },
  peach: { bg: '#ffffff', border: '#efe4c2', ink: '#1f1b12', accent: '#1f1b12' },
  sky: { bg: '#fffbeb', border: '#f1e7c2', ink: '#1f1b12', accent: '#ffcf2e' },
  lilac: { bg: '#fff1b8', border: '#f1db7c', ink: '#1f1b12', accent: '#e5b300' },
};

/** Chữ có chân cho tiêu đề và con số: giống sách giáo khoa, khác hẳn giao diện app thông thường */
export const fonts = {
  display: Platform.select({ ios: 'Georgia', default: 'serif' }),
};

export const radius = 8;

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4, color: colors.text, fontFamily: fonts.display },
  h3: { fontSize: 17, fontWeight: '700' as const, color: colors.text, fontFamily: fonts.display },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
};
