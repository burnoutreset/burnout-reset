// netlify/functions/affiliates.js
//
// PUBLIC:  GET  /api/affiliates?ref=CODE  → returns affiliate links for that ref
// ADMIN:   GET  /api/affiliates?action=list        (requires X-Admin-Key header)
//          POST /api/affiliates?action=save        (requires X-Admin-Key header)
//          POST /api/affiliates?action=toggle      (requires X-Admin-Key header)
//          POST /api/affiliates?action=delete      (requires X-Admin-Key header)
//
// Required Netlify environment variables:
//   AFFILIATE_MAP        — JSON string (start with "{}", managed by this function)
//   ADMIN_KEY            — your chosen password for the admin panel
//   NETLIFY_SITE_ID      — from Netlify site settings (for auto-saving env var)
//   NETLIFY_ACCESS_TOKEN — from Netlify user settings > OAuth > Personal access token

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ARCHETYPES = ["overextended","numb","exhausted","lost","pressure","early"];

const res = (code, body, extra={}) => ({
  statusCode: code,
  headers: { ...CORS, "Content-Type": "application/json", ...extra },
  body: JSON.stringify(body),
});

function loadMap() {
  try { return JSON.parse(process.env.AFFILIATE_MAP || "{}"); }
  catch(e) { return {}; }
}

function isAdmin(event) {
  const key = (event.headers["x-admin-key"] || "").trim();
  return key && key === process.env.ADMIN_KEY;
}

async function saveMap(map) {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_ACCESS_TOKEN;
  if (!siteId || !token) return false;
  try {
    const r = await fetch(
      `https://api.netlify.com/api/v1/sites/${siteId}/env/AFFILIATE_MAP`,
      {
        method:  "PUT",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
        body:    JSON.stringify({ key:"AFFILIATE_MAP", values:[{ context:"all", value:JSON.stringify(map) }] }),
      }
    );
    return r.ok;
  } catch(e) { return false; }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode:200, headers:CORS, body:"" };

  const p      = event.queryStringParameters || {};
  const action = p.action || "";
  const ref    = (p.ref || "").toLowerCase().trim();

  // ── PUBLIC: look up ref code ─────────────────────────────────────
  if (event.httpMethod === "GET" && ref && !action) {
    const aff = loadMap()[ref];
    if (!aff || aff.active === false || !aff.links) {
      return res(200, { found:false });
    }
    return res(200, { found:true, ref, links:aff.links },
      { "Cache-Control":"public, max-age=300" });
  }

  // ── All admin routes require key ─────────────────────────────────
  if (!isAdmin(event)) return res(401, { error:"Unauthorised" });

  // ── ADMIN: list ──────────────────────────────────────────────────
  if (event.httpMethod === "GET" && action === "list") {
    const map  = loadMap();
    const list = Object.entries(map).map(([code, d]) => ({
      ref: code, name:d.name, email:d.email,
      platform:d.platform, handle:d.handle,
      active: d.active !== false,
      hasLinks: !!(d.links && ARCHETYPES.every(k => d.links[k])),
      created:d.created,
    }));
    list.sort((a,b) => (b.created||"").localeCompare(a.created||""));
    return res(200, { affiliates:list });
  }

  // ── Parse body for POST actions ──────────────────────────────────
  let body = {};
  if (event.httpMethod === "POST") {
    try { body = JSON.parse(event.body || "{}"); }
    catch(e) { return res(400, { error:"Invalid JSON" }); }
  }

  // ── ADMIN: save (create or update) ──────────────────────────────
  if (event.httpMethod === "POST" && action === "save") {
    const { ref:newRef, name, email, platform, handle, links, active } = body;

    if (!newRef || !name || !email)
      return res(400, { error:"ref, name, email required" });
    if (!/^[a-z0-9-]+$/.test(newRef))
      return res(400, { error:"ref must be lowercase letters, numbers, hyphens only" });

    if (links) {
      const missing = ARCHETYPES.filter(k => !links[k]);
      if (missing.length) return res(400, { error:"Missing links for: "+missing.join(", ") });
      for (const [k,url] of Object.entries(links)) {
        if (!url.startsWith("https://payhip.com/"))
          return res(400, { error:`${k}: must be a payhip.com URL` });
      }
    }

    const map   = loadMap();
    const isNew = !map[newRef];
    map[newRef] = {
      name, email,
      platform: platform || "",
      handle:   handle   || "",
      active:   active !== false,
      created:  map[newRef]?.created || new Date().toISOString().split("T")[0],
      updated:  new Date().toISOString().split("T")[0],
      links:    links || map[newRef]?.links || null,
    };

    const saved = await saveMap(map);
    return res(200, {
      success: true,
      saved,
      isNew,
      ref: newRef,
      shareLink: `https://selfbeacon.com?ref=${newRef}`,
      manualNote: saved ? null : "Auto-save failed — copy AFFILIATE_MAP below and paste into Netlify env var manually:",
      manualValue: saved ? null : JSON.stringify(map),
    });
  }

  // ── ADMIN: toggle active ──────────────────────────────────────────
  if (event.httpMethod === "POST" && action === "toggle") {
    const { ref:tRef } = body;
    const map = loadMap();
    if (!map[tRef]) return res(404, { error:"Not found" });
    map[tRef].active = !map[tRef].active;
    await saveMap(map);
    return res(200, { success:true, ref:tRef, active:map[tRef].active });
  }

  // ── ADMIN: delete ────────────────────────────────────────────────
  if (event.httpMethod === "POST" && action === "delete") {
    const { ref:dRef } = body;
    const map = loadMap();
    if (!map[dRef]) return res(404, { error:"Not found" });
    const name = map[dRef].name;
    delete map[dRef];
    await saveMap(map);
    return res(200, { success:true, message:`${name} removed.` });
  }

  return res(404, { error:"Unknown action" });
};
