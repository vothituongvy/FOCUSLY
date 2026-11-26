import type { IconName } from './components/Icon';

/**
 * Nội dung trang "Hướng dẫn sử dụng" (song ngữ).
 * Mỗi mục: đoạn mở đầu, các ý chính, mẹo (tuỳ chọn) và liên kết tới đúng trang trong app.
 */
export interface GuideSection {
  id: string;
  icon: IconName;
  title: string;
  intro: string;
  points: string[];
  steps?: string[];
  tip?: string;
  link?: { href: string; label: string };
}

const vi: GuideSection[] = [
  {
    id: 'bat-dau',
    icon: 'play',
    title: 'Bắt đầu trong 3 bước',
    intro: 'Lần đầu dùng FOCUSLY, chỉ cần làm theo thứ tự này. Mất khoảng 5 phút.',
    points: [],
    steps: [
      'Vào Kế hoạch, thêm môn học (VD: Tiếng Anh) rồi thêm một nhiệm vụ cụ thể (VD: Ôn từ vựng Unit 5, 30 phút).',
      'Vào Tập trung, chọn môn và nhiệm vụ vừa tạo, chọn thời gian, mức bảo vệ, viết mục tiêu của phiên rồi bấm Bắt đầu phiên học.',
      'Học xong bấm Kết thúc, tự đánh giá mức tập trung và ghi lại điều vừa học. Kết quả hiện ngay ở trang Hôm nay.',
    ],
    tip: 'Mục tiêu phiên càng cụ thể càng dễ đạt: “Làm xong 20 câu chương 3” tốt hơn “Học Toán”.',
    link: { href: '/plan', label: 'Mở Kế hoạch' },
  },
  {
    id: 'hom-nay',
    icon: 'home',
    title: 'Hôm nay',
    intro: 'Trang đầu tiên bạn thấy mỗi ngày: hôm nay đã học bao lâu và việc gì nên làm tiếp.',
    points: [
      'Thước thời gian trong ngày tô vàng những khoảng bạn đã tập trung.',
      'Các con số: thời gian tập trung, số phiên, nhiệm vụ đã xong, số lần phân tâm.',
      '“Việc tiếp theo” gợi ý nhiệm vụ sắp đến hạn; bấm Học để bắt đầu phiên ngay với nhiệm vụ đó.',
      '“Bảy ngày qua” cho thấy ngày nào bạn đạt mục tiêu học mỗi ngày (cột vàng).',
    ],
    link: { href: '/dashboard', label: 'Mở Hôm nay' },
  },
  {
    id: 'ke-hoach',
    icon: 'plan',
    title: 'Kế hoạch',
    intro: 'Sắp xếp việc học theo bốn lớp: Môn học → Chủ đề/khoá học → Mục tiêu → Nhiệm vụ.',
    points: [
      'Nhiệm vụ là việc cụ thể sẽ làm trong một phiên. Đặt thời lượng dự kiến, hạn hoàn thành và mức ưu tiên.',
      'Nhiệm vụ lặp lại (hằng ngày, hằng tuần…) tự tạo lần kế tiếp khi bạn hoàn thành.',
      'Xem dạng lịch để thấy nhiệm vụ theo ngày; bấm vào một ngày để thêm nhiệm vụ cho ngày đó.',
    ],
    tip: 'Chia nhỏ việc lớn thành nhiệm vụ 25–50 phút. Việc nhỏ dễ bắt đầu hơn.',
    link: { href: '/plan', label: 'Mở Kế hoạch' },
  },
  {
    id: 'tap-trung',
    icon: 'focus',
    title: 'Phiên tập trung',
    intro: 'Nơi bạn thật sự học. Đồng hồ chạy theo giờ máy chủ, nên đóng tab hay mất mạng cũng không mất phiên.',
    points: [
      'Pomodoro: học 25 phút, nghỉ 5 phút, sau vài vòng nghỉ dài. Tuỳ chỉnh: tự đặt số phút. Tự do: đồng hồ đếm lên.',
      'Trong phiên có thể Tạm dừng, Nghỉ, và bấm “Tôi đang bị phân tâm” để ghi lại lý do.',
      'Quick Reset: bài hít thở ngắn khi bạn mất tập trung, rồi nhắc lại mục tiêu để quay về.',
      'Dịch Anh ⇄ Việt: tra từ, dịch câu ngay trong phiên, không phải mở tab khác.',
      'Kết thúc phiên: tự đánh giá, đánh dấu nhiệm vụ xong và viết lại điều vừa học (Active Recall) để nhớ lâu hơn.',
    ],
    link: { href: '/focus', label: 'Bắt đầu học' },
  },
  {
    id: 'muc-bao-ve',
    icon: 'shield',
    title: 'Ba mức bảo vệ khỏi xao nhãng',
    intro: 'Chọn khi bắt đầu phiên. Mức càng cao càng khó bỏ dở.',
    points: [
      'Không chặn: học bình thường, không giới hạn gì.',
      'Focus Shield: chặn các trang trong danh sách chặn (mạng xã hội, video…) và nhắc khi bạn rời trang học.',
      'Nghiêm ngặt: chỉ mở được FOCUSLY và các trang bạn cho phép; chuyển tab sẽ bị kéo về; rời đi quá 2 giây là đồng hồ dừng; muốn kết thúc sớm phải giữ nút 3 giây.',
      'Trên điện thoại Android, phiên nghiêm ngặt ghim FOCUSLY lên màn hình để không mở được app khác.',
    ],
    tip: 'Việc chặn trang trên máy tính cần tiện ích Chrome FOCUSLY (xem mục bên dưới). Sửa danh sách chặn và danh sách cho phép trong Cài đặt → Focus Shield.',
    link: { href: '/settings?tab=shield', label: 'Cài đặt Focus Shield' },
  },
  {
    id: 'on-tap',
    icon: 'cards',
    title: 'Ôn tập & quiz',
    intro: 'Đo xem bạn nhớ được bao nhiêu, không chỉ đo thời gian ngồi học.',
    points: [
      'Flashcard dùng lặp lại ngắt quãng: thẻ bạn hay quên sẽ quay lại sớm, thẻ đã thuộc thì giãn ra.',
      'Khi ôn, tự trả lời trong đầu trước, lật thẻ rồi chọn Quên / Khó / Nhớ / Dễ cho đúng với bạn.',
      'Quiz có trắc nghiệm, đúng/sai và trả lời ngắn. Câu làm sai có thể chuyển thành flashcard chỉ bằng một nút.',
      'Có thể nhờ AI tạo thẻ hoặc câu hỏi từ tài liệu; bạn xem lại và sửa trước khi lưu.',
    ],
    link: { href: '/learn', label: 'Mở Ôn tập' },
  },
  {
    id: 'tai-lieu',
    icon: 'materials',
    title: 'Tài liệu',
    intro: 'Lưu mọi thứ cần học ở một chỗ và đọc ngay trên FOCUSLY.',
    points: [
      'Tải lên PDF, ảnh, file TXT/MD, thêm đường link hoặc viết ghi chú văn bản.',
      'Đọc PDF ngay trong trang, lưu tiến độ đọc, ghi chú theo từng trang và đánh dấu tài liệu quan trọng.',
      'Ô tìm kiếm trên cùng tìm cả trong nội dung PDF và văn bản.',
    ],
    link: { href: '/materials', label: 'Mở Tài liệu' },
  },
  {
    id: 'ai',
    icon: 'ai',
    title: 'Trợ lý AI',
    intro: 'Hỏi bất cứ điều gì về bài đang học. AI chỉ gợi ý, bạn luôn được sửa hoặc bỏ qua.',
    points: [
      'Hỏi đáp, giải thích khái niệm khó bằng ví dụ dễ hiểu.',
      'Chọn một tài liệu để hỏi riêng về nó: tóm tắt ý chính, giải thích đoạn khó, tạo câu hỏi kiểm tra.',
      'Gợi ý kế hoạch học 7 ngày dựa trên dữ liệu học của bạn; chọn những nhiệm vụ muốn thêm vào Kế hoạch.',
    ],
    tip: 'AI có thể sai. Với kiến thức quan trọng, hãy đối chiếu lại với sách hoặc tài liệu của bạn.',
    link: { href: '/ai', label: 'Mở Trợ lý AI' },
  },
  {
    id: 'nhin-lai',
    icon: 'analytics',
    title: 'Nhìn lại',
    intro: 'Ba trang giúp bạn hiểu thói quen học để chỉnh dần.',
    points: [
      'Phân tích: thời gian dự kiến và thực tế, khung giờ bạn học hiệu quả nhất, kết quả theo từng môn.',
      'Lịch sử phiên: mọi phiên học trên web và điện thoại, xem chi tiết từng đoạn học và nghỉ.',
      'Nhật ký phân tâm: những gì làm bạn mất tập trung và vào lúc nào, để biết nên thay đổi gì.',
    ],
    link: { href: '/analytics', label: 'Mở Phân tích' },
  },
  {
    id: 'cai-dat',
    icon: 'settings',
    title: 'Cài đặt & tài khoản',
    intro: 'Mở bằng ảnh đại diện ở góc trên bên phải, hoặc mục Cài đặt cuối thanh bên.',
    points: [
      'Hồ sơ: tên, ảnh đại diện, mục tiêu học tập.',
      'Sở thích học tập: số phút học mỗi ngày, khung giờ muốn học, Pomodoro mặc định.',
      'Focus Shield: danh sách chặn, danh sách cho phép, khung giờ tự chặn.',
      'Thông báo: nhắc lịch học, nhắc nhiệm vụ sắp hạn, nhắc ôn flashcard, giờ yên lặng.',
      'Ngôn ngữ: đổi giữa Tiếng Việt và English.',
    ],
    link: { href: '/settings', label: 'Mở Cài đặt' },
  },
  {
    id: 'tien-ich',
    icon: 'shield',
    title: 'Tiện ích Chrome FOCUSLY',
    intro: 'Cần cho Focus Shield và Phiên nghiêm ngặt trên máy tính: tiện ích mới chặn được trang web và khoá tab.',
    points: [],
    steps: [
      'Mở chrome://extensions trên Chrome và bật Chế độ dành cho nhà phát triển (Developer mode).',
      'Bấm Tải tiện ích đã giải nén (Load unpacked) và chọn thư mục tiện ích FOCUSLY (thư mục extension/dist).',
      'Vào Cài đặt → Focus Shield trên web, bấm Kết nối extension với tài khoản.',
      'Bắt đầu một phiên có bật bảo vệ: biểu tượng tiện ích hiện ON (Focus Shield) hoặc LOCK (Nghiêm ngặt).',
    ],
    link: { href: '/settings?tab=shield', label: 'Kết nối tiện ích' },
  },
  {
    id: 'dien-thoai',
    icon: 'sync',
    title: 'App điện thoại & đồng bộ',
    intro: 'Dùng chung tài khoản trên web và app Android. Dữ liệu tự đồng bộ giữa các thiết bị.',
    points: [
      'Bắt đầu phiên trên điện thoại thì web cũng thấy đồng hồ đang chạy ở thanh trên, và ngược lại.',
      'App dùng được khi mất mạng; thay đổi sẽ được gửi lên khi có mạng trở lại.',
      'Bắt đầu phiên trên điện thoại vẫn chặn trang web trên máy tính nếu máy tính có tiện ích Chrome.',
    ],
  },
];

const en: GuideSection[] = [
  {
    id: 'bat-dau',
    icon: 'play',
    title: 'Get started in 3 steps',
    intro: 'New to FOCUSLY? Just follow these steps in order. It takes about 5 minutes.',
    points: [],
    steps: [
      'Open Plan, add a subject (e.g. English), then add a concrete task (e.g. Review Unit 5 vocabulary, 30 minutes).',
      'Open Focus, pick that subject and task, choose a duration and a protection level, write the session goal and press Start studying.',
      'When you finish, press End, rate your focus and write down what you learned. The results show up on Today right away.',
    ],
    tip: 'Specific goals are easier to hit: “Finish 20 questions in chapter 3” beats “Study maths”.',
    link: { href: '/plan', label: 'Open Plan' },
  },
  {
    id: 'hom-nay',
    icon: 'home',
    title: 'Today',
    intro: 'The first page you see each day: how long you have studied and what to do next.',
    points: [
      'The day ruler highlights in yellow the stretches you spent focused.',
      'The numbers: focus time, sessions, tasks done and distractions.',
      '“Up next” suggests tasks due soon; press Study to start a session with that task.',
      '“Last seven days” shows which days you hit your daily study goal (yellow bars).',
    ],
    link: { href: '/dashboard', label: 'Open Today' },
  },
  {
    id: 'ke-hoach',
    icon: 'plan',
    title: 'Plan',
    intro: 'Organise your studies in four layers: Subject → Topic/course → Goal → Task.',
    points: [
      'A task is something concrete you will do in one session. Set the planned time, due date and priority.',
      'Repeating tasks (daily, weekly…) create the next occurrence automatically when you complete them.',
      'Use the calendar view to see tasks by day; click a day to add a task for it.',
    ],
    tip: 'Break big work into 25–50 minute tasks. Small tasks are easier to start.',
    link: { href: '/plan', label: 'Open Plan' },
  },
  {
    id: 'tap-trung',
    icon: 'focus',
    title: 'Focus sessions',
    intro: 'Where the studying happens. The timer runs on server time, so closing the tab or going offline never loses a session.',
    points: [
      'Pomodoro: 25 minutes of study, a 5-minute break, a long break after a few rounds. Custom: set your own minutes. Free: the timer counts up.',
      'During a session you can Pause, take a Break, and press “I’m getting distracted” to log why.',
      'Quick Reset: a short breathing exercise when you lose focus, then a reminder of your goal.',
      'English ⇄ Vietnamese: look up words and translate sentences inside the session, without opening another tab.',
      'When you end: rate yourself, mark the task done and write down what you learned (Active Recall) so it sticks.',
    ],
    link: { href: '/focus', label: 'Start studying' },
  },
  {
    id: 'muc-bao-ve',
    icon: 'shield',
    title: 'Three levels of distraction protection',
    intro: 'Pick one when you start a session. The higher the level, the harder it is to quit.',
    points: [
      'No blocking: study normally, no limits.',
      'Focus Shield: blocks sites on your block list (social media, videos…) and nudges you when you leave the study page.',
      'Strict: only FOCUSLY and the sites you allow can open; switching tabs pulls you back; leaving for more than 2 seconds stops the timer; ending early means holding the button for 3 seconds.',
      'On Android phones, a strict session pins FOCUSLY to the screen so other apps can’t be opened.',
    ],
    tip: 'Blocking sites on a computer needs the FOCUSLY Chrome extension (see below). Edit the block and allow lists in Settings → Focus Shield.',
    link: { href: '/settings?tab=shield', label: 'Focus Shield settings' },
  },
  {
    id: 'on-tap',
    icon: 'cards',
    title: 'Review & quizzes',
    intro: 'Measure how much you remember, not just how long you sat there.',
    points: [
      'Flashcards use spaced repetition: cards you forget come back sooner, cards you know are spaced out.',
      'When reviewing, answer in your head first, flip the card, then pick Forgot / Hard / Good / Easy honestly.',
      'Quizzes have multiple choice, true/false and short answers. Wrong answers can become flashcards with one button.',
      'AI can create cards or questions from your materials; you review and edit them before saving.',
    ],
    link: { href: '/learn', label: 'Open Review' },
  },
  {
    id: 'tai-lieu',
    icon: 'materials',
    title: 'Materials',
    intro: 'Keep everything you study in one place and read it right inside FOCUSLY.',
    points: [
      'Upload PDFs, images, TXT/MD files, add a link or write a text note.',
      'Read PDFs in the page, save your reading progress, add notes per page and bookmark important materials.',
      'The search box at the top also searches inside PDF and text content.',
    ],
    link: { href: '/materials', label: 'Open Materials' },
  },
  {
    id: 'ai',
    icon: 'ai',
    title: 'AI assistant',
    intro: 'Ask anything about what you are studying. AI only suggests; you can always edit or ignore it.',
    points: [
      'Q&A and explanations of hard concepts with simple examples.',
      'Pick a material to ask about it: summarise the key points, explain a hard part, create check questions.',
      'A 7-day study plan suggestion based on your data; choose which tasks to add to your Plan.',
    ],
    tip: 'AI can be wrong. For important knowledge, double-check against your textbook or materials.',
    link: { href: '/ai', label: 'Open AI assistant' },
  },
  {
    id: 'nhin-lai',
    icon: 'analytics',
    title: 'Review your habits',
    intro: 'Three pages that help you understand your study habits so you can adjust them.',
    points: [
      'Analytics: planned vs actual time, your most productive hours, results by subject.',
      'Session history: every session on web and phone, with each study and break stretch.',
      'Distraction journal: what pulls you away and when, so you know what to change.',
    ],
    link: { href: '/analytics', label: 'Open Analytics' },
  },
  {
    id: 'cai-dat',
    icon: 'settings',
    title: 'Settings & account',
    intro: 'Open it from your avatar in the top-right corner, or Settings at the bottom of the sidebar.',
    points: [
      'Profile: name, photo, learning goal.',
      'Study preferences: daily study minutes, preferred study times, default Pomodoro.',
      'Focus Shield: block list, allow list, scheduled blocking.',
      'Notifications: study reminders, upcoming task reminders, flashcard reminders, quiet hours.',
      'Language: switch between Tiếng Việt and English.',
    ],
    link: { href: '/settings', label: 'Open Settings' },
  },
  {
    id: 'tien-ich',
    icon: 'shield',
    title: 'FOCUSLY Chrome extension',
    intro: 'Needed for Focus Shield and strict sessions on a computer: only the extension can block websites and lock tabs.',
    points: [],
    steps: [
      'Open chrome://extensions in Chrome and turn on Developer mode.',
      'Click Load unpacked and choose the FOCUSLY extension folder (the extension/dist folder).',
      'On the web, go to Settings → Focus Shield and click Link the extension to your account.',
      'Start a protected session: the extension icon shows ON (Focus Shield) or LOCK (strict).',
    ],
    link: { href: '/settings?tab=shield', label: 'Link the extension' },
  },
  {
    id: 'dien-thoai',
    icon: 'sync',
    title: 'Phone app & sync',
    intro: 'Use the same account on the web and the Android app. Your data syncs between devices automatically.',
    points: [
      'Start a session on your phone and the web shows the running timer in the top bar, and vice versa.',
      'The app works offline; changes are sent once you are back online.',
      'A session started on your phone still blocks websites on your computer if it has the Chrome extension.',
    ],
  },
];

export const GUIDE = { vi, en };
