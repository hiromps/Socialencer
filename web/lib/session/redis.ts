import { SessionProfile, WebSession } from '@/lib/instagram/types';

// ── Types ──────────────────────────────────────────────────────────

export interface LoginJob {
  status: 'pending' | 'running' | 'completed' | 'failed';
  step: 'prelogin' | 'login' | '2fa_required' | 'postlogin' | 'profile' | 'done';
  twoFactorInfo?: {
    twoFactorIdentifier: string;
    verificationMethod: string;
    username: string;
  };
  result?: {
    profile: SessionProfile;
    sessionId: string;
    message: string;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RedisSessionData {
  profile: SessionProfile;
  igState: Record<string, unknown>;
  web?: WebSession;
  createdAt: number;
  lastAccessedAt: number;
}

export interface FlowState {
  igState: Record<string, unknown>;
  username: string;
  password: string;
  userId: string;
  step: string;
  createdAt: number;
}

// ── Session CRUD ───────────────────────────────────────────────────

import { Redis } from '@upstash/redis';

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  return new Redis({ url, token });
}

const SESSION_PREFIX = 'session:';
const FLOW_PREFIX = 'flow:';
const DEFAULT_TTL = Number(process.env.SESSION_TTL_SECONDS || 86400);
const FLOW_TTL = 600; // 10 minutes for login flow state

/**
 * `@upstash/redis` auto-parses JSON values, so `redis.get()` may return
 * an already-parsed object OR a raw string.  This helper normalizes both.
 */
function parseMaybeJson(raw: unknown): any {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') return JSON.parse(raw);
  return null;
}

export async function saveSession(sessionId: string, data: RedisSessionData): Promise<void> {
  const redis = getRedis();
  await redis.set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(data), { ex: DEFAULT_TTL });
}

export async function getSession(sessionId: string): Promise<RedisSessionData | null> {
  const redis = getRedis();
  const raw = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;
  await redis.expire(`${SESSION_PREFIX}${sessionId}`, DEFAULT_TTL);
  return parseMaybeJson(raw) as RedisSessionData | null;
}

export async function updateSessionIgState(
  sessionId: string,
  igState: Record<string, unknown>,
): Promise<void> {
  const redis = getRedis();
  const raw = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return;
  const data = parseMaybeJson(raw) as RedisSessionData | null;
  if (!data) return;
  data.igState = igState;
  data.lastAccessedAt = Date.now();
  await redis.set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(data), { ex: DEFAULT_TTL });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
}

// ── Flow State (for multi-step login) ──────────────────────────────

export async function saveFlowState(flowToken: string, state: FlowState): Promise<void> {
  const redis = getRedis();
  await redis.set(`${FLOW_PREFIX}${flowToken}`, JSON.stringify(state), { ex: FLOW_TTL });
}

export async function getFlowState(flowToken: string): Promise<FlowState | null> {
  const redis = getRedis();
  const raw = await redis.get(`${FLOW_PREFIX}${flowToken}`);
  if (!raw) return null;
  return parseMaybeJson(raw) as FlowState | null;
}

export async function deleteFlowState(flowToken: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${FLOW_PREFIX}${flowToken}`);
}
