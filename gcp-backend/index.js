const { Firestore } = require('@google-cloud/firestore');
const functions = require('@google-cloud/functions-framework');

const db = new Firestore();
const MANTLE_KEY = '923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b';

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
    if (req.method === 'GET') {
      const snapshot = await collectionRef.get();
      const responseData = {};
      snapshot.forEach(doc => {
        responseData[doc.id] = doc.data();
      });
      return res.status(200).json(responseData);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const updatePayload = req.body;
      if (!updatePayload || typeof updatePayload !== 'object') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      // Perform Batch updates / deletes
      const batch = db.batch();
      for (const key of Object.keys(updatePayload)) {
        const docRef = collectionRef.doc(key);
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
      snapshot.forEach(doc => {
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
