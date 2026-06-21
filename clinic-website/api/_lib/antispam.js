// Shared anti-spam helpers for the public form endpoints (contact + refer).
// Filename is underscore-prefixed so Vercel never exposes it as its own route;
// it's bundled into each function via require().

// Hosts allowed to POST to the form endpoints. Production domains + Vercel
// preview deployments (*.vercel.app). Anything else is treated as a forged
// cross-origin submission (the classic "curl the endpoint directly" bot).
const ALLOWED_HOSTS = ['moveifyhealth.com', 'www.moveifyhealth.com'];

function hostFromUrl(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return '';
  }
}

// Real browsers send an Origin header on same-origin POST/fetch; we fall back
// to Referer. A request with neither (or a mismatched one) is rejected.
function originAllowed(req) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || req.headers.referrer || '';
  const host = hostFromUrl(origin) || hostFromUrl(referer);
  if (!host) return false;
  return ALLOWED_HOSTS.includes(host) || host.endsWith('.vercel.app');
}

// Cloudflare Turnstile server-side verification.
// Returns { ok, skipped }. If TURNSTILE_SECRET_KEY is unset we *skip* (ok:true)
// so the form keeps working before the key is configured — the honeypot,
// timing, and origin layers still apply. Once the secret is set, a missing or
// invalid token fails closed.
async function verifyTurnstile(token, remoteip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping CAPTCHA verification');
    return { ok: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { ok: false, skipped: false };
  }
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip) body.append('remoteip', remoteip);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await resp.json();
    return { ok: data.success === true, skipped: false };
  } catch (err) {
    // Don't hard-fail legit users on a Cloudflare outage — log and let the
    // other layers (honeypot/timing/origin) carry it.
    console.error('Turnstile verify error:', err.message);
    return { ok: true, skipped: true };
  }
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
}

module.exports = { originAllowed, verifyTurnstile, clientIp };
