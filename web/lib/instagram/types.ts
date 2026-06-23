export interface LoginRequestBody {
  username?: string;
  password?: string;
  verificationCode?: string;
  twoFactorIdentifier?: string;
  verificationMethod?: string;
  remember?: boolean;
}

export interface SessionProfile {
  id: string;
  username: string;
  fullName: string;
  isPrivate: boolean;
  isVerified: boolean;
  profilePicUrl?: string;
  biography?: string;
  externalUrl?: string;
  loginAt: string;
}

export interface WebSession {
  jarJson: { cookies: Array<{
    key: string;
    value: string;
    expires?: string;
    domain?: string;
    path?: string;
  }> };
  csrftoken: string;
  userId: string;
}

export interface DashboardPost {
  id: string;
  code: string;
  takenAt: number;
  caption: string;
  thumbnail: string;
  displayUrl: string;
  likeCount: number;
  commentCount: number;
  mediaType: number;
  carouselMedia: Array<{ thumbnail: string }>;
}

export interface SessionData {
  profile: SessionProfile;
  igState?: Record<string, unknown>;
  web?: WebSession;
}
