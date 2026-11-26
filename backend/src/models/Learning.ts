import { Schema, model, InferSchemaType } from 'mongoose';
import { jsonOptions, syncFields, syncable } from './common';

/* ---------- Subject (Môn học) ---------- */
const subjectSchema = new Schema(
  {
    ...syncFields,
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 1000 },
    color: { type: String, default: '#6366f1' },
    icon: { type: String, default: '📘' },
    archived: { type: Boolean, default: false },
  },
  jsonOptions,
);
syncable(subjectSchema);
export const SubjectModel = model('Subject', subjectSchema);
export type Subject = InferSchemaType<typeof subjectSchema>;

/* ---------- Course (Khoá học / Chủ đề) ---------- */
const courseSchema = new Schema(
  {
    ...syncFields,
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 2000 },
    order: { type: Number, default: 0 },
  },
  jsonOptions,
);
syncable(courseSchema);
export const CourseModel = model('Course', courseSchema);

/* ---------- Goal (Mục tiêu học tập) ---------- */
const goalSchema = new Schema(
  {
    ...syncFields,
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    targetDate: { type: Date, default: null },
    status: { type: String, enum: ['active', 'achieved', 'abandoned'], default: 'active' },
  },
  jsonOptions,
);
syncable(goalSchema);
export const GoalModel = model('Goal', goalSchema);

/* ---------- Task (Nhiệm vụ học tập) ---------- */
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export const RECURRENCE_FREQS = ['none', 'daily', 'weekly', 'monthly'] as const;

const taskSchema = new Schema(
  {
    ...syncFields,
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    goal: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    expectedOutcome: { type: String, default: '', maxlength: 1000 },
    estimatedMinutes: { type: Number, default: 30, min: 0, max: 1440 },
    actualFocusSeconds: { type: Number, default: 0 },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo', index: true },
    scheduledDate: { type: Date, default: null }, // ngày dự định học (Study Plan / Calendar)
    deadline: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    recurrence: {
      freq: { type: String, enum: RECURRENCE_FREQS, default: 'none' },
      interval: { type: Number, default: 1, min: 1, max: 365 },
      daysOfWeek: { type: [Number], default: [] },
      until: { type: Date, default: null },
    },
    recurrenceParent: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  jsonOptions,
);
syncable(taskSchema);
taskSchema.index({ user: 1, scheduledDate: 1 });
taskSchema.index({ user: 1, deadline: 1 });
export const TaskModel = model('Task', taskSchema);
export type Task = InferSchemaType<typeof taskSchema>;
