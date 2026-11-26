import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/store/auth';
import { onUserSynced, useData } from './src/store/data';
import { useSession } from './src/store/session';
import { connectSocket, disconnectSocket } from './src/socket';
import { registerPush } from './src/push';
import { Alert } from 'react-native';
import type { FocusSession, User } from './src/types';
import { onLangChange } from './src/i18n';

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
    void registerPush((title, body) => Alert.alert(title, body)).then((fn) => (unsubPush = fn));

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
  // Đổi ngôn ngữ: dựng lại toàn bộ màn hình để chữ đổi ngay
  const [langVersion, setLangVersion] = useState(0);
  useEffect(() => onLangChange(() => setLangVersion((v) => v + 1)), []);

  return (
    <SafeAreaProvider>
      <RootNavigator key={langVersion} />
    </SafeAreaProvider>
  );
}
