import { useCallback, useEffect, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';

/** Bong bóng chat nổi ngoài app (native: ChatHeads.kt) */
type ChatHeadNative = { status: () => Promise<{ enabled: boolean; permission: boolean }>; setEnabled: (on: boolean) => void; openPermission: () => void; hide: () => void };
export const chatHeadNative: ChatHeadNative | undefined = Platform.OS === 'android' ? (NativeModules.FocuslyChatHead as ChatHeadNative | undefined) : undefined;

/** Trạng thái bật/tắt + quyền; tự đọc lại khi quay về app (sau khi vào Cài đặt cấp quyền) */
export function useChatHeadStatus() {
  const [st, setSt] = useState<{ enabled: boolean; permission: boolean } | null>(null);
  const refresh = useCallback(() => void chatHeadNative?.status().then(setSt).catch(() => undefined), []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (a) => a === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  return [st, setSt] as const;
}
