import { AppRegistry } from 'react-native';
import App from './App';
import { installErrorReporting } from './src/sentry';

installErrorReporting();

// Thông báo đẩy tới khi app chạy nền / đã đóng: Android tự hiện trên thanh thông báo.
// Tin nhắn mới -> hiện thêm "bong bóng chat" nổi trên màn hình (nếu người dùng đã cho phép), giống Messenger.
try {
  const fm = require('@react-native-firebase/messaging');
  const { NativeModules } = require('react-native');
  if (typeof fm.setBackgroundMessageHandler === 'function' && typeof fm.getMessaging === 'function')
    fm.setBackgroundMessageHandler(fm.getMessaging(), async (m) => {
      const d = (m && m.data) || {};
      if (d.type === 'chat' && d.chatId && NativeModules.FocuslyChatHead) {
        NativeModules.FocuslyChatHead.show(String(d.chatId), String(d.name || (m.notification && m.notification.title) || ''), d.avatar ? String(d.avatar) : null, String(d.link || `/messages?chat=${d.chatId}`));
      }
    });
} catch {
  /* bản app chưa có Firebase */
}
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
