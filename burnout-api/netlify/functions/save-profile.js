// netlify/functions/save-profile.js
//
// Called by the assessment BEFORE buyer goes to Payhip.
// Stores their profile data temporarily so generate-and-email
// can retrieve it after payment using the session ID.
//
// POST /api/save-profile
// Body: { sessionId, archetype, severity, emotions, triggers,
//         responses, actions, consequences, topPainPoints }
//
// Returns: { ok: true, sessionId }
//
// Storage: Netlify Blobs (built-in, no extra service needed)
// Expiry:  2 hours — enough time to complete checkout

const { getStore } = require("@netlify/blobs");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: "Method not allowed" };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { sessionId, ...profile } = body;

  if (!sessionId || !profile.archetype) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "sessionId and archetype required" }),
    };
  }

  try {
    const store = getStore("profiles");
    await store.setJSON(sessionId, {
      ...profile,
      savedAt: Date.now(),
      expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    });

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, sessionId }),
    };
  } catch(e) {
    console.error("save-profile error:", e);
    // Don't block the purchase if storage fails
    // The thank-you page will generate without personalisation
    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, sessionId, error: e.message }),
    };
  }
};
