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
  TaskEdit: { taskId?: string; subjectId?: string | null } | undefined;
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
  MaterialAdd: { kind?: 'link' | 'text' } | undefined;
  DeckEdit: { deckId?: string } | undefined;
  QuizEdit: { quizId?: string } | undefined;
  Preferences: undefined;
  ShieldSettings: undefined;
  NotificationSettings: undefined;
  Security: undefined;
};
