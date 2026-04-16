const { readJsonBody, sanitizeString, setCorsHeaders } = require("./_shared");

const DEFAULT_ALERT_RECIPIENT_EMAIL = String(process.env.AMC_ALERT_RECIPIENT_EMAIL || "").trim();
const ALERT_WINDOW_DAYS = Number.isFinite(Number.parseInt(process.env.AMC_ALERT_WINDOW_DAYS || "5", 10))
  ? Number.parseInt(process.env.AMC_ALERT_WINDOW_DAYS || "5", 10)
  : 5;

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({
      amcDriveLink: "",
      amcFileId: "",
      amcSourceType: "file",
      alertRecipientEmail: DEFAULT_ALERT_RECIPIENT_EMAIL,
      alertWindowDays: ALERT_WINDOW_DAYS,
    }));
    return;
  }

  if (req.method === "POST") {
    const payload = await readJsonBody(req);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({
      ok: true,
      amcDriveLink: sanitizeString(payload.amcDriveLink),
      amcFileId: sanitizeString(payload.amcFileId),
      amcSourceType: sanitizeString(payload.amcSourceType) || "file",
      alertRecipientEmail: sanitizeString(payload.alertRecipientEmail),
    }));
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method Not Allowed");
};
