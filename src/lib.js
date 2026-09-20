import crypto from 'node:crypto';

/* ------------------------------------------------------------------ *
 * Identity: a signed, httpOnly voter cookie.
 * Not bulletproof — nothing cookie-based is — but it stops the casual
 * refresh-and-vote-again, and it can't be forged without SESSION_SECRET.
 * ------------------------------------------------------------------ */

const SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret';

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url').slice(0, 24);

export function readVoter(req) {
  const raw = req.cookies?.voter;
  if (!raw) return null;
  const [id, sig] = raw.split('.');
  if (!id || !sig || sign(id) !== sig) return null;
  return id;
}

export function issueVoter(res) {
  const id = crypto.randomUUID();
  res.cookie('voter', `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return id;
}

export function voterOf(req, res) {
  return readVoter(req) || issueVoter(res);
}

/* ------------------------------------------------------------------ *
 * Rate limiting: in-memory token buckets, keyed by IP.
 * Single-instance only. If you ever scale past one dyno, move this to
 * the database or Redis — until then this is the right amount of code.
 * ------------------------------------------------------------------ */

const buckets = new Map();

export function rateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count };
}

// Keep the map from growing without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 60_000).unref?.();

export const clientIp = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

export function slugify(text) {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${base || 'proposal'}-${crypto.randomBytes(3).toString('hex')}`;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

// Black mark needs a floor. Without one, a brand-new post with two
// downvotes gets marked and dies before anyone sees it.
export const BLACK_MARK_MIN_VOTES = 10;
export const BLACK_MARK_RATIO = 0.35;

export function isBlackMarked({ ups, downs }) {
  const total = ups + downs;
  if (total < BLACK_MARK_MIN_VOTES) return false;
  return downs / total > BLACK_MARK_RATIO;
}

// Reddit-style hot ranking: recency decays, magnitude is logarithmic.
export function hotScore({ ups, downs, created_at }) {
  const net = ups - downs;
  const order = Math.log10(Math.max(Math.abs(net), 1));
  const sign = net > 0 ? 1 : net < 0 ? -1 : 0;
  const seconds = new Date(created_at).getTime() / 1000 - 1700000000;
  return Number((sign * order + seconds / 45000).toFixed(7));
}

// How many independent people must flag a proposal before it's declared
// overtaken by reality. Low enough to happen, high enough to mean something.
export const REALITY_THRESHOLD = 3;

/* ------------------------------------------------------------------ *
 * Content screening
 *
 * This is a tripwire, not a censor: a hit routes the submission into the
 * moderation queue instead of rejecting it, so a human decides. Slurs and
 * violent-threat patterns are the only things it looks for — political
 * opinion, profanity and bad jokes are not its business.
 * ------------------------------------------------------------------ */

const TRIPWIRES = [
  /\bk[i1]ll\s+(all|every)\b/i,
  /\b(gas|lynch|hang|shoot|behead)\s+(the|all|every)\b/i,
  /\bdeath\s+to\s+\w+/i,
  /\b\d{3}-\d{2}-\d{4}\b/, // anything shaped like an SSN
  /\b(?:\d[ -]*?){13,16}\b/, // anything shaped like a card number
];

export function needsReview(text) {
  return TRIPWIRES.some((re) => re.test(text));
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

export const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

export function safeSourceUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
