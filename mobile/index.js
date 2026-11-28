import { AppRegistry } from 'react-native';
import App from './App';
import { installErrorReporting } from './src/sentry';

installErrorReporting();

// Thông báo đẩy tới khi app chạy nền / đã đóng: Android tự hiện trên thanh thông báo,
// chỉ cần khai báo bộ xử lý nền để Firebase không cảnh báo.
try {
  const fm = require('@react-native-firebase/messaging');
  if (typeof fm.setBackgroundMessageHandler === 'function' && typeof fm.getMessaging === 'function') fm.setBackgroundMessageHandler(fm.getMessaging(), async () => {});
} catch {
  /* bản app chưa có Firebase */
}
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
