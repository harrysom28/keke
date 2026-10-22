import AsyncStorage from "@react-native-async-storage/async-storage";

export const INVITE_CONFIG_TTL_MS = 24 * 60 * 60 * 1000;

export type InviteCache = {
  referral_code?: string | null;
  referral_url?: string | null;
  reward_type?: string;
  reward_amount?: number;
  successful_invites_required?: number;
  description?: string;
  updated_at?: string | null;
  cachedAt?: number;
};

const memory = new Map<string, InviteCache>();

export function inviteCacheKey(userId: string) {
  return `invite:${userId}`;
}

export function peekInviteCache(userId: string | null | undefined): InviteCache | null {
  if (!userId) return null;
  return memory.get(String(userId)) ?? null;
}

export function isInviteConfigStale(cache: InviteCache | null | undefined) {
  if (!cache?.cachedAt) return true;
  return Date.now() - cache.cachedAt >= INVITE_CONFIG_TTL_MS;
}

export function inviteConfigFromCache(cache: InviteCache | null | undefined) {
  if (!cache) return null;
  const hasConfig =
    cache.reward_type != null ||
    cache.reward_amount != null ||
    cache.successful_invites_required != null ||
    (typeof cache.description === "string" && cache.description.length > 0);
  if (!hasConfig) return null;
  return {
    reward_type: cache.reward_type,
    reward_amount: cache.reward_amount,
    successful_invites_required: cache.successful_invites_required,
    description: cache.description,
  };
}

async function readDisk(userId: string): Promise<InviteCache | null> {
  try {
    const raw = await AsyncStorage.getItem(inviteCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InviteCache;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadInviteCache(userId: string | null | undefined): Promise<InviteCache | null> {
  if (!userId) return null;
  const id = String(userId);
  const hit = memory.get(id);
  if (hit) return hit;
  const disk = await readDisk(id);
  if (disk) memory.set(id, disk);
  return disk;
}

function combine(prev: InviteCache, patch: Partial<InviteCache>, touchConfig: boolean): InviteCache {
  const next: InviteCache = { ...prev };
  (Object.keys(patch) as (keyof InviteCache)[]).forEach((key) => {
    const value = patch[key];
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  });
  if (touchConfig) next.cachedAt = Date.now();
  return next;
}

export async function mergeInviteCache(
  userId: string,
  patch: Partial<InviteCache>,
  opts?: { touchConfig?: boolean }
) {
  const id = String(userId);
  const hadMemory = memory.has(id);
  const optimistic = combine(memory.get(id) || {}, patch, !!opts?.touchConfig);
  memory.set(id, optimistic);

  try {
    let next = optimistic;
    if (!hadMemory) {
      const disk = await readDisk(id);
      if (disk) {
        next = combine(combine(disk, optimistic, false), patch, !!opts?.touchConfig);
        if (opts?.touchConfig) next.cachedAt = optimistic.cachedAt;
        memory.set(id, next);
      }
    }
    await AsyncStorage.setItem(inviteCacheKey(id), JSON.stringify(next));
    return next;
  } catch {
    return memory.get(id) || optimistic;
  }
}

type AuthBody = {
  data?: {
    user?: Record<string, unknown> | null;
  };
};

/** Persist a code (and prize, when the auth payload includes one) as soon as the user signs in. */
export async function rememberInviteFromAuth(body: AuthBody | null | undefined) {
  try {
    const user = body?.data?.user;
    if (!user) return;
    const userId = user.user_id || user._id;
    const code = typeof user.referral_code === "string" ? user.referral_code.trim() : "";
    if (!userId || !code) return;

    const patch: Partial<InviteCache> = { referral_code: code };
    if (typeof user.referral_url === "string" && user.referral_url.trim()) {
      patch.referral_url = user.referral_url.trim();
    }

    const hasReward =
      user.reward_type != null ||
      user.reward_amount != null ||
      user.successful_invites_required != null ||
      typeof user.description === "string";
    if (hasReward) {
      if (typeof user.reward_type === "string") patch.reward_type = user.reward_type;
      if (typeof user.reward_amount === "number") patch.reward_amount = user.reward_amount;
      if (typeof user.successful_invites_required === "number") {
        patch.successful_invites_required = user.successful_invites_required;
      }
      if (typeof user.description === "string") patch.description = user.description;
      if (user.updated_at != null) patch.updated_at = String(user.updated_at);
    }

    await mergeInviteCache(String(userId), patch, { touchConfig: hasReward });
  } catch {
    // Invite cache is best-effort. Signing in must still succeed.
  }
}
