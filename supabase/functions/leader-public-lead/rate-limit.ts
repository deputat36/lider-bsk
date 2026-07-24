export type PublicIntakeRateLimitResult = {
  ok: boolean
  allowed: boolean
  reason: string
  retryAfterSeconds: number
  idempotentReplay: boolean
}

type RateLimitParams = {
  supabaseUrl: string
  backendHeaders: Record<string, string>
  requestId: string
  ipHash: string
  phoneHash: string | null
  windowSeconds: number
  ipLimit: number
  phoneLimit: number
}

function clean(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function clientIp(req: Request) {
  const forwarded = clean(req.headers.get('x-forwarded-for'), 500)
  if (forwarded) return forwarded.split(',')[0].trim()
  return clean(req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip'), 200) || 'unknown'
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

export async function publicIntakeRateLimitIdentity(req: Request, phoneNormalized: string, salt: string) {
  const normalizedSalt = clean(salt, 500)
  if (normalizedSalt.length < 16) throw new Error('rate_limit_salt_invalid')
  const ipHash = await sha256Hex(`ip:${normalizedSalt}:${clientIp(req)}`)
  const phoneHash = phoneNormalized
    ? await sha256Hex(`phone:${normalizedSalt}:${clean(phoneNormalized, 40)}`)
    : null
  return { ipHash, phoneHash }
}

export async function checkPublicIntakeRateLimit(params: RateLimitParams): Promise<PublicIntakeRateLimitResult> {
  try {
    const response = await fetch(`${params.supabaseUrl}/rest/v1/rpc/leader_public_intake_rate_limit_rpc`, {
      method: 'POST',
      headers: {
        ...params.backendHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_request_id: params.requestId,
        p_ip_hash: params.ipHash,
        p_phone_hash: params.phoneHash,
        p_window_seconds: params.windowSeconds,
        p_ip_limit: params.ipLimit,
        p_phone_limit: params.phoneLimit,
      }),
    })

    if (!response.ok) {
      return { ok: false, allowed: false, reason: 'rate_limit_unavailable', retryAfterSeconds: 0, idempotentReplay: false }
    }

    const data = await response.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      return { ok: false, allowed: false, reason: 'rate_limit_invalid_response', retryAfterSeconds: 0, idempotentReplay: false }
    }

    return {
      ok: true,
      allowed: data.allowed === true,
      reason: clean(data.reason, 120) || (data.allowed === true ? 'allowed' : 'rate_limited'),
      retryAfterSeconds: Math.max(0, Number(data.retry_after_seconds || 0) || 0),
      idempotentReplay: data.idempotent_replay === true,
    }
  } catch (_) {
    return { ok: false, allowed: false, reason: 'rate_limit_unavailable', retryAfterSeconds: 0, idempotentReplay: false }
  }
}
