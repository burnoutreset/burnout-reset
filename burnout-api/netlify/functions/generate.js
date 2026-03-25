const Anthropic = require("@anthropic-ai/sdk");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
 
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS" },
      body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  let data;
  try { data = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: "Invalid JSON" }; }
 
  const { archetype, severity, emotions, triggers,
          responses, actions, consequences, topPainPoints } = data;
 
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500,
      body: JSON.stringify({ error: "API key not configured" }) };
  }
 
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 
  // Build the prompt as a regular string — no template literals needed
  const prompt = [
    "You are writing a personalized 30-day burnout recovery guide.",
    "Output ONLY valid JSON. No markdown fences. No preamble.",
    "",
    "User profile:",
    "- Primary archetype: " + archetype,
    "- Severity: " + severity,
    "- Emotions: " + emotions,
    "- Triggers: " + triggers,
    "- Responses: " + responses,
    "- Actions: " + actions,
    "- Consequences: " + consequences,
    "- Top pain points: " + topPainPoints,
    "",
    "Rules:",
    "- Reference this person's specific triggers and emotions in every prompt",
    "- Never write generic advice",
    "- Tone: warm, honest, like a smart friend. Short sentences. No jargon.",
    "- Week 1 theme: Acknowledge. Week 2: Protect. Week 3: Attune. Week 4: Sustain.",
    "",
    "Return this exact JSON structure:",
    "{",
    "  \"intro\": \"2-3 sentence personalized opening\",",
    "  \"weeks\": [",
    "    {",
    "      \"weekNum\": 1,",
    "      \"theme\": \"Acknowledge\",",
    "      \"subTheme\": \"short phrase max 5 words\",",
    "      \"days\": [",
    "        { \"dayNum\": 1, \"morning\": \"string\",",
    "          \"midday\": \"string\", \"evening\": \"string\" }",
    "      ]",
    "    }",
    "  ]",
    "}"
  ].join("\n");
 
  let journalData;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content
      .map(b => b.type === "text" ? b.text : "").join("");
    const clean = raw.replace(/```json|```/g, "").trim();
    journalData = JSON.parse(clean);
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Generation failed: " + e.message }),
    };
  }
 
  // Build PDF with pdf-lib
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const W = 612; const H = 792; const M = 60; const CW = W - M * 2;
 
  function wrapText(page, text, x, y, size, f, color, maxW) {
    const words = String(text).split(" ");
    let line = ""; let cy = y;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        page.drawText(line, { x, y: cy, size, font: f, color });
        cy -= size * 1.5; line = word;
        if (cy < M) return cy;
      } else { line = test; }
    }
    if (line) { page.drawText(line, { x, y: cy, size, font: f, color }); cy -= size * 1.5; }
    return cy;
  }
 
  // Cover
  const cover = pdfDoc.addPage([W, H]);
  cover.drawRectangle({ x:0, y:0, width:W, height:H, color: rgb(0.05,0.05,0.05) });
  cover.drawText("THE 30-DAY BURNOUT RESET",
    { x:M, y:580, size:20, font:bold, color:rgb(1,1,1) });
  cover.drawText(archetype,
    { x:M, y:540, size:14, font, color:rgb(0.91,0.25,0.11) });
  wrapText(cover, journalData.intro, M, 490, 11, font, rgb(0.7,0.7,0.7), CW);
 
  // Week + day pages
  for (const week of journalData.weeks) {
    const wPage = pdfDoc.addPage([W, H]);
    wPage.drawText("WEEK " + week.weekNum,
      { x:M, y:700, size:11, font:bold, color:rgb(0.91,0.25,0.11) });
    wPage.drawText(week.theme.toUpperCase(),
      { x:M, y:660, size:36, font:bold, color:rgb(0.1,0.1,0.1) });
    wPage.drawLine({ start:{x:M,y:640}, end:{x:W-M,y:640},
      thickness:1, color:rgb(0.85,0.85,0.85) });
    wrapText(wPage, week.subTheme||"", M, 610, 13, font, rgb(0.4,0.4,0.4), CW);
 
    for (const day of week.days) {
      const page = pdfDoc.addPage([W, H]);
      let y = H - M;
      page.drawText("DAY " + day.dayNum,
        { x:M, y, size:28, font:bold, color:rgb(0.91,0.25,0.11) });
      y -= 28;
      page.drawText("Week " + week.weekNum + " - " + week.theme,
        { x:M, y, size:10, font, color:rgb(0.5,0.5,0.5) });
      y -= 14;
      page.drawText("Date: _______________________",
        { x:M, y, size:10, font, color:rgb(0.6,0.6,0.6) });
      y -= 20;
      page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1,color:rgb(0.85,0.85,0.85)});
      y -= 22;
 
      // Morning section
      page.drawText("MORNING",{x:M,y,size:9,font:bold,color:rgb(0.63,0.60,0.52)});
      y -= 18;
      y = wrapText(page,day.morning,M,y,11,font,rgb(0.15,0.12,0.09),CW);
      y -= 10;
      for (let i=0;i<3;i++){y-=26;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:0.5,color:rgb(0.8,0.75,0.70)});}
      y -= 20;
      page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:0.5,color:rgb(0.88,0.85,0.82)});
      y -= 20;
 
      // Midday section
      page.drawText("MIDDAY CHECK-IN",{x:M,y,size:9,font:bold,color:rgb(0.35,0.55,0.34)});
      y -= 18;
      y = wrapText(page,day.midday,M,y,11,font,rgb(0.15,0.12,0.09),CW);
      y -= 10;
      for (let i=0;i<2;i++){y-=26;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:0.5,color:rgb(0.8,0.75,0.70)});}
      y -= 20;
      page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:0.5,color:rgb(0.88,0.85,0.82)});
      y -= 20;
 
      // Evening section
      page.drawText("EVENING",{x:M,y,size:9,font:bold,color:rgb(0.63,0.38,0.38)});
      y -= 18;
      y = wrapText(page,day.evening,M,y,11,font,rgb(0.15,0.12,0.09),CW);
      y -= 10;
      for (let i=0;i<3;i++){y-=26;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:0.5,color:rgb(0.8,0.75,0.70)});}
 
      // Footer
      page.drawLine({start:{x:M,y:50},end:{x:W-M,y:50},thickness:0.5,color:rgb(0.88,0.85,0.82)});
      page.drawText(archetype + " - Day " + day.dayNum + " of 30",
        {x:M,y:36,size:9,font,color:rgb(0.6,0.55,0.5)});
    }
  }
 
  const pdfBytes = await pdfDoc.save();
  const base64Pdf = Buffer.from(pdfBytes).toString("base64");
 
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ pdf: base64Pdf }),
  };
};