// netlify/functions/generate-and-email.js
//
// Called by thank-you.html after Payhip payment.
// Retrieves stored profile, calls Claude API, builds PDF, emails it.
//
// POST /api/generate-and-email
// Body: { sessionId, email, archetype (fallback if no stored profile) }
//
// Required env vars:
//   ANTHROPIC_API_KEY  — from console.anthropic.com
//   SMTP_USER          — your Namecheap email e.g. wecare@selfbeacon.com
//   SMTP_PASS          — your Namecheap email password
//
// Namecheap Private Email SMTP settings (already configured below):
//   Host: mail.privateemail.com  Port: 465  SSL: true
//
// Optional env vars:
//   NETLIFY_BLOBS_TOKEN — auto-set by Netlify, needed for blob storage

const Anthropic = require("@anthropic-ai/sdk");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// Try to load Netlify Blobs — graceful fallback if unavailable
let getStore;
try {
  ({ getStore } = require("@netlify/blobs"));
} catch(e) {
  getStore = null;
}

// Nodemailer for SMTP email sending
const nodemailer = require("nodemailer");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const res = (code, body) => ({
  statusCode: code,
  headers: { ...CORS, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ── Email sender via Namecheap Private Email (SMTP) ─────────────────────
async function sendEmail({ to, subject, html, pdfBase64, pdfFilename }) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) throw new Error("SMTP_USER or SMTP_PASS not configured");

  // Namecheap Private Email SMTP — these settings never change
  const transporter = nodemailer.createTransport({
    host:   "mail.privateemail.com",
    port:   465,
    secure: true, // SSL
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const mailOptions = {
    from:    `Self Beacon <${smtpUser}>`,
    to:      to,
    subject: subject,
    html:    html,
    attachments: pdfBase64 ? [{
      filename:    pdfFilename,
      content:     Buffer.from(pdfBase64, "base64"),
      contentType: "application/pdf",
    }] : [],
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

// ── Load profile from Netlify Blobs ──────────────────────────────────────
async function loadProfile(sessionId) {
  if (!sessionId || !getStore) return null;
  try {
    const store = getStore("profiles");
    const data  = await store.get(sessionId, { type: "json" });
    if (!data) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    // Clean up after use
    await store.delete(sessionId).catch(() => {});
    return data;
  } catch(e) {
    console.error("loadProfile error:", e.message);
    return null;
  }
}

// ── Claude API call ───────────────────────────────────────────────────────
async function generateGuide(profile) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const hasPersonalData = profile.emotions || profile.triggers;

  const prompt = [
    "You are writing a personalized 30-day burnout recovery guide.",
    "Output ONLY valid JSON. No markdown fences. No preamble. No commentary.",
    "",
    "Person profile:",
    "- Primary archetype: " + profile.archetype,
    "- Severity score: "   + (profile.severity || "not provided"),
    "- Emotions they named: " + (profile.emotions || "not provided"),
    "- Their triggers: "   + (profile.triggers || "not provided"),
    "- Their responses: "  + (profile.responses || "not provided"),
    "- Their actions: "    + (profile.actions || "not provided"),
    "- Their consequences: "+ (profile.consequences || "not provided"),
    "- Top pain points: "  + (profile.topPainPoints || "not provided"),
    "",
    "Writing rules:",
    hasPersonalData
      ? "- Reference their SPECIFIC triggers, emotions, and actions throughout. Never write generic advice."
      : "- Write specifically for someone with the " + profile.archetype + " pattern.",
    "- Tone: warm, direct, like a trusted friend who understands burnout. Short sentences.",
    "- Each day entry should feel genuinely written for this person.",
    "- Week 1 theme: Acknowledge. Week 2: Protect. Week 3: Attune. Week 4: Sustain.",
    "",
    "Return this EXACT JSON structure with all 4 weeks and all 7 days per week:",
    JSON.stringify({
      intro: "2-3 sentence personalized opening that references their specific situation",
      weeks: [{
        weekNum: 1,
        theme: "Acknowledge",
        subTheme: "short phrase max 5 words",
        days: [{
          dayNum: 1,
          morning: "morning practice instruction — specific and actionable",
          midday:  "midday check-in — brief and grounding",
          evening: "evening reflection — honest and gentle"
        }]
      }]
    }, null, 2),
  ].join("\n");

  const message = await client.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages:   [{ role: "user", content: prompt }],
  });

  const raw   = message.content.map(b => b.type === "text" ? b.text : "").join("");
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── PDF builder ───────────────────────────────────────────────────────────
async function buildPDF(archetype, journalData) {
  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const W = 612; const H = 792; const M = 60; const CW = W - M * 2;

  function wrapText(page, text, x, y, size, f, color, maxW) {
    const words = String(text || "").split(" ");
    let line = ""; let cy = y;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        if (cy > M + size) page.drawText(line, { x, y: cy, size, font: f, color });
        cy -= size * 1.5; line = word;
      } else { line = test; }
    }
    if (line && cy > M) page.drawText(line, { x, y: cy, size, font: f, color });
    return cy - size * 1.5;
  }

  // Cover page
  const cover = pdfDoc.addPage([W, H]);
  cover.drawRectangle({ x:0, y:0, width:W, height:H, color: rgb(0.05,0.05,0.05) });
  cover.drawRectangle({ x:0, y:0, width:6, height:H, color: rgb(0.91,0.25,0.11) });
  cover.drawText("THE 30-DAY BURNOUT RESET",
    { x:M, y:H-M, size:13, font:bold, color:rgb(0.91,0.25,0.11) });
  cover.drawText("Self Beacon",
    { x:M, y:H-M-20, size:10, font, color:rgb(0.5,0.5,0.5) });
  cover.drawText(archetype,
    { x:M, y:580, size:28, font:bold, color:rgb(1,1,1) });
  cover.drawLine({ start:{x:M,y:560}, end:{x:W-M,y:560},
    thickness:1, color:rgb(0.91,0.25,0.11) });
  wrapText(cover, journalData.intro, M, 530, 12, font, rgb(0.75,0.75,0.75), CW);
  cover.drawText("selfbeacon.com",
    { x:M, y:M, size:9, font, color:rgb(0.4,0.4,0.4) });

  // Week and day pages
  for (const week of (journalData.weeks || [])) {
    // Week cover page
    const wPage = pdfDoc.addPage([W, H]);
    wPage.drawRectangle({ x:0, y:0, width:W, height:H, color:rgb(0.97,0.97,0.97) });
    wPage.drawRectangle({ x:0, y:0, width:6, height:H, color:rgb(0.91,0.25,0.11) });
    wPage.drawText("WEEK " + week.weekNum,
      { x:M, y:H-M, size:11, font:bold, color:rgb(0.91,0.25,0.11) });
    wPage.drawText((week.theme || "").toUpperCase(),
      { x:M, y:660, size:42, font:bold, color:rgb(0.08,0.08,0.08) });
    wPage.drawLine({ start:{x:M,y:635}, end:{x:W-M,y:635},
      thickness:1, color:rgb(0.80,0.80,0.80) });
    wrapText(wPage, week.subTheme || "", M, 608, 14, font, rgb(0.45,0.45,0.45), CW);
    wPage.drawText("selfbeacon.com",
      { x:M, y:M, size:9, font, color:rgb(0.65,0.65,0.65) });

    // Day pages
    for (const day of (week.days || [])) {
      const page = pdfDoc.addPage([W, H]);
      page.drawRectangle({ x:0, y:0, width:W, height:H, color:rgb(1,1,1) });
      page.drawRectangle({ x:0, y:0, width:6, height:H, color:rgb(0.91,0.25,0.11) });

      let y = H - M;

      // Header
      page.drawText("DAY " + day.dayNum,
        { x:M, y, size:26, font:bold, color:rgb(0.91,0.25,0.11) });
      y -= 26;
      page.drawText("Week " + week.weekNum + " — " + week.theme,
        { x:M, y, size:9, font, color:rgb(0.55,0.55,0.55) });
      y -= 14;
      page.drawText("Date: ___________________________",
        { x:M, y, size:9, font, color:rgb(0.65,0.65,0.65) });
      y -= 18;
      page.drawLine({start:{x:M,y},end:{x:W-M,y},
        thickness:1,color:rgb(0.82,0.82,0.82)});
      y -= 22;

      // Morning
      page.drawText("MORNING",
        {x:M,y,size:8,font:bold,color:rgb(0.72,0.48,0.28)});
      y -= 16;
      y = wrapText(page, day.morning, M, y, 11, font, rgb(0.12,0.10,0.08), CW);
      y -= 8;
      for(let i=0;i<3;i++){
        y-=24;
        page.drawLine({start:{x:M,y},end:{x:W-M,y},
          thickness:0.5,color:rgb(0.82,0.78,0.74)});
      }
      y -= 16;
      page.drawLine({start:{x:M,y},end:{x:W-M,y},
        thickness:0.5,color:rgb(0.88,0.88,0.88)});
      y -= 18;

      // Midday
      page.drawText("MIDDAY CHECK-IN",
        {x:M,y,size:8,font:bold,color:rgb(0.25,0.52,0.32)});
      y -= 16;
      y = wrapText(page, day.midday, M, y, 11, font, rgb(0.12,0.10,0.08), CW);
      y -= 8;
      for(let i=0;i<2;i++){
        y-=24;
        page.drawLine({start:{x:M,y},end:{x:W-M,y},
          thickness:0.5,color:rgb(0.82,0.78,0.74)});
      }
      y -= 16;
      page.drawLine({start:{x:M,y},end:{x:W-M,y},
        thickness:0.5,color:rgb(0.88,0.88,0.88)});
      y -= 18;

      // Evening
      page.drawText("EVENING",
        {x:M,y,size:8,font:bold,color:rgb(0.45,0.32,0.55)});
      y -= 16;
      y = wrapText(page, day.evening, M, y, 11, font, rgb(0.12,0.10,0.08), CW);
      y -= 8;
      for(let i=0;i<3;i++){
        y-=24;
        page.drawLine({start:{x:M,y},end:{x:W-M,y},
          thickness:0.5,color:rgb(0.82,0.78,0.74)});
      }

      // Footer
      page.drawLine({start:{x:M,y:48},end:{x:W-M,y:48},
        thickness:0.5,color:rgb(0.85,0.85,0.85)});
      page.drawText(archetype + "  ·  Day " + day.dayNum + " of 30",
        {x:M,y:34,size:8,font,color:rgb(0.60,0.55,0.50)});
      page.drawText("selfbeacon.com",
        {x:W-M-70,y:34,size:8,font,color:rgb(0.70,0.70,0.70)});
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString("base64");
}

// ── Email HTML template ───────────────────────────────────────────────────
function emailHTML(archetype, name) {
  const firstName = name ? name.split(" ")[0] : "there";
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">

        <!-- Header -->
        <tr><td style="background:#0D0D0D;padding:28px 36px">
          <div style="display:inline-block;background:#E8401C;border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;color:white;letter-spacing:.05em;margin-bottom:8px">SELF BEACON</div>
          <div style="color:white;font-size:22px;font-weight:700;letter-spacing:-.02em">Your guide is ready.</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 36px">
          <p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.6">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.6">
            Your personalized 30-day guide for <strong style="color:#0D0D0D">${archetype}</strong> is attached to this email.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;line-height:1.6">
            It was built specifically for your assessment responses — your emotions, your triggers, your patterns. Not a generic guide.
          </p>

          <!-- Guide contents -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9fa;border-radius:10px;padding:20px 24px;margin-bottom:24px">
            <tr><td>
              <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#a1a1aa;margin-bottom:12px">What's inside</div>
              <div style="font-size:14px;color:#52525b;line-height:1.8">
                ✓ &nbsp;Structured daily schedule — morning, midday, evening<br>
                ✓ &nbsp;30 days of prompts written for your specific pattern<br>
                ✓ &nbsp;Emergency protocols — overwhelm, shutdown, anxiety spike<br>
                ✓ &nbsp;4-week arc: Acknowledge → Protect → Attune → Sustain
              </div>
            </td></tr>
          </table>

          <!-- Tip -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #E8401C;padding-left:16px;margin-bottom:28px">
            <tr><td>
              <div style="font-size:13px;font-weight:600;color:#0D0D0D;margin-bottom:4px">Start with Week 1, Day 1</div>
              <div style="font-size:13px;color:#71717a;line-height:1.6">Don't skip ahead. The first week is about acknowledging — it sets everything else up.</div>
            </td></tr>
          </table>

          <p style="margin:0;font-size:14px;color:#71717a;line-height:1.6">
            Questions? Reply to this email — we read everything.<br>
            <a href="https://selfbeacon.com" style="color:#E8401C;text-decoration:none">selfbeacon.com</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#fafafa;border-top:1px solid #f0f0f0;padding:20px 36px">
          <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6">
            Self Beacon &nbsp;·&nbsp; wecare@selfbeacon.com<br>
            You're receiving this because you purchased a guide at selfbeacon.com.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return res(405, { error: "Method not allowed" });
  }

  if (!process.env.ANTHROPIC_API_KEY) return res(500, { error: "API key not configured" });
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return res(500, { error: "Email service not configured" });

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return res(400, { error: "Invalid JSON" }); }

  const { sessionId, email, buyerName } = body;

  if (!email) return res(400, { error: "email required" });

  // Load stored profile (may be null if save-profile failed or expired)
  const stored = await loadProfile(sessionId);

  // Build profile — use stored data if available, fallback to body params
  const profile = {
    archetype:     stored?.archetype     || body.archetype     || "Burnout Reset",
    severity:      stored?.severity      || body.severity      || "",
    emotions:      stored?.emotions      || body.emotions      || "",
    triggers:      stored?.triggers      || body.triggers      || "",
    responses:     stored?.responses     || body.responses     || "",
    actions:       stored?.actions       || body.actions       || "",
    consequences:  stored?.consequences  || body.consequences  || "",
    topPainPoints: stored?.topPainPoints || body.topPainPoints || "",
  };

  // Generate guide
  let journalData;
  try {
    journalData = await generateGuide(profile);
  } catch(e) {
    console.error("Generation error:", e.message);
    return res(500, { error: "Guide generation failed: " + e.message });
  }

  // Build PDF
  let pdfBase64;
  try {
    pdfBase64 = await buildPDF(profile.archetype, journalData);
  } catch(e) {
    console.error("PDF build error:", e.message);
    return res(500, { error: "PDF build failed: " + e.message });
  }

  // Send email with PDF attached
  const pdfFilename = "30-Day-Burnout-Reset-" +
    profile.archetype.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "") + ".pdf";

  try {
    await sendEmail({
      to:          email,
      subject:     "Your Self Beacon guide is ready — " + profile.archetype,
      html:        emailHTML(profile.archetype, buyerName || ""),
      pdfBase64,
      pdfFilename,
    });
  } catch(e) {
    console.error("Email send error:", e.message);
    return res(500, { error: "Email failed: " + e.message });
  }

  return res(200, {
    ok:      true,
    message: "Guide generated and sent to " + email,
  });
};