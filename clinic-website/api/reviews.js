// Public endpoint: returns the latest Google reviews for Moveify Health Solutions.
// Uses the Google Places API (New). Caches in-memory for 6 hours to stay well
// within the free tier and keep responses fast on warm invocations.
//
// Env vars (configure in Vercel → Project → Settings → Environment Variables):
//   GOOGLE_PLACES_API_KEY  (required) — Places API (New) key, referrer-restricted
//                                        to www.moveifyhealth.com
//   GOOGLE_PLACE_ID        (optional) — if unset, looked up via Text Search
//   GOOGLE_BUSINESS_NAME   (optional) — defaults to "Moveify Health Solutions"
//   GOOGLE_BUSINESS_ADDRESS(optional) — defaults to "4 George St, Williamstown SA 5351, Australia"

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000; // 1 minute
const ipHits = {};

const DEFAULT_BUSINESS_NAME = 'Moveify Health Solutions';
const DEFAULT_BUSINESS_ADDRESS = '4 George St, Williamstown SA 5351, Australia';

let cache = null; // { data, expiresAt }

function rateLimit(ip) {
  const now = Date.now();
  if (!ipHits[ip]) ipHits[ip] = [];
  ipHits[ip] = ipHits[ip].filter((t) => now - t < RATE_WINDOW);
  if (ipHits[ip].length >= RATE_LIMIT) return false;
  ipHits[ip].push(now);
  return true;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
}

// Look up the Place ID via Text Search (New). First match wins.
async function findPlaceId(apiKey, name, address) {
  const textQuery = `${name}, ${address}`;
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName',
    },
    body: JSON.stringify({ textQuery, languageCode: 'en-AU', regionCode: 'AU' }),
  });
  if (!resp.ok) {
    throw new Error(`Text Search failed (${resp.status})`);
  }
  const data = await resp.json();
  const place = (data.places || [])[0];
  if (!place) throw new Error('No place found for query');
  return place.id;
}

// Fetch reviews for a known Place ID via Place Details (New).
async function fetchReviews(apiKey, placeId) {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const resp = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews,googleMapsUri',
    },
  });
  if (!resp.ok) {
    throw new Error(`Place Details failed (${resp.status})`);
  }
  const data = await resp.json();
  return {
    businessName: data.displayName?.text || '',
    businessUrl: data.googleMapsUri || '',
    rating: typeof data.rating === 'number' ? data.rating : null,
    reviewCount: typeof data.userRatingCount === 'number' ? data.userRatingCount : 0,
    reviews: (data.reviews || []).map((r) => ({
      author: r.authorAttribution?.displayName || 'Anonymous',
      authorPhoto: r.authorAttribution?.photoUri || null,
      rating: r.rating || 0,
      relativeTime: r.relativePublishTimeDescription || '',
      publishedAt: r.publishTime || null,
      text: r.originalText?.text || r.text?.text || '',
    })),
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(clientIp(req))) {
    return res.status(429).json({ error: 'Too many requests.' });
  }

  // Serve from cache if fresh.
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(cache.data);
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Reviews are not configured.' });
  }

  try {
    const businessName = process.env.GOOGLE_BUSINESS_NAME || DEFAULT_BUSINESS_NAME;
    const businessAddress = process.env.GOOGLE_BUSINESS_ADDRESS || DEFAULT_BUSINESS_ADDRESS;
    const placeId = process.env.GOOGLE_PLACE_ID || (await findPlaceId(apiKey, businessName, businessAddress));
    const data = await fetchReviews(apiKey, placeId);

    cache = { data, expiresAt: now + CACHE_TTL_MS };

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(data);
  } catch (err) {
    // Never log review content or credentials — message only.
    console.error('Reviews fetch failed:', err.message);
    // Serve stale cache if available, otherwise fail soft so the page renders
    // a graceful "no reviews" state instead of a broken section.
    if (cache) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json(cache.data);
    }
    return res.status(200).json({
      businessName: '',
      businessUrl: '',
      rating: null,
      reviewCount: 0,
      reviews: [],
    });
  }
};
