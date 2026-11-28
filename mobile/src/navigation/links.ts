import { Linking } from 'react-native';
import { checkForUpdate } from '../updateCheck';
/**
 * Mở màn hình theo đường dẫn kiểu web (từ thông báo trong app / thông báo đẩy), VD:
 * /messages?chat=…, /rooms?code=…, /classes/<id>, /exams/<id>, /friends, /report
 */
type Nav = { navigate: (name: string, params?: object) => void };

export function openLink(nav: Nav, link?: string | null) {
  if (!link) return;
  if (/^https?:\/\//.test(link)) return void Linking.openURL(link);
  if (link.startsWith('/update')) return void checkForUpdate(true);
  if (link.startsWith('/admin/feedback')) return nav.navigate('AdminFeedback');
  if (link.startsWith('/admin')) return nav.navigate('AdminHome');
  if (link.startsWith('/feedback')) return nav.navigate('Feedback');
  if (link.startsWith('/library')) return nav.navigate('Library');
  const q = (k: string) => new RegExp(`[?&]${k}=([^&]+)`).exec(link)?.[1];
  const id = link.split('?')[0].split('/')[2];
  if (link.startsWith('/messages')) {
    const chat = q('chat');
    return chat ? nav.navigate('ChatThread', { chatId: chat }) : nav.navigate('Chats');
  }
  if (link.startsWith('/focus')) return nav.navigate('Tabs', { screen: 'Focus' });
  if (link.startsWith('/learn/review')) return nav.navigate('Review');
  if (link.startsWith('/learn')) return nav.navigate('Tabs', { screen: 'Learn' });
  if (link.startsWith('/plan')) return nav.navigate('Tabs', { screen: 'Plan' });
  if (link.startsWith('/friends')) return nav.navigate('Friends');
  if (link.startsWith('/rooms')) return nav.navigate('Rooms', q('code') ? { code: q('code') } : undefined);
  if (link.startsWith('/report')) return nav.navigate('WeeklyReport');
  if (link.startsWith('/classes/') && id) return nav.navigate('ClassDetail', { classId: id });
  if (link.startsWith('/classes')) return nav.navigate('Classes');
  if (link.startsWith('/exams/') && id) return nav.navigate('ExamDetail', { examId: id });
  if (link.startsWith('/exams')) return nav.navigate('Exams');
  if (link.startsWith('/analytics')) return nav.navigate('Analytics');
  if (link.startsWith('/notifications')) return nav.navigate('Notifications');
}
