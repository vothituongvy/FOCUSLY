import { Appearance, Platform } from 'react-native';
import { prefGet } from './i18n';

/**
 * Vàng + trắng: nền trắng, vàng hướng dương chỉ để tô thứ đang chọn và điểm nhấn,
 * mực nâu đen ấm cho chữ. Không dùng xanh/tím pastel.
 */
/** Chế độ giao diện: sáng / tối / theo hệ điều hành (đổi xong app tự tải lại) */
export type ThemeMode = 'light' | 'dark' | 'system';
export function getThemeMode(): ThemeMode {
  const m = prefGet('theme');
  return m === 'light' || m === 'dark' ? m : 'system';
}
const resolveDark = (m: ThemeMode) => m === 'dark' || (m === 'system' && Appearance.getColorScheme() === 'dark');
/** Đang dùng giao diện tối (chốt lúc mở app) */
export const isDark = resolveDark(getThemeMode());
/** Giao diện tối tương ứng với chế độ + hệ điều hành hiện tại (để biết có cần tải lại app không) */
export const wantsDark = () => resolveDark(getThemeMode());

const LIGHT = {
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
  /** chữ / icon đặt trên nền vàng dạ quang (luôn tối) */
  onMarker: '#1f1b12',
  /** chữ đặt trên nền màu chữ (colors.text) */
  onText: '#ffffff',
  /** nền phần "hôm nay" ở trang chủ */
  hero: '#fff7d9',
  heroBorder: '#f4e3a3',
  neutralBar: '#d5dbe5',
};

/** Tối: "bàn học ban đêm" – nền nâu than ấm, chữ kem, vàng dạ quang giữ nguyên */
const DARK: typeof LIGHT = {
  bg: '#12100b',
  surface: '#1c1912',
  card: '#1c1912',
  cardBorder: '#3a3324',
  track: '#2c271b',
  surface2: '#25211a',
  border: '#332d20',
  borderStrong: '#4d4430',
  text: '#f3eddb',
  text2: '#d5cdb6',
  muted: '#a1987f',
  primary: '#f3eddb',
  primary50: '#3a3218',
  board: '#1c1912',
  boardText: '#f3eddb',
  boardMuted: '#9b927a',
  marker: '#ffcf2e',
  markerSoft: '#3a3218',
  redPen: '#ff7b69',
  redSoft: '#3d1f1a',
  success: '#5cc98a',
  successSoft: '#17301f',
  warning: '#e8b54a',
  danger: '#ff7b69',
  dangerSoft: '#3d1f1a',
  focusBg: '#0d0b07',
  focusText: '#fff8e0',
  focusMuted: '#bdb39a',
  onMarker: '#1f1b12',
  onText: '#1f1b12',
  hero: '#241f14',
  heroBorder: '#4a3f22',
  neutralBar: '#3a4150',
};

export const colors = isDark ? DARK : LIGHT;

/** Các sắc độ vàng – kem để phân nhóm thông tin mà vẫn giữ tông vàng trắng */
export const tints = isDark
  ? {
      mint: { bg: '#241f14', border: '#4a3f22', ink: '#f3eddb', accent: '#ffcf2e' },
      lemon: { bg: '#3a3218', border: '#5c4d1f', ink: '#f3eddb', accent: '#ffcf2e' },
      peach: { bg: '#1c1912', border: '#3a3324', ink: '#f3eddb', accent: '#f3eddb' },
      sky: { bg: '#211d14', border: '#3f3725', ink: '#f3eddb', accent: '#ffcf2e' },
      lilac: { bg: '#332b15', border: '#56481f', ink: '#f3eddb', accent: '#ffcf2e' },
    }
  : {
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
