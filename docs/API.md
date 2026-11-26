# FOCUSLY REST API (Phase 1)

Base URL: `http://localhost:4000/api` · JSON · Header xác thực: `Authorization: Bearer <accessToken>`
Header tuỳ chọn `X-Client-Platform: web | android | ios` (dùng để quản lý phiên đăng nhập).

Lỗi trả về dạng: `{ "error": { "code": "BAD_REQUEST", "message": "...", "details": {...} } }`

## 1. Auth & Profile

| Method | Path | Body | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password, timezone?, language? }` | Đăng ký → `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | Đăng nhập |
| POST | `/auth/google` | `{ idToken }` | Đăng nhập Google (Web GIS / Android Google Sign-In) |
| POST | `/auth/refresh` | `{ refreshToken }` | Làm mới token (xoay vòng refresh token) |
| POST | `/auth/logout` | `{ refreshToken }` | Đăng xuất thiết bị hiện tại |
| POST | `/auth/forgot-password` | `{ email }` | Gửi email đặt lại mật khẩu (dev: in link ra console) |
| POST | `/auth/reset-password` | `{ token, password }` | Đặt lại mật khẩu, đăng xuất mọi thiết bị |
| GET | `/auth/me` | – | Người dùng hiện tại (+ `hasPassword`) |
| GET | `/users/me` | – | Hồ sơ |
| PATCH | `/users/me` | `{ name?, profile?: { learningGoal, interestedSubjects, preferredStudyTimes[{start,end}], dailyTargetMinutes, timezone, language, defaultPomodoro } }` | Cập nhật hồ sơ & sở thích |
| POST | `/users/me/avatar` | multipart `avatar` (≤2MB) | Tải ảnh đại diện (Cloudinary hoặc local) |
| DELETE | `/users/me/avatar` | – | Xoá ảnh |
| POST | `/users/me/change-password` | `{ currentPassword?, newPassword, logoutOtherDevices? }` | Đổi mật khẩu |
| GET | `/users/me/sessions` | – | Danh sách phiên đăng nhập |
| DELETE | `/users/me/sessions/:id` | – | Đăng xuất một thiết bị |
| DELETE | `/users/me/sessions` | – | Đăng xuất mọi thiết bị khác |

## 2. Dashboard

`GET /dashboard` → `dailyGoal`, `studyTime`, `tasks {completed,total,overdue}`, `upcomingTasks`, `streak`, `weeklyProgress[7]`, `distractionsToday`, `focusScore {score, breakdown, isReference}`, `recentActivities`, `activeSession`.

## 3. Learning Management (CRUD chung)

Áp dụng cho `/subjects`, `/courses`, `/goals`, `/tasks`, `/distractions`:

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/{entity}` | `?limit&skip` + bộ lọc riêng |
| GET | `/{entity}/:id` | id = ObjectId hoặc `clientId` |
| POST | `/{entity}` | body + `clientId?` (idempotent khi gửi lại) |
| PATCH | `/{entity}/:id` | body + `baseUpdatedAt?` → 409 nếu bị sửa ở thiết bị khác |
| DELETE | `/{entity}/:id` | xoá mềm (`deletedAt`) để đồng bộ |

Bộ lọc:
- `/courses?subject=`
- `/goals?subject=&status=`
- `/tasks?subject=&course=&goal=&status=todo,in_progress&priority=&search=&from=&to=&sort=deadline|priority|created` (`from/to` lọc theo `scheduledDate` hoặc `deadline` – dùng cho Calendar)
- `/distractions?session=&subject=&reason=&from=&to=`

Task: `{ title, subject, course, goal, description, expectedOutcome, estimatedMinutes, priority: low|medium|high|urgent, status: todo|in_progress|done|cancelled, scheduledDate, deadline, recurrence: { freq: none|daily|weekly|monthly, interval, daysOfWeek[], until } }`.
Khi task lặp lại chuyển sang `done`, server tự tạo lần kế tiếp.

## 4. Focus Session

| Method | Path | Body |
|---|---|---|
| GET | `/sessions/active` | – (tự khôi phục/tạm dừng phiên mất heartbeat) |
| GET | `/sessions` | `?status&subject&task&from&to&limit&skip` |
| GET | `/sessions/:id` | – |
| POST | `/sessions` | `{ subject?, task?, goal, mode: pomodoro|custom|free, plannedMinutes?, pomodoro?, shieldEnabled?, device, at?, clientId?, takeover? }` → 409 nếu đã có phiên mở |
| POST | `/sessions/:id/pause` | `{ at? }` |
| POST | `/sessions/:id/resume` | `{ at? }` |
| POST | `/sessions/:id/break` | `{ at? }` |
| POST | `/sessions/:id/end` | `{ at?, abandon?, goalAchieved?, rating?, note?, markTaskDone? }` |
| POST | `/sessions/:id/heartbeat` | `{ at? }` – gửi 30s/lần |
| POST | `/sessions/:id/app-leave` | `{ leftAt, returnedAt, device }` – Focus Shield ghi nhận rời app/tab |
| PATCH | `/sessions/:id/summary` | `{ goalAchieved?, rating?, note? }` |

Response phiên kèm `focusSecondsNow`, `breakSecondsNow`, `currentSegment`, `serverTime`.

## 5. Focus Shield

| Method | Path | Mô tả |
|---|---|---|
| GET | `/shield` | Cấu hình (blockList, autoEnableOnSession, hideDistractions, schedule) |
| PUT | `/shield` | Cập nhật (domain được chuẩn hoá) |
| GET | `/shield/state` | `{ active, reason: session|schedule, blockList, session }` – chấp nhận cả extension token |
| POST | `/shield/extension-token` | Token chỉ-đọc 90 ngày cho Chrome Extension |

## 6. Distraction Journal

CRUD `/distractions` (xem mục 3) với `reason: social_media|notification|message|too_difficult|tired|other_task|environment|left_app|other`, `category` tự suy ra nếu không gửi, `minuteIntoSession` tự tính từ phiên.

`GET /distractions/stats?days=30` → `byReason`, `byCategory`, `byHour[24]`, `bySubject (median minuteIntoSession)`, `trend`, `perFocusHour`, `insights[]`.

## 7. Đồng bộ

| Method | Path | Mô tả |
|---|---|---|
| GET | `/sync/pull?since=ISO` | Mọi bản ghi thay đổi kể từ `since` (kể cả đã xoá mềm) + `serverTime` |
| POST | `/sync/push` | `{ mutations: [{ mutationId, entity, op, id?, clientId?, data?, baseUpdatedAt?, clientUpdatedAt? }] }` → `{ results: [{ mutationId, status: ok|conflict|error, item }] }` |

`entity = sessions` thì `op` là hành động phiên: `start | pause | resume | break | end | heartbeat | summary | app-leave`.

## 8. Socket.IO

Kết nối `io(API_URL, { auth: { token: accessToken } })`. Mỗi user ở phòng `user:<id>`.

| Sự kiện | Payload |
|---|---|
| `sync:changed` | `{ entity, op: create|update|delete|bulk, doc }` |
| `session:updated` / `session:started` / `session:ended` | phiên (dạng view) |
| `shield:updated` | trạng thái Shield |
| `device:online` / `device:offline` | `{ platform }` |

---

# Phase 2 – Learning Experience

## Focus Recovery
CRUD `/recoveries` – `{ session, distraction?, trigger: manual|distraction|app_leave, action: breathing|goal_reminder|take_break|stretch, outcome: resumed|ended|break, durationSeconds, startedAt, device }`

## Learning Materials
| Method | Path | Mô tả |
|---|---|---|
| POST | `/materials/upload` | multipart `file` (PDF, ảnh, TXT/MD, DOCX ≤ 20MB) + `title?, subject?, category?, description?` – tự trích văn bản PDF/TXT |
| GET | `/materials/search?q=` | Tìm full-text trong cả nội dung tài liệu, trả `snippet` |
| GET | `/materials/categories` | Danh sách phân loại |
| GET | `/materials/:id/text?offset&limit` | Đọc nội dung văn bản |
| POST | `/materials/:id/open` | Ghi nhận "xem gần đây" |
| CRUD | `/materials` | link (`type: link, url`) hoặc ghi chú văn bản (`textContent`); PATCH `bookmarked`, `progress {page,totalPages,percent}` · lọc `?subject&category&type&bookmarked=true&search&sort=recent` |
| CRUD | `/material-notes` | `{ material, kind: note|highlight|bookmark, page?, quote?, content?, color? }` · `?material=` |

## Flashcard & Spaced Repetition (SM-2)
| Method | Path | Mô tả |
|---|---|---|
| CRUD | `/decks`, `/cards` | `/cards?deck=&due=true` |
| GET | `/learn/overview` | due, retention 30 ngày, thống kê từng bộ (new/learning/young/mature) |
| GET | `/learn/due?deck=&limit=` | Thẻ đến hạn |
| POST | `/learn/cards/:id/review` | `{ grade: 0..5, at?, clientId? }` (Again=1, Hard=3, Good=4, Easy=5) |
| GET | `/learn/progress` | Lượt ôn/ngày, retention, tiến bộ từng quiz |

## Quiz & Active Recall
| Method | Path | Mô tả |
|---|---|---|
| CRUD | `/quizzes` | `questions: [{ type: mcq|true_false|short, prompt, options, correctIndex, correctBoolean, acceptedAnswers, explanation }]` (validate chặt) |
| POST | `/learn/quizzes/:id/attempts` | `{ answers:[{qid, answer}], durationSeconds, session? }` → chấm điểm (short answer: bỏ dấu, chấp nhận lỗi gõ nhỏ) |
| GET | `/learn/attempts?quiz=` | Lịch sử |
| GET | `/learn/mistakes?days=` | Câu sai ở lần làm gần nhất (Review Mistakes) |
| POST | `/learn/mistakes/to-cards` | Chuyển câu sai thành flashcard |
| CRUD | `/recalls` | Active Recall sau phiên `{ session, content, selfRating }` |

## Notifications
| Method | Path | Mô tả |
|---|---|---|
| GET | `/notifications?unread=true` | + `unread` |
| POST | `/notifications/:id/read` · `/:id/unread` · `/read-all` | |
| GET/PUT | `/notifications/settings` | studyReminder, taskReminder(+Minutes), breakReminder, dailySummary(+Time), reviewReminder, push, quietStart/End |
| POST/DELETE | `/notifications/push-token` | FCM token Mobile |
| POST | `/notifications/test` | Gửi thử |

Socket: `notification:new`, `notification:read`. Bộ nhắc chạy mỗi phút (`services/scheduler.ts`).

Sync: `/sync/push` hỗ trợ thêm `entity: cards, op: review` và `entity: quizAttempts, op: create` (offline).

# Phase 3 – Smart Learning

| Method | Path | Mô tả |
|---|---|---|
| GET | `/ai/status` | enabled, model, lượt dùng/giờ |
| POST | `/ai/chat` | `{ conversationId?, message, materialId? }` – hỏi đáp, RAG trên tài liệu |
| GET/DELETE | `/ai/conversations[/:id]` | |
| POST | `/ai/summarize` | `{ materialId, length: short|detailed }` – lưu vào `material.aiSummary` |
| POST | `/ai/explain` | `{ concept, context?, level, materialId? }` |
| POST | `/ai/generate/quiz` | `{ materialId? | topic? | sessionId?, count, types, difficulty }` → **bản nháp** |
| POST | `/ai/generate/flashcards` | `{ materialId? | topic?, count }` → **bản nháp** |
| POST | `/ai/recall-feedback` | `{ recallId }` |
| POST | `/ai/recommendations` | Đề xuất + kế hoạch 7 ngày (bản nháp, chọn để tạo task) |
| POST | `/ai/performance` | Diễn giải kết quả tuần/tháng |
| GET | `/analytics/overview?range=day|week|month` | metrics (planned / actual focus / study / distraction / completion / quiz accuracy / retention…), so sánh kỳ trước, series, bySubject, byHour, bestFocusTimes |
| GET | `/analytics/insights` | Focus Intelligence (luật, không tốn AI) |
| GET | `/analytics/export?range=` | CSV |

AI giới hạn `AI_MAX_REQUESTS_PER_HOUR`/người, trả 503 nếu chưa có `ANTHROPIC_API_KEY`.
