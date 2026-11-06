import { z } from 'zod';

export const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });

export const magicLinkBody = z.object({ email: z.string().email().max(200), tenant: z.string().max(60).optional() });
export const clickLoginBody = z.object({ userId: uuid, tenant: z.string().max(60).optional() });
export const verifyBody = z.object({ token: z.string().min(10).max(200) });
export const refreshBody = z.object({ refreshToken: z.string().min(10).max(300) });

export const giveRecognitionBody = z.object({
  receiverId: uuid,
  chipId: uuid.optional().nullable(),
  message: z.string().trim().max(500).optional().nullable(),
});
export const messageBody = z.object({ message: z.string().trim().max(500) });
export const feedQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.string().datetime().optional(), cycleId: uuid.optional(), all: z.coerce.boolean().optional() });

export const createMissionBody = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  points: z.number().int().min(1).max(1000),
  recurrence: z.enum(['once', 'weekly', 'monthly']),
  scope: z.enum(['all', 'area']).default('all'),
  areaId: uuid.optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  templateId: uuid.optional().nullable(),
});
export const reviewBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional().nullable() });

export const closeCycleBody = z.object({ teamRewardNote: z.string().trim().max(500).optional().nullable() });
export const rewardNoteBody = z.object({ note: z.string().trim().max(500).nullable() });
export const teamRewardBody = z.object({ note: z.string().trim().max(500).nullable() });

export const createUserBody = z.object({
  email: z.string().email().max(200),
  name: z.string().trim().min(2).max(100),
  role: z.enum(['member', 'manager', 'admin']).default('member'),
  areaId: uuid.optional().nullable(),
  avatarUrl: z.string().url().max(500).optional().nullable(),
});
export const updateUserBody = createUserBody.partial().extend({ isActive: z.boolean().optional() });

export const areaBody = z.object({ name: z.string().trim().min(2).max(60) });

export const chipBody = z.object({
  label: z.string().trim().min(2).max(60),
  emoji: z.string().trim().max(8).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  validFrom: z.coerce.date().optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
});
export const updateChipBody = chipBody.partial();

export const settingsBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  logoUrl: z.string().url().max(500).or(z.string().regex(/^\/[^\s]*$/)).optional().nullable(),
  logoDarkUrl: z.string().url().max(500).or(z.string().regex(/^\/[^\s]*$/)).optional().nullable(),
  symbolUrl: z.string().url().max(500).or(z.string().regex(/^\/[^\s]*$/)).optional().nullable(),
  theme: z.enum(['light', 'dark', 'duo']).optional(),
  authMode: z.enum(['magic_link', 'click']).optional(),
  fontDisplay: z.enum(['default', 'big-shoulders']).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  timezone: z.string().max(60).optional(),
  coinsPerCycle: z.number().int().min(0).max(10000).optional(),
  recognitionCost: z.number().int().min(1).max(10000).optional(),
  maxPerReceiverPerCycle: z.number().int().min(0).max(1000).optional(),
  goalParticipationPct: z.number().int().min(1).max(100).optional(),
  goalMinRecognitions: z.number().int().min(0).max(100).optional(),
  goalMinMissions: z.number().int().min(0).max(100).optional(),
});

export const pushSubscribeBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
});
export const pushUnsubscribeBody = z.object({ endpoint: z.string().url().max(1000) });
export const markReadBody = z.object({ ids: z.union([z.literal('all'), z.array(uuid).min(1).max(100)]) });
export const inactiveQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(7) });
export const rewardBody = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).optional().nullable(),
  kind: z.enum(['individual', 'team', 'wheel']),
  weight: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const updateRewardBody = rewardBody.partial();
export const deliveredBody = z.object({ delivered: z.boolean() });
export const templateBody = z.object({
  title: z.string().trim().min(3).max(120), description: z.string().trim().max(500).optional().nullable(),
  points: z.number().int().min(1).max(1000), recurrence: z.enum(['once', 'weekly', 'monthly']),
});
