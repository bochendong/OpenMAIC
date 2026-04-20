export type GamificationCharacterAssetType = 'LIVE2D' | 'AVATAR';

export type GamificationCharacterId =
  | 'haru'
  | 'hiyori'
  | 'mark'
  | 'avatar-r-pack'
  | 'avatar-sr-pack'
  | 'avatar-ssr-pack';

export type GamificationMissionId =
  | 'daily_sign_in'
  | 'daily_lesson'
  | 'daily_quiz'
  | 'daily_review'
  | 'daily_all_clear'
  | 'weekly_study_days'
  | 'weekly_quiz_batches';

export type GamificationClaimKind = 'daily_sign_in' | 'daily_tasks' | 'streak_bonus';

export type GamificationEventType =
  | 'lesson_milestone_completed'
  | 'quiz_completed'
  | 'review_completed';

export interface GamificationCharacterSummary {
  id: GamificationCharacterId | string;
  name: string;
  assetType: GamificationCharacterAssetType;
  unlockCostPurchaseCredits: number;
  affinityLevelRequired: number;
  isDefault: boolean;
  isUnlocked: boolean;
  isEquipped: boolean;
  affinityExp: number;
  affinityLevel: number;
  previewSrc?: string | null;
  badgeLabel?: string | null;
  accentColor?: string | null;
  description?: string | null;
  collectionLabel?: string | null;
  nextUnlockHint?: string | null;
}

export interface GamificationMissionSummary {
  id: GamificationMissionId;
  label: string;
  period: 'daily' | 'weekly';
  targetValue: number;
  progressValue: number;
  completed: boolean;
  claimed: boolean;
  rewardPurchaseCredits: number;
}

export interface GamificationClaimableSummary {
  dailySignIn: boolean;
  dailyTasks: boolean;
  streakBonusDays: number | null;
}

export interface GamificationNudgeSummary {
  title: string;
  body: string;
  tone: 'gentle' | 'encouraging';
}

export interface GamificationSummaryResponse {
  success: true;
  databaseEnabled: boolean;
  profile: {
    streakDays: number;
    lastStudyAt: string | null;
    todayEarnedPurchaseCredits: number;
    preferredCharacterId: string;
    equippedCharacterId: string;
    affinityExp: number;
    affinityLevel: number;
    nextAffinityLevelExp: number | null;
    todayAffinityEarned: number;
    todayAffinityCap: number;
  };
  balances: {
    purchase: number;
    cash: number;
    compute: number;
  };
  claimables: GamificationClaimableSummary;
  dailyTasks: GamificationMissionSummary[];
  weeklyTasks: GamificationMissionSummary[];
  characters: GamificationCharacterSummary[];
  nudge: GamificationNudgeSummary | null;
}

export interface GamificationEventResponse {
  success: true;
  databaseEnabled: boolean;
  eventType: GamificationEventType;
  rewardedPurchaseCredits: number;
  rewardedAffinity: number;
  newPurchaseBalance: number;
  characterId: string;
  characterName: string;
  affinityLevel: number;
  accuracyBonusApplied?: boolean;
  reviewEligible?: boolean;
}

