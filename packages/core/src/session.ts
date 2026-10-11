// Staff session cookie, shared by apps/web (sets and reads it) and apps/staff (checks it in proxy.ts).
// Token: `<staffId>.<expUnixSeconds>.<base64url HMAC-SHA256 of "<staffId>.<exp>">`.
// Web Crypto only (no Node imports), so it runs in route handlers and in Next's proxy alike.

export const SESSION_COOKIE = 'bell_staff'
export const SESSION_TTL_HOURS = 12

type Env = Record<string, string | undefined>

const DEV_SECRET = 'bell-dev-staff-session-secret'
const DEV_PASSWORD = 'bell'

const read = (env: Env, name: string): string | undefined => env[name]?.trim() || undefined

/** HMAC key for session tokens. Set STAFF_SESSION_SECRET (same value for apps/web and apps/staff) outside local dev. */
export const sessionSecret = (env: Env = process.env): string =>
  read(env, 'STAFF_SESSION_SECRET') ?? DEV_SECRET

/** The one demo password every staff member signs in with. */
export const demoPassword = (env: Env = process.env): string =>
  read(env, 'STAFF_DEMO_PASSWORD') ?? DEV_PASSWORD

// Inferred so core compiles without the DOM lib.
type HmacKey = ReturnType<typeof crypto.subtle.importKey>

const encoder = new TextEncoder()
const keys = new Map<string, HmacKey>()

const hmacKey = (secret: string): HmacKey => {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    keys.set(secret, key)
  }
  return key
}

const base64url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const sign = async (payload: string, secret: string): Promise<string> => {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload))
  return base64url(new Uint8Array(signature))
}

/** Compares two strings without stopping at the first difference. */
const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

export const createSessionToken = async (
  staffId: string,
  secret: string,
  ttlHours = SESSION_TTL_HOURS,
): Promise<string> => {
  if (!staffId || staffId.includes('.')) throw new Error('Invalid staff id for a session')
  const payload = `${staffId}.${nowSeconds() + Math.round(ttlHours * 3600)}`
  return `${payload}.${await sign(payload, secret)}`
}

/** The session in a token, or null when the token is malformed, tampered with or expired. */
export const readSessionToken = async (
  token: string,
  secret: string,
): Promise<{ staffId: string; exp: number } | null> => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [staffId, expText, signature] = parts as [string, string, string]
  if (!staffId || !/^\d{1,12}$/.test(expText) || !signature) return null
  const expected = await sign(`${staffId}.${expText}`, secret)
  if (!sameText(signature, expected)) return null
  const exp = Number(expText)
  return exp > nowSeconds() ? { staffId, exp } : null
}
