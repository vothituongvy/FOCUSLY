declare global {
  namespace Express {
    interface Request {
      userId?: string;
      authSessionId?: string;
      platform?: string;
    }
  }
}

export {};
