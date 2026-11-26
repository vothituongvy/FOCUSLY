# FOCUSLY – MongoDB Schema (Phase 1)

Mọi collection dữ liệu học tập dùng chung các trường đồng bộ: `user`, `clientId` (unique theo user, cho bản ghi tạo offline), `deletedAt` (xoá mềm), `createdAt`, `updatedAt` + index `{ user, updatedAt }` cho `/sync/pull`.

| Collection | Trường chính | Index |
|---|---|---|
| **users** | email (unique), passwordHash, googleId, name, avatarUrl, profile { learningGoal, interestedSubjects[], preferredStudyTimes[{start,end}], dailyTargetMinutes, timezone, language, defaultPomodoro }, shield { blockList[], autoEnableOnSession, hideDistractions, schedule[{days[], start, end, enabled}] }, resetPasswordTokenHash, resetPasswordExpires | email, googleId |
| **authsessions** | user, tokenHash (sha256 refresh token), platform, userAgent, ip, lastUsedAt, expiresAt (TTL), revokedAt | tokenHash unique, expiresAt TTL |
| **subjects** | name, description, color, icon, archived | user+updatedAt |
| **courses** | subject, name, description, order | subject |
| **goals** | subject, title, description, targetDate, status (active/achieved/abandoned) | |
| **tasks** | subject, course, goal, title, description, expectedOutcome, estimatedMinutes, actualFocusSeconds, priority, status, scheduledDate, deadline, completedAt, recurrence { freq, interval, daysOfWeek, until }, recurrenceParent | user+scheduledDate, user+deadline, status |
| **focussessions** | subject, task, goal, mode, plannedMinutes, pomodoro{…, completedCycles}, status (active/paused/on_break/completed/abandoned), startedAt, endedAt, **segments[{type: focus/break, startedAt, endedAt, endReason}]**, actualFocusSeconds, breakSeconds, pauseCount, distractionCount, appLeaveCount, shieldEnabled, device, lastHeartbeatAt, autoPausedAt, summary { goalAchieved, rating, note } | user+startedAt, status |
| **distractions** | session, subject, task, reason, category (digital/internal/external), note, occurredAt, minuteIntoSession, durationSeconds, source (manual/auto), device | user+occurredAt, session |
| **syncmutations** | user, mutationId, result, createdAt (TTL 14 ngày) | user+mutationId unique |

## Phân biệt các chỉ số

- **Planned Time** = `focussessions.plannedMinutes` / `tasks.estimatedMinutes`
- **Actual Focus Time** = tổng độ dài các segment `focus` (giờ server)
- **Distraction Count** = số `distractions` thủ công trong phiên (không tính `left_app`)
- **Completion Rate** = task `done` / task của ngày
- Focus Score chỉ là điểm tham khảo, trả kèm `breakdown`.

## Mobile (SQLite / OP-SQLite)

| Bảng | Mô tả |
|---|---|
| `records(entity, id, json, updatedAt, pending)` | Bản sao cục bộ dữ liệu |
| `outbox(seq, mutationId, entity, op, refId, json, attempts)` | Hàng đợi thay đổi offline theo thứ tự |
| `kv(k, v)` | lastPullAt, user, activeSession, cache dashboard/thống kê |

## Phase 2–3

| Collection | Trường chính |
|---|---|
| **materials** | subject, course, title, category, tags, type (pdf/image/text/link/document), url, storageId, textContent (ẩn, text index), hasText, bookmarked, lastOpenedAt, progress{page,totalPages,percent}, aiSummary |
| **materialnotes** | material, kind (note/highlight/bookmark), page, quote, content, color |
| **decks** / **cards** | card.srs { ease, interval, repetitions, lapses, due, lastReviewedAt } – index `{user, srs.due}` |
| **reviewlogs** | card, deck, grade, intervalBefore/After, easeAfter, reviewedAt |
| **quizzes** | questions[{qid, type, prompt, options, correctIndex, correctBoolean, acceptedAnswers, explanation}], source (manual/ai) |
| **quizattempts** | quiz, answers[{qid, answer, correct, correctAnswer, explanation}], score, total, accuracy, durationSeconds |
| **recalls** | session, content, selfRating, aiFeedback |
| **recoveries** | session, distraction, trigger, action, outcome, durationSeconds |
| **notifications** | type, title, body, data.link, readAt, dedupeKey (unique), TTL 90 ngày |
| **pushtokens** | token (unique), platform |
| **aiconversations** | messages[{role, content}], material |
| **aiusages** | feature, inputTokens, outputTokens (TTL 60 ngày) |
