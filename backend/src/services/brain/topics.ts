/**
 * Danh sách chủ đề HẠT GIỐNG cho THƯ VIỆN KIẾN THỨC CHUNG của FOCUSLY Brain.
 * Từ mỗi chủ đề, Brain còn tự đọc lan sang các bài liên quan (xem knowledge.ts).
 * Mỗi chủ đề được tra trên Wikipedia tiếng Việt (không có thì tiếng Anh) và lưu vào database một lần.
 * Muốn Brain biết thêm: thêm chủ đề vào đây (hoặc đặt biến BRAIN_EXTRA_TOPICS="Chủ đề A; Chủ đề B") rồi deploy.
 */
export const KNOWLEDGE_TOPICS: Record<string, string[]> = {
  'Toán học': [
    'Số nguyên tố', 'Phân số', 'Số thực', 'Số phức', 'Hàm số', 'Hàm số bậc hai', 'Phương trình bậc hai', 'Hệ phương trình tuyến tính',
    'Bất đẳng thức', 'Lượng giác', 'Định lý Pythagoras', 'Logarit', 'Hàm mũ', 'Đạo hàm', 'Tích phân', 'Giới hạn (toán học)', 'Dãy số',
    'Cấp số cộng', 'Cấp số nhân', 'Ma trận (toán học)', 'Định thức', 'Vectơ', 'Hình học Euclid', 'Đường tròn', 'Tam giác', 'Hình chóp',
    'Xác suất', 'Thống kê', 'Tổ hợp', 'Hoán vị', 'Lý thuyết tập hợp', 'Logic toán', 'Số pi', 'Hệ tọa độ Descartes',
  ],
  'Vật lý': [
    'Định luật Newton', 'Vận tốc', 'Gia tốc', 'Lực hấp dẫn', 'Động năng', 'Thế năng', 'Định luật bảo toàn năng lượng', 'Động lượng',
    'Áp suất', 'Định luật Archimedes', 'Nhiệt độ', 'Nhiệt động lực học', 'Dòng điện', 'Định luật Ohm', 'Điện trở', 'Từ trường',
    'Cảm ứng điện từ', 'Sóng cơ học', 'Âm thanh', 'Ánh sáng', 'Khúc xạ', 'Phản xạ ánh sáng', 'Thấu kính', 'Sóng điện từ',
    'Thuyết tương đối', 'Cơ học lượng tử', 'Nguyên tử', 'Phóng xạ', 'Phản ứng hạt nhân', 'Dao động điều hòa',
  ],
  'Hóa học': [
    'Nguyên tố hóa học', 'Bảng tuần hoàn', 'Liên kết hóa học', 'Liên kết ion', 'Liên kết cộng hóa trị', 'Phản ứng oxi hóa – khử', 'Axit',
    'Bazơ', 'Muối (hóa học)', 'pH', 'Mol (đơn vị)', 'Phản ứng hóa học', 'Chất xúc tác', 'Cân bằng hóa học', 'Điện phân', 'Kim loại',
    'Hóa học hữu cơ', 'Hiđrocacbon', 'Ancol', 'Este', 'Polyme', 'Protein', 'Cacbohydrat', 'Lipit', 'Nước',
  ],
  'Sinh học': [
    'Tế bào', 'Quang hợp', 'Hô hấp tế bào', 'ADN', 'ARN', 'Gen', 'Nhiễm sắc thể', 'Nguyên phân', 'Giảm phân', 'Di truyền học',
    'Định luật Mendel', 'Đột biến', 'Tiến hóa', 'Chọn lọc tự nhiên', 'Hệ sinh thái', 'Chuỗi thức ăn', 'Enzyme', 'Hệ miễn dịch',
    'Hệ tuần hoàn', 'Hệ thần kinh', 'Hệ tiêu hóa', 'Vi khuẩn', 'Virus', 'Ty thể', 'Lục lạp',
  ],
  'Lịch sử': [
    'Lịch sử Việt Nam', 'Văn Lang', 'Nhà Lý', 'Nhà Trần', 'Nhà Lê sơ', 'Nhà Nguyễn', 'Chiến thắng Bạch Đằng 938', 'Cách mạng Tháng Tám',
    'Chiến dịch Điện Biên Phủ', 'Chiến tranh Việt Nam', 'Đổi Mới', 'Chiến tranh thế giới thứ nhất', 'Chiến tranh thế giới thứ hai',
    'Cách mạng Pháp', 'Cách mạng công nghiệp', 'Chiến tranh Lạnh', 'Liên Hợp Quốc', 'Hồ Chí Minh', 'Ai Cập cổ đại', 'La Mã cổ đại',
  ],
  'Địa lý': [
    'Địa lý Việt Nam', 'Trái Đất', 'Khí hậu', 'Biến đổi khí hậu', 'Gió mùa', 'Sông Mê Kông', 'Đồng bằng sông Hồng', 'Đồng bằng sông Cửu Long',
    'Dân số', 'Đô thị hóa', 'Châu Á', 'Đông Nam Á', 'ASEAN', 'Kiến tạo mảng', 'Núi lửa', 'Động đất', 'Đại dương', 'Hệ Mặt Trời',
  ],
  'Ngữ văn': [
    'Truyện Kiều', 'Nguyễn Du', 'Hồ Xuân Hương', 'Nam Cao', 'Tắt đèn', 'Chí Phèo', 'Văn học Việt Nam', 'Thơ lục bát', 'Ca dao',
    'Tục ngữ', 'Biện pháp tu từ', 'Ẩn dụ', 'Hoán dụ', 'So sánh (tu từ)', 'Nghị luận', 'Truyện ngắn', 'Tiểu thuyết',
  ],
  'Tiếng Anh': [
    'Ngữ pháp tiếng Anh', 'Thì hiện tại hoàn thành', 'Thì quá khứ đơn', 'Thì hiện tại đơn', 'Câu bị động', 'Mệnh đề quan hệ', 'Câu điều kiện',
    'Động từ khiếm khuyết', 'Danh từ', 'Tính từ', 'Trạng từ', 'Giới từ', 'IELTS', 'TOEIC', 'Phiên âm quốc tế',
  ],
  'Tin học & Lập trình': [
    'Máy tính', 'Thuật toán', 'Cấu trúc dữ liệu', 'Mảng (cấu trúc dữ liệu)', 'Danh sách liên kết', 'Ngăn xếp', 'Hàng đợi', 'Cây (cấu trúc dữ liệu)',
    'Đồ thị (cấu trúc dữ liệu)', 'Thuật toán sắp xếp', 'Tìm kiếm nhị phân', 'Đệ quy', 'Độ phức tạp tính toán', 'Lập trình hướng đối tượng',
    'Ngôn ngữ lập trình', 'Python (ngôn ngữ lập trình)', 'JavaScript', 'TypeScript', 'Java (ngôn ngữ lập trình)', 'C++', 'HTML', 'CSS',
    'React (thư viện JavaScript)', 'React Native', 'Node.js', 'Cơ sở dữ liệu', 'SQL', 'MongoDB', 'Mạng máy tính', 'Giao thức TCP/IP',
    'HTTP', 'API', 'REST', 'Hệ điều hành', 'Linux', 'Git', 'Điện toán đám mây', 'An ninh mạng', 'Mật mã học', 'Trí tuệ nhân tạo',
    'Học máy', 'Học sâu', 'Mạng nơ-ron nhân tạo', 'Xử lý ngôn ngữ tự nhiên', 'Dữ liệu lớn', 'Internet vạn vật', 'Chuyển đổi số',
    'Kỹ thuật phần mềm', 'Agile', 'Scrum', 'Thiết kế giao diện người dùng', 'Trải nghiệm người dùng',
  ],
  'Kinh tế & Kinh doanh': [
    'Kinh tế học', 'Kinh tế vi mô', 'Kinh tế vĩ mô', 'Cung và cầu', 'Lạm phát', 'Tổng sản phẩm nội địa', 'Thị trường', 'Tiền tệ',
    'Ngân hàng', 'Marketing', 'Quản trị kinh doanh', 'Khởi nghiệp', 'Thương mại điện tử', 'Kế toán', 'Tài chính doanh nghiệp',
    'Doanh nghiệp vừa và nhỏ', 'Quản lý quan hệ khách hàng', 'Hệ thống thông tin quản lý', 'Phân tích SWOT', 'Chuỗi cung ứng',
  ],
  'Triết học & Xã hội': [
    'Triết học', 'Chủ nghĩa duy vật biện chứng', 'Phép biện chứng', 'Đạo đức học', 'Logic học', 'Xã hội học', 'Tâm lý học', 'Tâm lý học phát triển',
    'Văn hóa', 'Tôn giáo', 'Dân chủ', 'Nhà nước', 'Quyền con người', 'Toàn cầu hóa', 'Phát triển bền vững',
  ],
  'Pháp luật & Công dân': [
    'Pháp luật', 'Hiến pháp Việt Nam', 'Luật Dân sự', 'Luật Hình sự', 'Hợp đồng', 'Quyền sở hữu trí tuệ', 'Bản quyền', 'Thuế',
    'Bảo hiểm xã hội', 'Luật Lao động', 'An toàn giao thông',
  ],
  'Y học & Sức khỏe': [
    'Dinh dưỡng', 'Vitamin', 'Protein', 'Tim', 'Não', 'Phổi', 'Huyết áp', 'Đái tháo đường', 'Vắc-xin', 'Kháng sinh', 'Sơ cứu',
    'Sức khỏe tâm thần', 'Trầm cảm', 'Rối loạn lo âu', 'Hoạt động thể chất',
  ],
  'Nghệ thuật & Âm nhạc': [
    'Âm nhạc', 'Nhạc lý', 'Hội họa', 'Kiến trúc', 'Điện ảnh', 'Nhiếp ảnh', 'Thiết kế đồ họa', 'Màu sắc', 'Nghệ thuật Phục Hưng',
  ],
  'Công nghệ & Kỹ thuật': [
    'Điện tử học', 'Vi xử lý', 'Robot', 'Năng lượng tái tạo', 'Pin mặt trời', 'Ô tô điện', 'Mạng 5G', 'Chuỗi khối', 'Thực tế ảo',
    'In 3D', 'Công nghệ sinh học', 'Công nghệ nano',
  ],
  'Kỹ năng học tập': [
    'Kỹ thuật Pomodoro', 'Lặp lại ngắt quãng', 'Trí nhớ', 'Đường cong quên lãng', 'Sơ đồ tư duy', 'Quản lý thời gian', 'Sự tập trung',
    'Trì hoãn', 'Thói quen', 'Giấc ngủ', 'Tư duy phản biện', 'Học tập', 'Động lực', 'Căng thẳng (tâm lý)', 'Thiền',
  ],
};

/** Toàn bộ chủ đề (kèm môn), cộng chủ đề thêm từ biến môi trường BRAIN_EXTRA_TOPICS */
export function allTopics(): { topic: string; subject: string }[] {
  const out: { topic: string; subject: string }[] = [];
  for (const [subject, list] of Object.entries(KNOWLEDGE_TOPICS)) list.forEach((topic) => out.push({ topic, subject }));
  for (const t of (process.env.BRAIN_EXTRA_TOPICS ?? '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) out.push({ topic: t, subject: 'Bổ sung' });
  return out;
}
