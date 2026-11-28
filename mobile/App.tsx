import React, { useEffect, useRef, useState } from 'react';
import { AppState, Appearance, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/store/auth';
import { onUserSynced, useData } from './src/store/data';
import { useSession } from './src/store/session';
import { connectSocket, disconnectSocket } from './src/socket';
import { registerPush } from './src/push';
import type { FocusSession, User } from './src/types';
import { onLangChange, prefSet } from './src/i18n';
import { isDark, wantsDark } from './src/theme';
import { reloadApp } from './src/focusLock';
import { checkForUpdate } from './src/updateCheck';
import { DialogHost, showAlert } from './src/components/Dialog';

/** Khởi động đồng bộ khi đã đăng nhập: SQLite -> push/pull -> realtime socket */
function useSyncEngine() {
  const status = useAuth((s) => s.status);
  const setUser = useAuth((s) => s.setUser);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== 'authed') return;
    const data = useData.getState();
    const session = useSession.getState();
    let alive = true;

    onUserSynced((u: User) => setUser(u));
    const debouncedSync = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void useData.getState().sync(), 400);
    };

    (async () => {
      await data.init();
      if (!alive) return;
      await session.loadActive();
      await useData.getState().sync();
      connectSocket({
        onChanged: (e) => {
          if (e.entity === 'user' && e.doc) setUser(e.doc as User);
          else debouncedSync();
        },
        onSession: (s) => void useSession.getState().applyServer(s as FocusSession),
        onReconnect: () => {
          debouncedSync();
          void useSession.getState().loadActive();
        },
      });
    })();

    let unsubPush: () => void = () => undefined;
    void registerPush((title, body) => showAlert(title, body)).then((fn) => (unsubPush = fn));

    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        debouncedSync();
        void useSession.getState().loadActive();
      }
    });
    return () => {
      alive = false;
      sub.remove();
      unsubPush();
      disconnectSocket();
    };
  }, [status, setUser]);
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  useSyncEngine();
  // Báo khi có bản APK mới trên GitHub Releases (tối đa 1 lần / 12 giờ)
  useEffect(() => {
    const t = setTimeout(() => void checkForUpdate(), 3000);
    return () => clearTimeout(t);
  }, []);
  // Đổi ngôn ngữ: dựng lại toàn bộ màn hình để chữ đổi ngay
  const [langVersion, setLangVersion] = useState(0);
  useEffect(() => onLangChange(() => setLangVersion((v) => v + 1)), []);
  // "Theo máy": điện thoại chuyển sáng/tối -> tải lại app để đổi màu theo
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (wantsDark() !== isDark) {
        prefSet('reopenTab', '');
        void reloadApp();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <RootNavigator key={langVersion} />
      <DialogHost />
    </SafeAreaProvider>
  );
}
