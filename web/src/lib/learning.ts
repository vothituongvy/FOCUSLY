'use client';

import { create } from 'zustand';
import { get } from './api';
import type { Course, Goal, Subject } from './types';

/** Store dùng chung cho Môn học / Khoá học / Mục tiêu (dùng ở nhiều trang) */
interface LearningState {
  subjects: Subject[];
  courses: Course[];
  goals: Goal[];
  loaded: boolean;
  load: () => Promise<void>;
  subjectById: (id?: string | null) => Subject | undefined;
}

export const useLearning = create<LearningState>((set, getState) => ({
  subjects: [],
  courses: [],
  goals: [],
  loaded: false,
  load: async () => {
    const [s, c, g] = await Promise.all([
      get<{ items: Subject[] }>('/subjects'),
      get<{ items: Course[] }>('/courses'),
      get<{ items: Goal[] }>('/goals'),
    ]);
    set({ subjects: s.items, courses: c.items, goals: g.items, loaded: true });
  },
  subjectById: (id) => (id ? getState().subjects.find((s) => s.id === id) : undefined),
}));
