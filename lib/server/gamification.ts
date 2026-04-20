import {
  CharacterAssetType,
  CreditTransactionKind,
  LearningActionType,
  MissionType,
  type Prisma,
  type PrismaClient,
} from '@/lib/server/generated-prisma';
import { createLogger } from '@/lib/logger';
import {
  applyCreditDelta,
  getUserCreditBalances,
} from '@/lib/server/credits';
import type {
  GamificationCharacterSummary,
  GamificationClaimKind,
  GamificationEventResponse,
  GamificationEventType,
  GamificationMissionSummary,
  GamificationSummaryResponse,
} from '@/lib/types/gamification';
import { DEFAULT_LIVE2D_PRESENTER_MODEL_ID } from '@/lib/live2d/presenter-models';

type GamificationDbClient = PrismaClient | Prisma.TransactionClient;

const log = createLogger('Gamification');
const APP_TIME_ZONE = 'America/Toronto';
const DAILY_PURCHASE_EARN_CAP = 120;
const DAILY_AFFINITY_EARN_CAP = 20;
const DEFAULT_CHARACTER_ID = DEFAULT_LIVE2D_PRESENTER_MODEL_ID;

const REWARD_RULES = {
  dailySignIn: { purchaseCredits: 5, affinity: 1 },
  lessonMilestone: { purchaseCredits: 8, affinity: 2 },
  quizCompletion: { purchaseCredits: 12, affinity: 3 },
  quizAccuracyBonus: { purchaseCredits: 6, affinity: 0 },
  reviewCompletion: { purchaseCredits: 10, affinity: 4 },
  dailyAllClear: { purchaseCredits: 20, affinity: 0 },
  streakBonus: {
    3: 15,
    7: 40,
    14: 100,
  } as Record<number, number>,
} as const;

const AFFINITY_LEVEL_THRESHOLDS = [0, 30, 80, 160, 300] as const;

const DAILY_TASK_DEFINITIONS: Array<{
  id: 'daily_lesson' | 'daily_quiz' | 'daily_review';
  missionType: MissionType;
  label: string;
  targetValue: number;
  rewardPurchaseCredits: number;
}> = [
  {
    id: 'daily_lesson',
    missionType: MissionType.DAILY_LESSON,
    label: '看 1 节课',
    targetValue: 1,
    rewardPurchaseCredits: 0,
  },
  {
    id: 'daily_quiz',
    missionType: MissionType.DAILY_QUIZ,
    label: '做 1 组题',
    targetValue: 1,
    rewardPurchaseCredits: 0,
  },
  {
    id: 'daily_review',
    missionType: MissionType.DAILY_REVIEW,
    label: '回顾 1 组错题',
    targetValue: 1,
    rewardPurchaseCredits: 0,
  },
];

const WEEKLY_TASK_DEFINITIONS: Array<{
  id: 'weekly_study_days' | 'weekly_quiz_batches';
  missionType: MissionType;
  label: string;
  targetValue: number;
  rewardPurchaseCredits: number;
}> = [
  {
    id: 'weekly_study_days',
    missionType: MissionType.WEEKLY_STUDY_DAYS,
    label: '完成 5 次学习日',
    targetValue: 5,
    rewardPurchaseCredits: 0,
  },
  {
    id: 'weekly_quiz_batches',
    missionType: MissionType.WEEKLY_QUIZ_BATCHES,
    label: '累计完成 8 组题',
    targetValue: 8,
    rewardPurchaseCredits: 0,
  },
];

const DEFAULT_CATALOG: Array<{
  id: string;
  name: string;
  assetType: CharacterAssetType;
  unlockCostPurchaseCredits: number;
  affinityLevelRequired: number;
  sortOrder: number;
  isDefault: boolean;
  metadata: Prisma.InputJsonObject;
}> = [
  {
    id: 'haru',
    name: 'Haru',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 0,
    affinityLevelRequired: 1,
    sortOrder: 10,
    isDefault: true,
    metadata: {
      previewSrc: '/live2d/previews/haru.jpg',
      badgeLabel: 'Haru',
      accentColor: '#38bdf8',
      description: '新手陪伴搭子，会用轻轻的节奏把你拉回学习状态。',
    },
  },
  {
    id: 'hiyori',
    name: 'Hiyori',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 500,
    affinityLevelRequired: 2,
    sortOrder: 20,
    isDefault: false,
    metadata: {
      previewSrc: '/live2d/previews/hiyori.jpg',
      badgeLabel: 'Hiyori',
      accentColor: '#fb7185',
      description: '更温柔、更会安慰人的搭子，适合晚间复习和低门槛开做。',
    },
  },
  {
    id: 'mark',
    name: 'Mark',
    assetType: CharacterAssetType.LIVE2D,
    unlockCostPurchaseCredits: 900,
    affinityLevelRequired: 4,
    sortOrder: 30,
    isDefault: false,
    metadata: {
      previewSrc: '/live2d/previews/mark.jpg',
      badgeLabel: 'Mark',
      accentColor: '#f59e0b',
      description: '更偏策略型的学习搭子，适合你想稳定冲刺的时候。',
    },
  },
  {
    id: 'avatar-r-pack',
    name: 'R Avatar Pack',
    assetType: CharacterAssetType.AVATAR,
    unlockCostPurchaseCredits: 60,
    affinityLevelRequired: 1,
    sortOrder: 110,
    isDefault: false,
    metadata: {
      previewSrc: '/avatars/user-avators/R1.avif',
      collectionLabel: 'R 收藏头像',
      accentColor: '#93c5fd',
      description: '基础头像收藏包，适合刚开始攒收藏的阶段。',
    },
  },
  {
    id: 'avatar-sr-pack',
    name: 'SR Avatar Pack',
    assetType: CharacterAssetType.AVATAR,
    unlockCostPurchaseCredits: 180,
    affinityLevelRequired: 2,
    sortOrder: 120,
    isDefault: false,
    metadata: {
      previewSrc: '/avatars/user-avators/SR1.avif',
      collectionLabel: 'SR 收藏头像',
      accentColor: '#c084fc',
      description: '更稀有的头像收藏包，给持续学习的人一些漂亮奖励。',
    },
  },
  {
    id: 'avatar-ssr-pack',
    name: 'SSR Avatar Pack',
    assetType: CharacterAssetType.AVATAR,
    unlockCostPurchaseCredits: 420,
    affinityLevelRequired: 4,
    sortOrder: 130,
    isDefault: false,
    metadata: {
      previewSrc: '/avatars/user-avators/SSR1.avif',
      collectionLabel: 'SSR 收藏头像',
      accentColor: '#f472b6',
      description: '高阶收藏头像，留给真正把学习坚持下来的你。',
    },
  },
];

function getDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');

  return { year, month, day };
}

function dateKeyFromDate(date = new Date()): string {
  const { year, month, day } = getDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateFromDateKey(dateKey: string): Date {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDays(dateKey: string, offset: number): string {
  const base = dateFromDateKey(dateKey);
  base.setUTCDate(base.getUTCDate() + offset);
  return dateKeyFromDate(base);
}

function dayDiff(from: Date, to: Date): number {
  const fromUtc = dateFromDateKey(dateKeyFromDate(from)).getTime();
  const toUtc = dateFromDateKey(dateKeyFromDate(to)).getTime();
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function currentWeekKey(date = new Date()): string {
  const key = dateKeyFromDate(date);
  const localDate = dateFromDateKey(key);
  const day = localDate.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const mondayKey = addDays(key, mondayOffset);
  return `week:${mondayKey}`;
}

function startOfTodayUtc(): Date {
  return dateFromDateKey(dateKeyFromDate(new Date()));
}

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getMetadataString(metadata: Prisma.JsonValue | null | undefined, key: string): string {
  if (!isJsonObject(metadata)) return '';
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getInputMetadataString(metadata: Prisma.InputJsonObject | null | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getMetadataNumber(metadata: Prisma.JsonValue | null | undefined, key: string): number | null {
  if (!isJsonObject(metadata)) return null;
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function computeAffinityLevel(exp: number): number {
  let level = 1;
  for (let index = 0; index < AFFINITY_LEVEL_THRESHOLDS.length; index += 1) {
    if (exp >= AFFINITY_LEVEL_THRESHOLDS[index]) {
      level = index + 1;
    }
  }
  return level;
}

function nextLevelExp(level: number): number | null {
  return AFFINITY_LEVEL_THRESHOLDS[level] ?? null;
}

async function ensureCatalogSeeded(db: GamificationDbClient): Promise<void> {
  await Promise.all(
    DEFAULT_CATALOG.map((item) =>
      db.characterCatalog.upsert({
        where: { id: item.id },
        create: item,
        update: {
          name: item.name,
          assetType: item.assetType,
          unlockCostPurchaseCredits: item.unlockCostPurchaseCredits,
          affinityLevelRequired: item.affinityLevelRequired,
          sortOrder: item.sortOrder,
          isDefault: item.isDefault,
          metadata: item.metadata,
        },
      }),
    ),
  );
}

async function normalizeEngagementProfile(
  db: GamificationDbClient,
  userId: string,
): Promise<{
  id: string;
  userId: string;
  streakDays: number;
  lastStudyAt: Date | null;
  todayEarnedPurchaseCredits: number;
  preferredCharacterId: string | null;
}> {
  const existing = await db.userEngagementProfile.upsert({
    where: { userId },
    create: {
      userId,
      preferredCharacterId: DEFAULT_CHARACTER_ID,
    },
    update: {},
    select: {
      id: true,
      userId: true,
      streakDays: true,
      lastStudyAt: true,
      todayEarnedPurchaseCredits: true,
      preferredCharacterId: true,
    },
  });

  const todayKey = dateKeyFromDate(new Date());
  const lastStudyKey = existing.lastStudyAt ? dateKeyFromDate(existing.lastStudyAt) : null;
  let nextStreakDays = existing.streakDays;
  let nextTodayEarned = existing.todayEarnedPurchaseCredits;

  if (!lastStudyKey || lastStudyKey !== todayKey) {
    nextTodayEarned = 0;
  }
  if (existing.lastStudyAt && dayDiff(existing.lastStudyAt, new Date()) > 1) {
    nextStreakDays = 0;
  }

  if (
    nextStreakDays !== existing.streakDays ||
    nextTodayEarned !== existing.todayEarnedPurchaseCredits ||
    existing.preferredCharacterId == null
  ) {
    return db.userEngagementProfile.update({
      where: { userId },
      data: {
        streakDays: nextStreakDays,
        todayEarnedPurchaseCredits: nextTodayEarned,
        preferredCharacterId: existing.preferredCharacterId ?? DEFAULT_CHARACTER_ID,
      },
      select: {
        id: true,
        userId: true,
        streakDays: true,
        lastStudyAt: true,
        todayEarnedPurchaseCredits: true,
        preferredCharacterId: true,
      },
    });
  }

  return existing;
}

async function ensureUserCharacterProgress(
  db: GamificationDbClient,
  userId: string,
) {
  const catalog = await db.characterCatalog.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const progressRows = await db.userCharacterProgress.findMany({
    where: { userId },
  });
  const existingIds = new Set(progressRows.map((row) => row.characterId));

  const creates = catalog
    .filter((item) => !existingIds.has(item.id))
    .map((item) =>
      db.userCharacterProgress.create({
        data: {
          userId,
          characterId: item.id,
          isUnlocked: item.isDefault,
          equippedAt:
            item.isDefault && item.assetType === CharacterAssetType.LIVE2D ? new Date() : null,
          affinityExp: item.isDefault ? 0 : 0,
          affinityLevel: 1,
        },
      }),
    );

  if (creates.length > 0) {
    await Promise.all(creates);
  }

  const refreshed = await db.userCharacterProgress.findMany({
    where: { userId },
    include: {
      character: true,
    },
    orderBy: [{ character: { sortOrder: 'asc' } }],
  });

  const equippedLive2d = refreshed.find(
    (row) => row.character.assetType === CharacterAssetType.LIVE2D && row.equippedAt != null,
  );
  if (!equippedLive2d) {
    await db.userCharacterProgress.updateMany({
      where: {
        userId,
        characterId: DEFAULT_CHARACTER_ID,
      },
      data: {
        isUnlocked: true,
        equippedAt: new Date(),
      },
    });
  }

  return db.userCharacterProgress.findMany({
    where: { userId },
    include: {
      character: true,
    },
    orderBy: [{ character: { sortOrder: 'asc' } }],
  });
}

async function ensureMissionRow(
  db: GamificationDbClient,
  userId: string,
  missionType: MissionType,
  periodKey: string,
  targetValue: number,
) {
  return db.userMissionProgress.upsert({
    where: {
      userId_missionType_periodKey: {
        userId,
        missionType,
        periodKey,
      },
    },
    create: {
      userId,
      missionType,
      periodKey,
      targetValue,
      progressValue: 0,
    },
    update: {
      targetValue,
    },
  });
}

async function incrementMissionProgress(
  db: GamificationDbClient,
  userId: string,
  missionType: MissionType,
  periodKey: string,
  targetValue: number,
  incrementBy: number,
): Promise<void> {
  const row = await ensureMissionRow(db, userId, missionType, periodKey, targetValue);
  if (incrementBy <= 0) return;

  await db.userMissionProgress.update({
    where: { id: row.id },
    data: {
      progressValue: Math.min(targetValue, row.progressValue + incrementBy),
    },
  });
}

async function getTodayLogs(db: GamificationDbClient, userId: string) {
  return db.learningActionLog.findMany({
    where: {
      userId,
      createdAt: {
        gte: startOfTodayUtc(),
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function getTodayAffinityEarnedForCharacter(
  db: GamificationDbClient,
  userId: string,
  characterId: string,
): Promise<number> {
  const todayLogs = await getTodayLogs(db, userId);
  return todayLogs.reduce((sum, row) => {
    const logCharacterId = getMetadataString(row.metadata, 'characterId');
    if (logCharacterId !== characterId) return sum;
    return sum + Math.max(0, row.rewardedAffinity);
  }, 0);
}

async function touchStudyDay(
  db: GamificationDbClient,
  userId: string,
): Promise<{
  streakDays: number;
  isNewStudyDay: boolean;
  profile: Awaited<ReturnType<typeof normalizeEngagementProfile>>;
}> {
  const profile = await normalizeEngagementProfile(db, userId);
  const now = new Date();
  const lastStudyAt = profile.lastStudyAt;
  const sameDay = lastStudyAt ? dayDiff(lastStudyAt, now) === 0 : false;
  if (sameDay) {
    return {
      streakDays: profile.streakDays,
      isNewStudyDay: false,
      profile,
    };
  }

  const newStreakDays =
    lastStudyAt == null
      ? 1
      : dayDiff(lastStudyAt, now) === 1
        ? Math.max(1, profile.streakDays + 1)
        : 1;

  const updated = await db.userEngagementProfile.update({
    where: { userId },
    data: {
      lastStudyAt: now,
      streakDays: newStreakDays,
      todayEarnedPurchaseCredits: 0,
    },
    select: {
      id: true,
      userId: true,
      streakDays: true,
      lastStudyAt: true,
      todayEarnedPurchaseCredits: true,
      preferredCharacterId: true,
    },
  });

  await incrementMissionProgress(
    db,
    userId,
    MissionType.WEEKLY_STUDY_DAYS,
    currentWeekKey(now),
    5,
    1,
  );

  return {
    streakDays: newStreakDays,
    isNewStudyDay: true,
    profile: updated,
  };
}

async function grantReward(
  db: GamificationDbClient,
  args: {
    userId: string;
    purchaseCredits: number;
    affinity: number;
    kind: CreditTransactionKind;
    actionType: LearningActionType;
    description: string;
    referenceType: string;
    referenceId?: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<{
  grantedPurchaseCredits: number;
  grantedAffinity: number;
  balanceAfter: number;
  characterId: string;
  characterName: string;
  affinityLevel: number;
}> {
  const profile = await normalizeEngagementProfile(db, args.userId);
  const preferredCharacterId = profile.preferredCharacterId ?? DEFAULT_CHARACTER_ID;
  const progress = await db.userCharacterProgress.findUnique({
    where: {
      userId_characterId: {
        userId: args.userId,
        characterId: preferredCharacterId,
      },
    },
    include: {
      character: true,
    },
  });

  if (!progress) {
    throw new Error('Character progress is missing');
  }

  const remainingCredits = Math.max(
    0,
    DAILY_PURCHASE_EARN_CAP - Math.max(0, profile.todayEarnedPurchaseCredits),
  );
  const grantedPurchaseCredits = Math.max(
    0,
    Math.min(args.purchaseCredits, remainingCredits),
  );

  const todayAffinityEarned = await getTodayAffinityEarnedForCharacter(
    db,
    args.userId,
    preferredCharacterId,
  );
  const remainingAffinity = Math.max(0, DAILY_AFFINITY_EARN_CAP - todayAffinityEarned);
  const grantedAffinity = Math.max(0, Math.min(args.affinity, remainingAffinity));

  let balanceAfter = (await getUserCreditBalances(db, args.userId)).purchaseCreditsBalance;
  if (grantedPurchaseCredits > 0) {
    balanceAfter = await applyCreditDelta(db, {
      userId: args.userId,
      delta: grantedPurchaseCredits,
      kind: args.kind,
      accountType: 'PURCHASE',
      description: args.description,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      metadata: {
        ...(args.metadata ?? {}),
        characterId: preferredCharacterId,
      },
    });
    await db.userEngagementProfile.update({
      where: { userId: args.userId },
      data: {
        todayEarnedPurchaseCredits: {
          increment: grantedPurchaseCredits,
        },
      },
    });
  }

  let affinityLevel = progress.affinityLevel;
  if (grantedAffinity > 0) {
    const affinityExp = progress.affinityExp + grantedAffinity;
    affinityLevel = computeAffinityLevel(affinityExp);
    await db.userCharacterProgress.update({
      where: {
        userId_characterId: {
          userId: args.userId,
          characterId: preferredCharacterId,
        },
      },
      data: {
        affinityExp,
        affinityLevel,
      },
    });
  }

  await db.learningActionLog.create({
    data: {
      userId: args.userId,
      actionType: args.actionType,
      courseId: getInputMetadataString(args.metadata ?? null, 'courseId') || null,
      sceneId: getInputMetadataString(args.metadata ?? null, 'sceneId') || null,
      rewardedPurchaseCredits: grantedPurchaseCredits,
      rewardedAffinity: grantedAffinity,
      metadata: {
        ...(args.metadata ?? {}),
        characterId: preferredCharacterId,
      },
    },
  });

  return {
    grantedPurchaseCredits,
    grantedAffinity,
    balanceAfter,
    characterId: preferredCharacterId,
    characterName: progress.character.name,
    affinityLevel,
  };
}

async function hasActionLog(
  db: GamificationDbClient,
  args: {
    userId: string;
    actionType: LearningActionType;
    sceneId?: string;
    courseId?: string;
    referenceKey?: string;
    since?: Date;
  },
): Promise<boolean> {
  const row = await db.learningActionLog.findFirst({
    where: {
      userId: args.userId,
      actionType: args.actionType,
      ...(args.sceneId ? { sceneId: args.sceneId } : {}),
      ...(args.courseId ? { courseId: args.courseId } : {}),
      ...(args.since
        ? {
            createdAt: {
              gte: args.since,
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!row) return false;
  if (!args.referenceKey) return true;
  return getMetadataString(row.metadata, 'referenceKey') === args.referenceKey;
}

function dailyTaskPeriodKey() {
  return `daily:${dateKeyFromDate(new Date())}`;
}

function weeklyTaskPeriodKey() {
  return currentWeekKey(new Date());
}

async function buildMissionSummaryRows(
  db: GamificationDbClient,
  userId: string,
  period: 'daily' | 'weekly',
): Promise<GamificationMissionSummary[]> {
  const definitions = period === 'daily' ? DAILY_TASK_DEFINITIONS : WEEKLY_TASK_DEFINITIONS;
  const periodKey = period === 'daily' ? dailyTaskPeriodKey() : weeklyTaskPeriodKey();

  const rows = await Promise.all(
    definitions.map(async (definition) => {
      const row = await ensureMissionRow(
        db,
        userId,
        definition.missionType,
        periodKey,
        definition.targetValue,
      );
      return {
        id: definition.id,
        label: definition.label,
        period,
        targetValue: definition.targetValue,
        progressValue: row.progressValue,
        completed: row.progressValue >= row.targetValue,
        claimed: Boolean(row.claimedAt),
        rewardPurchaseCredits: definition.rewardPurchaseCredits,
      } satisfies GamificationMissionSummary;
    }),
  );

  return rows;
}

async function buildClaimables(
  db: GamificationDbClient,
  userId: string,
  streakDays: number,
  dailyTasks: GamificationMissionSummary[],
) {
  const todayLogs = await getTodayLogs(db, userId);
  const hasDailySignIn = todayLogs.some((row) => row.actionType === LearningActionType.DAILY_SIGN_IN);
  const hasDailyTaskReward = todayLogs.some(
    (row) => row.actionType === LearningActionType.DAILY_TASK_REWARD,
  );
  const streakMilestone = [14, 7, 3].find((value) => value === streakDays) ?? null;
  const hasStreakReward = streakMilestone
    ? todayLogs.some(
        (row) =>
          row.actionType === LearningActionType.STREAK_BONUS &&
          getMetadataNumber(row.metadata, 'milestoneDays') === streakMilestone,
      )
    : false;

  return {
    dailySignIn: !hasDailySignIn,
    dailyTasks:
      dailyTasks.every((task) => task.completed) && !hasDailyTaskReward,
    streakBonusDays: streakMilestone && !hasStreakReward ? streakMilestone : null,
  };
}

async function inferNudge(
  db: GamificationDbClient,
  userId: string,
  streakDays: number,
  lastStudyAt: Date | null,
) {
  const now = new Date();
  const daysSinceStudy = lastStudyAt ? dayDiff(lastStudyAt, now) : 99;
  if (daysSinceStudy >= 2) {
    return {
      title: '先回来做 1 题就好',
      body: '不用一下子补很多。我们先把今天的第一题做掉，节奏就会慢慢回来。',
      tone: 'gentle' as const,
    };
  }

  const yesterdayKey = addDays(dateKeyFromDate(now), -1);
  const yesterdayStart = dateFromDateKey(yesterdayKey);
  const todayStart = startOfTodayUtc();
  const yesterdayQuizWithErrors = await db.learningActionLog.findFirst({
    where: {
      userId,
      actionType: LearningActionType.QUIZ_COMPLETED,
      createdAt: {
        gte: yesterdayStart,
        lt: todayStart,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const todayReview = await db.learningActionLog.findFirst({
    where: {
      userId,
      actionType: LearningActionType.REVIEW_COMPLETED,
      createdAt: {
        gte: todayStart,
      },
    },
  });
  if (
    yesterdayQuizWithErrors &&
    !todayReview &&
    (getMetadataNumber(yesterdayQuizWithErrors.metadata, 'incorrectCount') ?? 0) > 0
  ) {
    const incorrectCount =
      getMetadataNumber(yesterdayQuizWithErrors.metadata, 'incorrectCount') ?? 3;
    return {
      title: '回来看看我为你留的错题',
      body: `昨天还有 ${incorrectCount} 题没回头看。今天把它们轻轻收掉，节奏会更稳。`,
      tone: 'encouraging' as const,
    };
  }

  if (!lastStudyAt || dayDiff(lastStudyAt, now) >= 1) {
    return {
      title: '今晚先做 1 题也算开始',
      body: '你不用一下进入高强度。先做一题、看一页、找回手感就已经很好了。',
      tone: 'gentle' as const,
    };
  }

  if (streakDays >= 3) {
    return {
      title: '这段节奏很稳',
      body: '你已经连续学习了几天。今天把任务清掉，我们一起把连胜继续接住。',
      tone: 'encouraging' as const,
    };
  }

  return null;
}

function mapCharacterSummary(
  row: Awaited<ReturnType<typeof ensureUserCharacterProgress>>[number],
): GamificationCharacterSummary {
  const metadata = isJsonObject(row.character.metadata) ? row.character.metadata : null;
  const previewSrc = metadata && typeof metadata.previewSrc === 'string' ? metadata.previewSrc : null;
  const badgeLabel = metadata && typeof metadata.badgeLabel === 'string' ? metadata.badgeLabel : null;
  const accentColor =
    metadata && typeof metadata.accentColor === 'string' ? metadata.accentColor : null;
  const description =
    metadata && typeof metadata.description === 'string' ? metadata.description : null;
  const collectionLabel =
    metadata && typeof metadata.collectionLabel === 'string' ? metadata.collectionLabel : null;

  const nextUnlockHint = !row.isUnlocked
    ? `需要 ${row.character.unlockCostPurchaseCredits} 购买积分 + 亲密度 Lv${row.character.affinityLevelRequired}`
    : null;

  return {
    id: row.characterId,
    name: row.character.name,
    assetType: row.character.assetType,
    unlockCostPurchaseCredits: row.character.unlockCostPurchaseCredits,
    affinityLevelRequired: row.character.affinityLevelRequired,
    isDefault: row.character.isDefault,
    isUnlocked: row.isUnlocked,
    isEquipped: Boolean(row.equippedAt),
    affinityExp: row.affinityExp,
    affinityLevel: row.affinityLevel,
    previewSrc,
    badgeLabel,
    accentColor,
    description,
    collectionLabel,
    nextUnlockHint,
  };
}

export async function getGamificationSummary(
  db: GamificationDbClient,
  userId: string,
): Promise<GamificationSummaryResponse> {
  await ensureCatalogSeeded(db);
  const profile = await normalizeEngagementProfile(db, userId);
  const characterProgress = await ensureUserCharacterProgress(db, userId);
  const equipped =
    characterProgress.find((row) => row.equippedAt != null) ??
    characterProgress.find((row) => row.characterId === DEFAULT_CHARACTER_ID) ??
    characterProgress[0];

  const dailyTasks = await buildMissionSummaryRows(db, userId, 'daily');
  const weeklyTasks = await buildMissionSummaryRows(db, userId, 'weekly');
  const balances = await getUserCreditBalances(db, userId);
  const todayAffinityEarned = equipped
    ? await getTodayAffinityEarnedForCharacter(db, userId, equipped.characterId)
    : 0;

  const claimables = await buildClaimables(db, userId, profile.streakDays, dailyTasks);
  const nudge = await inferNudge(db, userId, profile.streakDays, profile.lastStudyAt);

  return {
    success: true,
    databaseEnabled: true,
    profile: {
      streakDays: profile.streakDays,
      lastStudyAt: profile.lastStudyAt?.toISOString() ?? null,
      todayEarnedPurchaseCredits: profile.todayEarnedPurchaseCredits,
      preferredCharacterId: profile.preferredCharacterId ?? equipped?.characterId ?? DEFAULT_CHARACTER_ID,
      equippedCharacterId: equipped?.characterId ?? DEFAULT_CHARACTER_ID,
      affinityExp: equipped?.affinityExp ?? 0,
      affinityLevel: equipped?.affinityLevel ?? 1,
      nextAffinityLevelExp: nextLevelExp(equipped?.affinityLevel ?? 1),
      todayAffinityEarned,
      todayAffinityCap: DAILY_AFFINITY_EARN_CAP,
    },
    balances: {
      purchase: balances.purchaseCreditsBalance,
      cash: balances.creditsBalance,
      compute: balances.computeCreditsBalance,
    },
    claimables,
    dailyTasks,
    weeklyTasks,
    characters: characterProgress.map(mapCharacterSummary),
    nudge,
  };
}

export async function claimGamificationReward(
  db: GamificationDbClient,
  userId: string,
  kind: GamificationClaimKind,
): Promise<GamificationEventResponse> {
  await ensureCatalogSeeded(db);
  await ensureUserCharacterProgress(db, userId);
  const touched = await touchStudyDay(db, userId);

  if (kind === 'daily_sign_in') {
    const alreadyClaimed = await hasActionLog(db, {
      userId,
      actionType: LearningActionType.DAILY_SIGN_IN,
      since: startOfTodayUtc(),
    });
    if (alreadyClaimed) {
      throw new Error('今天已经签到过了');
    }
    await incrementMissionProgress(
      db,
      userId,
      MissionType.DAILY_SIGN_IN,
      dailyTaskPeriodKey(),
      1,
      1,
    );
    const reward = await grantReward(db, {
      userId,
      purchaseCredits: REWARD_RULES.dailySignIn.purchaseCredits,
      affinity: REWARD_RULES.dailySignIn.affinity,
      kind: CreditTransactionKind.WELCOME_BONUS,
      actionType: LearningActionType.DAILY_SIGN_IN,
      description: 'Daily sign-in reward',
      referenceType: 'gamification_daily_sign_in',
      metadata: {
        streakDays: touched.streakDays,
      },
    });
    return {
      success: true,
      databaseEnabled: true,
      eventType: 'lesson_milestone_completed',
      rewardedPurchaseCredits: reward.grantedPurchaseCredits,
      rewardedAffinity: reward.grantedAffinity,
      newPurchaseBalance: reward.balanceAfter,
      characterId: reward.characterId,
      characterName: reward.characterName,
      affinityLevel: reward.affinityLevel,
    };
  }

  if (kind === 'daily_tasks') {
    const dailyTasks = await buildMissionSummaryRows(db, userId, 'daily');
    if (!dailyTasks.every((task) => task.completed)) {
      throw new Error('今天的任务还没有全部完成');
    }
    const alreadyClaimed = await hasActionLog(db, {
      userId,
      actionType: LearningActionType.DAILY_TASK_REWARD,
      since: startOfTodayUtc(),
    });
    if (alreadyClaimed) {
      throw new Error('今天的任务奖励已经领取过了');
    }

    const reward = await grantReward(db, {
      userId,
      purchaseCredits: REWARD_RULES.dailyAllClear.purchaseCredits,
      affinity: REWARD_RULES.dailyAllClear.affinity,
      kind: CreditTransactionKind.DAILY_TASK_REWARD,
      actionType: LearningActionType.DAILY_TASK_REWARD,
      description: 'Daily all-clear reward',
      referenceType: 'gamification_daily_tasks',
      metadata: {
        completedTasks: dailyTasks.map((task) => task.id),
      },
    });
    await db.userMissionProgress.upsert({
      where: {
        userId_missionType_periodKey: {
          userId,
          missionType: MissionType.DAILY_ALL_CLEAR,
          periodKey: dailyTaskPeriodKey(),
        },
      },
      create: {
        userId,
        missionType: MissionType.DAILY_ALL_CLEAR,
        periodKey: dailyTaskPeriodKey(),
        targetValue: 1,
        progressValue: 1,
        claimedAt: new Date(),
      },
      update: {
        progressValue: 1,
        claimedAt: new Date(),
      },
    });
    return {
      success: true,
      databaseEnabled: true,
      eventType: 'quiz_completed',
      rewardedPurchaseCredits: reward.grantedPurchaseCredits,
      rewardedAffinity: reward.grantedAffinity,
      newPurchaseBalance: reward.balanceAfter,
      characterId: reward.characterId,
      characterName: reward.characterName,
      affinityLevel: reward.affinityLevel,
    };
  }

  const streakMilestone = [14, 7, 3].find((value) => value === touched.streakDays);
  if (!streakMilestone) {
    throw new Error('当前没有可领取的连续学习奖励');
  }
  const alreadyClaimed = await hasActionLog(db, {
    userId,
    actionType: LearningActionType.STREAK_BONUS,
    since: startOfTodayUtc(),
  });
  if (alreadyClaimed) {
    throw new Error('今天的连续学习奖励已经领取过了');
  }
  const reward = await grantReward(db, {
    userId,
    purchaseCredits: REWARD_RULES.streakBonus[streakMilestone] ?? 0,
    affinity: 0,
    kind: CreditTransactionKind.STREAK_BONUS,
    actionType: LearningActionType.STREAK_BONUS,
    description: `Streak bonus for ${streakMilestone} days`,
    referenceType: 'gamification_streak_bonus',
    metadata: {
      milestoneDays: streakMilestone,
      streakDays: touched.streakDays,
    },
  });
  return {
    success: true,
    databaseEnabled: true,
    eventType: 'review_completed',
    rewardedPurchaseCredits: reward.grantedPurchaseCredits,
    rewardedAffinity: reward.grantedAffinity,
    newPurchaseBalance: reward.balanceAfter,
    characterId: reward.characterId,
    characterName: reward.characterName,
    affinityLevel: reward.affinityLevel,
  };
}

export async function recordGamificationEvent(
  db: GamificationDbClient,
  userId: string,
  payload:
    | {
        type: 'lesson_milestone_completed';
        courseId: string;
        courseName?: string;
        progressPercent: number;
        checkpointCount: number;
      }
    | {
        type: 'quiz_completed';
        sceneId: string;
        sceneTitle?: string;
        referenceKey: string;
        questionCount: number;
        correctCount: number;
        accuracyPercent: number;
      }
    | {
        type: 'review_completed';
        sceneId: string;
        sceneTitle?: string;
        referenceKey: string;
        hadPreviousIncorrect: boolean;
      },
): Promise<GamificationEventResponse> {
  await ensureCatalogSeeded(db);
  await ensureUserCharacterProgress(db, userId);
  await touchStudyDay(db, userId);

  if (payload.type === 'lesson_milestone_completed') {
    if (payload.progressPercent < 70 || payload.checkpointCount < 1) {
      throw new Error('课程学习里程碑条件未满足');
    }
    const alreadyRewarded = await hasActionLog(db, {
      userId,
      actionType: LearningActionType.LESSON_MILESTONE_COMPLETED,
      courseId: payload.courseId,
      since: startOfTodayUtc(),
    });
    if (alreadyRewarded) {
      throw new Error('今天这节课的里程碑奖励已经结算过了');
    }
    await incrementMissionProgress(
      db,
      userId,
      MissionType.DAILY_LESSON,
      dailyTaskPeriodKey(),
      1,
      1,
    );
    const reward = await grantReward(db, {
      userId,
      purchaseCredits: REWARD_RULES.lessonMilestone.purchaseCredits,
      affinity: REWARD_RULES.lessonMilestone.affinity,
      kind: CreditTransactionKind.LESSON_REWARD,
      actionType: LearningActionType.LESSON_MILESTONE_COMPLETED,
      description: 'Lesson milestone reward',
      referenceType: 'lesson_reward',
      referenceId: payload.courseId,
      metadata: {
        courseId: payload.courseId,
        courseName: payload.courseName ?? '',
        progressPercent: payload.progressPercent,
        checkpointCount: payload.checkpointCount,
      },
    });
    return {
      success: true,
      databaseEnabled: true,
      eventType: payload.type,
      rewardedPurchaseCredits: reward.grantedPurchaseCredits,
      rewardedAffinity: reward.grantedAffinity,
      newPurchaseBalance: reward.balanceAfter,
      characterId: reward.characterId,
      characterName: reward.characterName,
      affinityLevel: reward.affinityLevel,
    };
  }

  if (payload.type === 'review_completed') {
    if (!payload.hadPreviousIncorrect) {
      throw new Error('没有可回顾的错题记录');
    }
    const alreadyRewarded = await hasActionLog(db, {
      userId,
      actionType: LearningActionType.REVIEW_COMPLETED,
      sceneId: payload.sceneId,
      referenceKey: payload.referenceKey,
    });
    if (alreadyRewarded) {
      throw new Error('这组错题回顾奖励已经领取过了');
    }
    await incrementMissionProgress(
      db,
      userId,
      MissionType.DAILY_REVIEW,
      dailyTaskPeriodKey(),
      1,
      1,
    );
    const reward = await grantReward(db, {
      userId,
      purchaseCredits: REWARD_RULES.reviewCompletion.purchaseCredits,
      affinity: REWARD_RULES.reviewCompletion.affinity,
      kind: CreditTransactionKind.REVIEW_REWARD,
      actionType: LearningActionType.REVIEW_COMPLETED,
      description: 'Review reward',
      referenceType: 'review_reward',
      referenceId: payload.referenceKey,
      metadata: {
        sceneId: payload.sceneId,
        sceneTitle: payload.sceneTitle ?? '',
        referenceKey: payload.referenceKey,
      },
    });
    return {
      success: true,
      databaseEnabled: true,
      eventType: payload.type,
      rewardedPurchaseCredits: reward.grantedPurchaseCredits,
      rewardedAffinity: reward.grantedAffinity,
      newPurchaseBalance: reward.balanceAfter,
      characterId: reward.characterId,
      characterName: reward.characterName,
      affinityLevel: reward.affinityLevel,
      reviewEligible: true,
    };
  }

  const completionExists = await hasActionLog(db, {
    userId,
    actionType: LearningActionType.QUIZ_COMPLETED,
    sceneId: payload.sceneId,
    referenceKey: payload.referenceKey,
  });
  const accuracyExists = await hasActionLog(db, {
    userId,
    actionType: LearningActionType.QUIZ_ACCURACY_BONUS,
    sceneId: payload.sceneId,
    referenceKey: payload.referenceKey,
  });

  let totalPurchase = 0;
  let totalAffinity = 0;
  let lastReward:
    | {
        balanceAfter: number;
        characterId: string;
        characterName: string;
        affinityLevel: number;
      }
    | undefined;

  if (!completionExists) {
    await incrementMissionProgress(
      db,
      userId,
      MissionType.DAILY_QUIZ,
      dailyTaskPeriodKey(),
      1,
      1,
    );
    await incrementMissionProgress(
      db,
      userId,
      MissionType.WEEKLY_QUIZ_BATCHES,
      weeklyTaskPeriodKey(),
      8,
      1,
    );
    const reward = await grantReward(db, {
      userId,
      purchaseCredits: REWARD_RULES.quizCompletion.purchaseCredits,
      affinity: REWARD_RULES.quizCompletion.affinity,
      kind: CreditTransactionKind.QUIZ_COMPLETION_REWARD,
      actionType: LearningActionType.QUIZ_COMPLETED,
      description: 'Quiz completion reward',
      referenceType: 'quiz_completion_reward',
      referenceId: payload.referenceKey,
      metadata: {
        sceneId: payload.sceneId,
        sceneTitle: payload.sceneTitle ?? '',
        referenceKey: payload.referenceKey,
        questionCount: payload.questionCount,
        correctCount: payload.correctCount,
        accuracyPercent: payload.accuracyPercent,
        incorrectCount: Math.max(0, payload.questionCount - payload.correctCount),
      },
    });
    totalPurchase += reward.grantedPurchaseCredits;
    totalAffinity += reward.grantedAffinity;
    lastReward = {
      balanceAfter: reward.balanceAfter,
      characterId: reward.characterId,
      characterName: reward.characterName,
      affinityLevel: reward.affinityLevel,
    };
  }

  const accuracyQualified = payload.accuracyPercent >= 80;
  if (accuracyQualified && !accuracyExists) {
    const reward = await grantReward(db, {
      userId,
      purchaseCredits: REWARD_RULES.quizAccuracyBonus.purchaseCredits,
      affinity: REWARD_RULES.quizAccuracyBonus.affinity,
      kind: CreditTransactionKind.QUIZ_ACCURACY_BONUS,
      actionType: LearningActionType.QUIZ_ACCURACY_BONUS,
      description: 'Quiz accuracy bonus',
      referenceType: 'quiz_accuracy_bonus',
      referenceId: payload.referenceKey,
      metadata: {
        sceneId: payload.sceneId,
        sceneTitle: payload.sceneTitle ?? '',
        referenceKey: payload.referenceKey,
        questionCount: payload.questionCount,
        correctCount: payload.correctCount,
        accuracyPercent: payload.accuracyPercent,
      },
    });
    totalPurchase += reward.grantedPurchaseCredits;
    totalAffinity += reward.grantedAffinity;
    lastReward = {
      balanceAfter: reward.balanceAfter,
      characterId: reward.characterId,
      characterName: reward.characterName,
      affinityLevel: reward.affinityLevel,
    };
  }

  if (!lastReward) {
    const balances = await getUserCreditBalances(db, userId);
    const preferred = await normalizeEngagementProfile(db, userId);
    const progress = await db.userCharacterProgress.findUnique({
      where: {
        userId_characterId: {
          userId,
          characterId: preferred.preferredCharacterId ?? DEFAULT_CHARACTER_ID,
        },
      },
      include: { character: true },
    });
    return {
      success: true,
      databaseEnabled: true,
      eventType: payload.type,
      rewardedPurchaseCredits: 0,
      rewardedAffinity: 0,
      newPurchaseBalance: balances.purchaseCreditsBalance,
      characterId: progress?.characterId ?? DEFAULT_CHARACTER_ID,
      characterName: progress?.character.name ?? 'Haru',
      affinityLevel: progress?.affinityLevel ?? 1,
      accuracyBonusApplied: false,
    };
  }

  return {
    success: true,
    databaseEnabled: true,
    eventType: payload.type,
    rewardedPurchaseCredits: totalPurchase,
    rewardedAffinity: totalAffinity,
    newPurchaseBalance: lastReward.balanceAfter,
    characterId: lastReward.characterId,
    characterName: lastReward.characterName,
    affinityLevel: lastReward.affinityLevel,
    accuracyBonusApplied: accuracyQualified && !accuracyExists,
  };
}

export async function unlockGamificationCharacter(
  db: GamificationDbClient,
  userId: string,
  characterId: string,
): Promise<GamificationSummaryResponse> {
  await ensureCatalogSeeded(db);
  await ensureUserCharacterProgress(db, userId);
  const catalog = await db.characterCatalog.findUnique({
    where: { id: characterId },
  });
  if (!catalog) {
    throw new Error('角色不存在');
  }
  const progress = await db.userCharacterProgress.findUnique({
    where: {
      userId_characterId: {
        userId,
        characterId,
      },
    },
  });
  if (!progress) {
    throw new Error('角色进度不存在');
  }
  if (progress.isUnlocked) {
    return getGamificationSummary(db, userId);
  }

  const preferredCharacterId =
    (await normalizeEngagementProfile(db, userId)).preferredCharacterId ?? DEFAULT_CHARACTER_ID;
  const preferredProgress = await db.userCharacterProgress.findUnique({
    where: {
      userId_characterId: {
        userId,
        characterId: preferredCharacterId,
      },
    },
  });
  if ((preferredProgress?.affinityLevel ?? 1) < catalog.affinityLevelRequired) {
    throw new Error(`亲密度等级不足，当前需要 Lv${catalog.affinityLevelRequired}`);
  }
  const balances = await getUserCreditBalances(db, userId);
  if (balances.purchaseCreditsBalance < catalog.unlockCostPurchaseCredits) {
    throw new Error('购买积分不足，先去完成几组题吧');
  }

  if (catalog.unlockCostPurchaseCredits > 0) {
    await applyCreditDelta(db, {
      userId,
      delta: -catalog.unlockCostPurchaseCredits,
      kind:
        catalog.assetType === CharacterAssetType.LIVE2D
          ? CreditTransactionKind.CHARACTER_UNLOCK_SPEND
          : CreditTransactionKind.AVATAR_UNLOCK_SPEND,
      accountType: 'PURCHASE',
      description:
        catalog.assetType === CharacterAssetType.LIVE2D
          ? `Unlock companion ${catalog.name}`
          : `Unlock avatar pack ${catalog.name}`,
      referenceType: 'gamification_unlock',
      referenceId: catalog.id,
      metadata: {
        characterId: catalog.id,
        assetType: catalog.assetType,
      },
    });
  }

  await db.userCharacterProgress.update({
    where: {
      userId_characterId: {
        userId,
        characterId,
      },
    },
    data: {
      isUnlocked: true,
    },
  });

  await db.learningActionLog.create({
    data: {
      userId,
      actionType:
        catalog.assetType === CharacterAssetType.LIVE2D
          ? LearningActionType.CHARACTER_UNLOCK
          : LearningActionType.AVATAR_UNLOCK,
      rewardedPurchaseCredits: 0,
      rewardedAffinity: 0,
      metadata: {
        characterId: catalog.id,
        assetType: catalog.assetType,
        cost: catalog.unlockCostPurchaseCredits,
      },
    },
  });

  return getGamificationSummary(db, userId);
}

export async function equipGamificationCharacter(
  db: GamificationDbClient,
  userId: string,
  characterId: string,
): Promise<GamificationSummaryResponse> {
  await ensureCatalogSeeded(db);
  await ensureUserCharacterProgress(db, userId);
  const target = await db.userCharacterProgress.findUnique({
    where: {
      userId_characterId: {
        userId,
        characterId,
      },
    },
    include: {
      character: true,
    },
  });
  if (!target?.isUnlocked) {
    throw new Error('角色还没有解锁');
  }
  if (target.character.assetType !== CharacterAssetType.LIVE2D) {
    throw new Error('当前只支持装备 Live2D 角色');
  }

  await db.userCharacterProgress.updateMany({
    where: {
      userId,
      character: {
        assetType: CharacterAssetType.LIVE2D,
      },
    },
    data: {
      equippedAt: null,
    },
  });
  await db.userCharacterProgress.update({
    where: {
      userId_characterId: {
        userId,
        characterId,
      },
    },
    data: {
      equippedAt: new Date(),
    },
  });
  await db.userEngagementProfile.update({
    where: { userId },
    data: {
      preferredCharacterId: characterId,
    },
  });
  await db.learningActionLog.create({
    data: {
      userId,
      actionType: LearningActionType.CHARACTER_EQUIP,
      rewardedPurchaseCredits: 0,
      rewardedAffinity: 0,
      metadata: {
        characterId,
      },
    },
  });

  return getGamificationSummary(db, userId);
}

export function buildGamificationDisabledSummary(): GamificationSummaryResponse {
  return {
    success: true,
    databaseEnabled: false,
    profile: {
      streakDays: 0,
      lastStudyAt: null,
      todayEarnedPurchaseCredits: 0,
      preferredCharacterId: DEFAULT_CHARACTER_ID,
      equippedCharacterId: DEFAULT_CHARACTER_ID,
      affinityExp: 0,
      affinityLevel: 1,
      nextAffinityLevelExp: nextLevelExp(1),
      todayAffinityEarned: 0,
      todayAffinityCap: DAILY_AFFINITY_EARN_CAP,
    },
    balances: {
      purchase: 0,
      cash: 0,
      compute: 0,
    },
    claimables: {
      dailySignIn: false,
      dailyTasks: false,
      streakBonusDays: null,
    },
    dailyTasks: DAILY_TASK_DEFINITIONS.map((task) => ({
      id: task.id,
      label: task.label,
      period: 'daily',
      targetValue: task.targetValue,
      progressValue: 0,
      completed: false,
      claimed: false,
      rewardPurchaseCredits: task.rewardPurchaseCredits,
    })),
    weeklyTasks: WEEKLY_TASK_DEFINITIONS.map((task) => ({
      id: task.id,
      label: task.label,
      period: 'weekly',
      targetValue: task.targetValue,
      progressValue: 0,
      completed: false,
      claimed: false,
      rewardPurchaseCredits: task.rewardPurchaseCredits,
    })),
    characters: DEFAULT_CATALOG.map((item) => ({
      id: item.id,
      name: item.name,
      assetType: item.assetType,
      unlockCostPurchaseCredits: item.unlockCostPurchaseCredits,
      affinityLevelRequired: item.affinityLevelRequired,
      isDefault: item.isDefault,
      isUnlocked: item.isDefault,
      isEquipped: item.id === DEFAULT_CHARACTER_ID,
      affinityExp: 0,
      affinityLevel: 1,
      previewSrc: String(item.metadata.previewSrc ?? ''),
      badgeLabel: String(item.metadata.badgeLabel ?? ''),
      accentColor: String(item.metadata.accentColor ?? ''),
      description: String(item.metadata.description ?? ''),
      collectionLabel: String(item.metadata.collectionLabel ?? ''),
      nextUnlockHint: item.isDefault
        ? null
        : `需要 ${item.unlockCostPurchaseCredits} 购买积分 + 亲密度 Lv${item.affinityLevelRequired}`,
    })),
    nudge: {
      title: '登录并启用同步后，陪伴系统就会开始记录',
      body: '数据库启用后才能保存连续学习、亲密度、任务进度和角色解锁状态。',
      tone: 'gentle',
    },
  };
}

export function buildGamificationDisabledEvent(
  eventType: GamificationEventType,
): GamificationEventResponse {
  return {
    success: true,
    databaseEnabled: false,
    eventType,
    rewardedPurchaseCredits: 0,
    rewardedAffinity: 0,
    newPurchaseBalance: 0,
    characterId: DEFAULT_CHARACTER_ID,
    characterName: 'Haru',
    affinityLevel: 1,
  };
}

export function logGamificationError(context: string, error: unknown) {
  log.warn(`${context}:`, error);
}
