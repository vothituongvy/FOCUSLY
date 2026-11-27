import { NativeModules, Platform } from 'react-native';

/**
 * Cầu nối module Android viết riêng cho FOCUSLY:
 *  - FocuslySpeech: đọc thành tiếng (TTS) + nghe giọng nói để luyện phát âm
 *  - FocuslyWidget: widget màn hình chính
 * Bản app cũ chưa có module -> các hàm trả về false/null, không làm crash.
 */
type SpeechNative = { speak: (t: string, lang: string, rate: number) => Promise<boolean>; stop: () => void; listen: (lang: string, prompt: string) => Promise<string[] | null> };
type WidgetNative = { update: (d: Record<string, string | number>) => void; consumeAction: () => Promise<string | null> };

const speech: SpeechNative | undefined = Platform.OS === 'android' ? NativeModules.FocuslySpeech : undefined;
const widget: WidgetNative | undefined = Platform.OS === 'android' ? NativeModules.FocuslyWidget : undefined;

const VI = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
export const langOf = (text: string) => (VI.test(text) ? 'vi-VN' : 'en-US');
export const isEnglish = (text: string) => !VI.test(text) && /[a-z]/i.test(text) && text.length <= 200;
export const speechAvailable = () => Boolean(speech);

export async function speak(text: string, rate = 0.95) {
  if (!speech) return false;
  try {
    return await speech.speak(text.replace(/[_*#`]/g, ''), langOf(text), rate);
  } catch {
    return false;
  }
}
export const stopSpeaking = () => speech?.stop();

/** Mở hộp thoại nhận giọng nói; trả về các câu nghe được (null = huỷ) */
export async function listen(prompt: string, lang = 'en-US') {
  if (!speech) throw new Error('Bản app này chưa hỗ trợ luyện phát âm – hãy cập nhật app.');
  return speech.listen(lang, prompt);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Độ giống nhau 0..1 (Levenshtein theo chữ cái) */
export function similarity(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  const d: number[] = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[y.length] / Math.max(x.length, y.length);
}

export function updateWidget(d: { minutes: string; minutesLabel: string; cardsLine: string; streakLine: string; startLabel: string; progress: number }) {
  try {
    widget?.update(d);
  } catch {
    /* bản app cũ */
  }
}

export async function consumeWidgetAction(): Promise<string | null> {
  try {
    return (await widget?.consumeAction()) ?? null;
  } catch {
    return null;
  }
}
