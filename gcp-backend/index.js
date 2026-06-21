const { Firestore } = require('@google-cloud/firestore');
const functions = require('@google-cloud/functions-framework');

const db = new Firestore();
const MANTLE_KEY = '923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b';

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


functions.http('locations', async (req, res) => {
  // CORS Headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Mantle-Key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  // Authenticate Request
  const clientKey = req.get('X-Mantle-Key');
  if (clientKey !== MANTLE_KEY) {
    console.warn(`[Unauthorized Access Attempt]: Key ${clientKey}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid X-Mantle-Key' });
  }

  const collectionRef = db.collection('locations');

  try {
    // 1. Secure GitHub Forwarding Proxy (POST request with type === 'feedback')
    if (req.method === 'POST' && req.body && req.body.type === 'feedback') {
      const { title, body, labels } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required for feedback.' });
      }

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        console.error('[GCP Backend] Missing GITHUB_TOKEN environment variable.');
        return res.status(500).json({ error: 'GitHub issue forwarding is not configured on the server.' });
      }

      try {
        const ghResponse = await fetch('https://api.github.com/repos/fkcurrie/wheres-my-family/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'WheresMyFamilyBackendProxy'
          },
          body: JSON.stringify({
            title,
            body,
            labels
          })
        });

        const data = await ghResponse.json();
        if (ghResponse.ok && data.html_url) {
          console.log(`[GCP Backend] Successfully created GitHub issue: ${data.html_url}`);
          return res.status(201).json({ html_url: data.html_url });
        } else {
          console.error('[GCP Backend] GitHub API error:', data);
          return res.status(ghResponse.status).json({ error: data.message || 'GitHub issue creation failed' });
        }
      } catch (err) {
        console.error('[GCP Backend] Failed to forward issue to GitHub:', err);
        return res.status(500).json({ error: 'Failed to communicate with GitHub API', details: err.message });
      }
    }

    if (req.method === 'GET') {
      const snapshot = await collectionRef.get();
      const responseData = {};
      snapshot.forEach((doc) => {
        responseData[doc.id] = doc.data();
      });
      return res.status(200).json(responseData);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const updatePayload = req.body;
      if (!updatePayload || typeof updatePayload !== 'object') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      // Perform Batch updates / deletes with key path traversal sanitization
      const batch = db.batch();
      for (const key of Object.keys(updatePayload)) {
        const cleanKey = sanitizeKey(key);
        // Prevent path traversal injection
        if (!cleanKey) {
          console.warn(`[GCP Backend Path Traversal Injection Blocked]: Bypassing unsafe key: "${key}"`);
          continue;
        }

        const docRef = collectionRef.doc(cleanKey);
        if (updatePayload[key] === null) {
          batch.delete(docRef);
        } else {
          batch.set(docRef, updatePayload[key], { merge: true });
        }
      }
      await batch.commit();

      // Return refreshed full database state
      const snapshot = await collectionRef.get();
      const responseData = {};
      snapshot.forEach((doc) => {
        responseData[doc.id] = doc.data();
      });
      return res.status(200).json(responseData);
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[Cloud Function Error]:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});
