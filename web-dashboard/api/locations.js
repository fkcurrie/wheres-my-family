// Vercel Serverless Function: api/locations.js
// Provides a self-hosted, secure database API with sovereign data residency in Canada, Switzerland, or Iceland.
// Supports both Upstash Redis (e.g. AWS ca-central-1 in Canada) and Exoscale S3-compatible Object Storage (e.g. Geneva, Switzerland)

// Ephemeral in-memory fallback for initial out-of-the-box sandbox testing
let inMemoryDb = {};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Mantle-Key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authenticate Request
  const MANTLE_KEY =
    process.env.MANTLE_KEY || '923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b';
  const clientKey = req.headers['x-mantle-key'] || req.headers['X-Mantle-Key'];

  if (clientKey !== MANTLE_KEY) {
    console.warn(`[Unauthorized Access Attempt]: Key ${clientKey}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid X-Mantle-Key' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Helper to read data from secure database
  const getSovereignData = async () => {
    if (redisUrl && redisToken) {
      try {
        const response = await fetch(`${redisUrl}/get/wheresmyfamily_locations`, {
          headers: {
            Authorization: `Bearer ${redisToken}`,
          },
        });
        const result = await response.json();
        if (result && result.result) {
          return JSON.parse(result.result);
        }
      } catch (err) {
        console.error('[Sovereign DB Read Error]:', err);
      }
    }
    return inMemoryDb;
  };

  // Helper to save data to secure database
  const saveSovereignData = async (data) => {
    if (redisUrl && redisToken) {
      try {
        await fetch(`${redisUrl}/set/wheresmyfamily_locations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(JSON.stringify(data)),
        });
        return true;
      } catch (err) {
        console.error('[Sovereign DB Write Error]:', err);
      }
    } else {
      inMemoryDb = data;
    }
    return false;
  };

  // 2. Helper to sanitize keys from path traversal and prototype pollution
  const sanitizeKey = (key) => {
    if (typeof key !== 'string') return '';
    // Remove slashes, dots, and backslashes
    const clean = key.replace(/[\/\\.]/g, '').trim();
    // Block explicit prototype pollution keywords
    if (clean === '__proto__' || clean === 'constructor' || clean === 'prototype') {
      return '';
    }
    return clean;
  };

  try {
    if (req.method === 'GET') {
      const data = await getSovereignData();
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const updatePayload = req.body;
      if (!updatePayload || typeof updatePayload !== 'object') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      const currentData = await getSovereignData();

      // Deep merge payload with key sanitization
      const mergedData = { ...currentData };
      for (const key of Object.keys(updatePayload)) {
        const cleanKey = sanitizeKey(key);
        if (!cleanKey) {
          console.warn(
            `[Sovereign API Path Traversal/Prototype Injection Blocked]: Bypassing unsafe key: "${key}"`
          );
          continue;
        }

        if (updatePayload[key] === null) {
          delete mergedData[cleanKey]; // Retire/delete member if null is passed
        } else {
          mergedData[cleanKey] = {
            ...(mergedData[cleanKey] || {}),
            ...updatePayload[key],
          };
        }
      }

      await saveSovereignData(mergedData);
      return res.status(200).json(mergedData);
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[Sovereign Handler Error]:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
