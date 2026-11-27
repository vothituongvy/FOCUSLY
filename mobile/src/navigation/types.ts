export type AuthStackParams = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type TabParams = {
  Dashboard: undefined;
  Plan: undefined;
  Focus: { taskId?: string } | undefined;
  Learn: undefined;
  Profile: undefined;
};

export type AppStackParams = {
  Tabs: undefined;
  TaskEdit: { taskId?: string; subjectId?: string | null; scheduledDate?: string } | undefined;
  SubjectEdit: { subjectId?: string } | undefined;
  Journal: undefined;
  // Phase 2-3
  Review: { deckId?: string } | undefined;
  QuizTake: { quizId: string };
  Materials: undefined;
  AIChat: { materialId?: string; conversationId?: string } | undefined;
  AICoach: undefined;
  Notifications: undefined;
  Analytics: undefined;
  // Bổ sung cho bằng bản Web
  History: undefined;
  Guide: undefined;
  MaterialDetail: { materialId: string };
  MaterialAdd: { kind?: 'link' | 'text' | 'file' } | undefined;
  DeckEdit: { deckId?: string; fromFile?: boolean } | undefined;
  QuizEdit: { quizId?: string; fromFile?: boolean } | undefined;
  Preferences: undefined;
  ShieldSettings: undefined;
  NotificationSettings: undefined;
  Security: undefined;
  Mistakes: undefined;
  LearnProgress: undefined;
  Goals: undefined;
};
