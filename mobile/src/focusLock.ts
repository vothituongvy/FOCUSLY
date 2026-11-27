import { NativeModules, Platform } from 'react-native';

/**
 * Ghim màn hình (Android Lock Task / "Ghim ứng dụng") cho Phiên nghiêm ngặt.
 * Native module: android/app/src/main/java/com/focuslymobile/FocusLockModule.kt
 * Nếu chưa build lại app với module này, các hàm trả false và app vẫn chạy bình thường.
 */
type FocusLockNative = { start: () => Promise<boolean>; stop: () => Promise<boolean>; isLocked: () => Promise<boolean>; reload?: () => Promise<boolean> };
const native: FocusLockNative | undefined = Platform.OS === 'android' ? (NativeModules.FocusLock as FocusLockNative | undefined) : undefined;

export const focusLockAvailable = () => Boolean(native);

export async function lockScreen(): Promise<boolean> {
  try {
    return native ? await native.start() : false;
  } catch {
    return false;
  }
}

export async function unlockScreen(): Promise<boolean> {
  try {
    return native ? await native.stop() : false;
  } catch {
    return false;
  }
}

export async function isScreenLocked(): Promise<boolean> {
  try {
    return native ? await native.isLocked() : false;
  } catch {
    return false;
  }
}

/** Tải lại giao diện app (giữ dữ liệu, đăng nhập). Trả false nếu bản app cũ chưa có tính năng này. */
export async function reloadApp(): Promise<boolean> {
  try {
    return native?.reload ? await native.reload() : false;
  } catch {
    return false;
  }
}
