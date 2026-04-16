const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ROOT_DIR = __dirname;
const ALERT_CONFIG_PATH = path.join(ROOT_DIR, "amc-alert-config.json");
const ALERT_STATE_PATH = path.join(ROOT_DIR, "amc-alert-state.json");
const DEFAULT_ALERT_RECIPIENT_EMAIL = String(process.env.AMC_ALERT_RECIPIENT_EMAIL || "").trim();
const ALERT_WINDOW_DAYS = Number.isFinite(Number.parseInt(process.env.AMC_ALERT_WINDOW_DAYS || "5", 10))
  ? Number.parseInt(process.env.AMC_ALERT_WINDOW_DAYS || "5", 10)
  : 5;
const ALERT_RUN_HOUR = Number.isFinite(Number.parseInt(process.env.AMC_ALERT_RUN_HOUR || "9", 10))
  ? Number.parseInt(process.env.AMC_ALERT_RUN_HOUR || "9", 10)
  : 9;
const ALERT_RUN_MINUTE = Number.isFinite(Number.parseInt(process.env.AMC_ALERT_RUN_MINUTE || "0", 10))
  ? Number.parseInt(process.env.AMC_ALERT_RUN_MINUTE || "0", 10)
  : 0;
const GMAIL_USER = String(process.env.GMAIL_USER || process.env.SMTP_USER || "").trim();
const GMAIL_APP_PASSWORD = String(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "").trim();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const DRIVE_EXPORT_MIME_TYPES = {
  sheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "text/plain",
  file: "",
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/drive-file") {
      await handleDriveFileProxy(req, res, requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/amc-alert-config") {
      await handleAlertConfigRequest(req, res);
      return;
    }

    if (requestUrl.pathname === "/api/amc-alert-run") {
      await handleAlertRunRequest(req, res);
      return;
    }

    await serveStaticAsset(res, requestUrl.pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end(error.message || "Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`AMC tracker running at http://localhost:${PORT}`);
  startAmcAlertScheduler();
});

function getAlertSmtpCredentials() {
  const config = readJsonFile(ALERT_CONFIG_PATH, {});
  const user = sanitizeString(GMAIL_USER || config.smtpUser);
  const pass = sanitizeString(GMAIL_APP_PASSWORD || config.smtpAppPassword).replace(/\s+/g, "");
  return { user, pass };
}

function hasAlertSmtpCredentials() {
  const credentials = getAlertSmtpCredentials();
  return Boolean(credentials.user && credentials.pass);
}

async function handleDriveFileProxy(req, res, requestUrl) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const fileId = String(requestUrl.searchParams.get("fileId") || "").trim();
  const sourceType = String(requestUrl.searchParams.get("sourceType") || "file").trim();
  if (!fileId) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Missing fileId.");
    return;
  }

  const accessToken = String(req.headers["x-drive-access-token"] || req.headers.authorization || "").trim();
  const bearerToken = accessToken.toLowerCase().startsWith("bearer ") ? accessToken.slice(7).trim() : accessToken;
  const exportMimeType = DRIVE_EXPORT_MIME_TYPES[sourceType] || "";
  const targetUrls = buildDriveTargetUrls(fileId, sourceType, exportMimeType, Boolean(bearerToken));
  const headers = {};

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  let lastError = null;
  for (const targetUrl of targetUrls) {
    try {
      const response = await fetch(targetUrl, { headers, redirect: "follow" });
      if (!response.ok) {
        const text = await response.text();
        lastError = new Error(`Drive proxy fetch failed (${response.status}): ${text}`);
        continue;
      }

      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || guessContentType(targetUrl, sourceType);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });
      res.end(body);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(formatDriveProxyError(sourceType, bearerToken, fileId, lastError));
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-Drive-Access-Token, Content-Type");
}

function buildDriveTargetUrls(fileId, sourceType, exportMimeType, allowAuthenticatedFallback = false) {
  const encodedFileId = encodeURIComponent(fileId);
  if (/^https?:\/\//i.test(fileId)) {
    return [fileId];
  }

  if (sourceType === "sheet") {
    const urls = [
      `https://docs.google.com/spreadsheets/d/${encodedFileId}/export?format=xlsx`,
    ];

    if (allowAuthenticatedFallback) {
      urls.push(
        `https://www.googleapis.com/drive/v3/files/${encodedFileId}/export?mimeType=${encodeURIComponent(exportMimeType)}&supportsAllDrives=true`,
        `https://www.googleapis.com/drive/v3/files/${encodedFileId}?alt=media&supportsAllDrives=true`,
      );
    }

    return urls;
  }

  if (sourceType === "doc") {
    const urls = [
      `https://docs.google.com/document/d/${encodedFileId}/export?format=txt`,
    ];

    if (allowAuthenticatedFallback) {
      urls.push(
        `https://www.googleapis.com/drive/v3/files/${encodedFileId}/export?mimeType=${encodeURIComponent(exportMimeType)}&supportsAllDrives=true`,
        `https://www.googleapis.com/drive/v3/files/${encodedFileId}?alt=media&supportsAllDrives=true`,
      );
    }

    return urls;
  }

  if (allowAuthenticatedFallback) {
    return [`https://www.googleapis.com/drive/v3/files/${encodedFileId}?alt=media&supportsAllDrives=true`];
  }

  return [];
}

function formatDriveProxyError(sourceType, hasToken, fileId, error) {
  const friendly = sourceType === "sheet"
    ? hasToken
      ? "The Google Sheet could not be exported through the proxy."
      : "The Google Sheet is not publicly exportable from the server."
    : sourceType === "doc"
      ? hasToken
        ? "The Google Doc could not be exported through the proxy."
        : "The Google Doc is not publicly exportable from the server."
      : "The Google Drive file could not be fetched through the proxy.";

  const hint = hasToken
    ? "Check the OAuth token and sharing permissions."
    : "Set sharing to 'Anyone with the link' as Viewer, or publish the file to web.";

  return `${friendly} ${hint} ${error ? error.message : `File ID: ${fileId}`}`.trim();
}

function guessContentType(targetUrl, sourceType) {
  if (sourceType === "sheet") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  if (sourceType === "doc") {
    return "text/plain; charset=utf-8";
  }

  if (targetUrl.toLowerCase().endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }

  return "application/octet-stream";
}

async function serveStaticAsset(res, requestPath) {
  let pathname = requestPath;
  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(ROOT_DIR, safePath);

  if (!fullPath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  let filePath = fullPath;
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const fileBuffer = await fs.promises.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
  });
  res.end(fileBuffer);
}

async function handleAlertConfigRequest(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET") {
    const config = readJsonFile(ALERT_CONFIG_PATH, {});
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      amcDriveLink: sanitizeString(config.amcDriveLink || ""),
      amcFileId: sanitizeString(config.amcFileId || ""),
      amcSourceType: normalizeSourceType(config.amcSourceType || "file"),
      alertRecipientEmail: sanitizeString(config.alertRecipientEmail || DEFAULT_ALERT_RECIPIENT_EMAIL),
      alertWindowDays: ALERT_WINDOW_DAYS,
    }));
    return;
  }

  if (req.method === "POST") {
    const payload = await readJsonBody(req);
    const existingConfig = readJsonFile(ALERT_CONFIG_PATH, {});
    const hasRecipientField = Object.prototype.hasOwnProperty.call(payload, "alertRecipientEmail");
    const config = {
      ...existingConfig,
      amcDriveLink: sanitizeString(payload.amcDriveLink),
      amcFileId: sanitizeString(payload.amcFileId),
      amcSourceType: normalizeSourceType(payload.amcSourceType),
      alertRecipientEmail: hasRecipientField
        ? sanitizeString(payload.alertRecipientEmail)
        : sanitizeString(existingConfig.alertRecipientEmail || DEFAULT_ALERT_RECIPIENT_EMAIL),
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile(ALERT_CONFIG_PATH, config);
    void runAmcAlertCheck().catch((error) => {
      console.error("AMC alert check after config sync failed.", error);
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method Not Allowed");
}

async function handleAlertRunRequest(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const result = await runAmcAlertCheck({ force: true });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(result));
}

function startAmcAlertScheduler() {
  if (!hasAlertSmtpCredentials()) {
    console.log("AMC alerts disabled. Set Gmail SMTP credentials in the environment or alert config to enable email alerts.");
    return;
  }

  const scheduleNextRun = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(ALERT_RUN_HOUR, ALERT_RUN_MINUTE, 0, 0);
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delay = nextRun.getTime() - now.getTime();
    setTimeout(async () => {
      await runAmcAlertCheck().catch((error) => console.error("AMC alert run failed.", error));
      scheduleNextRun();
    }, delay);
  };

  runAmcAlertCheck().catch((error) => console.error("AMC alert startup run failed.", error));
  scheduleNextRun();
}

async function runAmcAlertCheck({ force = false } = {}) {
  const smtpCredentials = getAlertSmtpCredentials();
  if (!smtpCredentials.user || !smtpCredentials.pass) {
    return { ok: false, reason: "alerts_disabled" };
  }

  const todayKey = getLocalDateKey(new Date());
  const state = readJsonFile(ALERT_STATE_PATH, {});

  const config = readJsonFile(ALERT_CONFIG_PATH, {});
  const sourceLink = sanitizeString(config.amcDriveLink || config.amcFileId);
  if (!sourceLink) {
    return { ok: false, reason: "missing_amc_source" };
  }

  const sourceType = normalizeSourceType(config.amcSourceType || inferSourceTypeFromLink(sourceLink));
  const configSignature = buildAlertConfigSignature(sourceLink, sourceType);
  const alertRecipientEmail = sanitizeString(config.alertRecipientEmail || DEFAULT_ALERT_RECIPIENT_EMAIL);
  if (!alertRecipientEmail) {
    return { ok: false, reason: "missing_alert_recipient_email" };
  }
  const workbook = await fetchAmcWorkbook(sourceLink, sourceType);
  const amcRows = extractAmcRowsFromWorkbook(workbook);
  const expiringClients = findExpiringAmcClients(amcRows, ALERT_WINDOW_DAYS);
  const snapshotSignature = buildAlertSnapshotSignature(configSignature, expiringClients);

  if (!force && state.lastNotificationSignature === snapshotSignature) {
    return { ok: true, skipped: true, reason: "already_sent_for_current_snapshot" };
  }

  if (!expiringClients.length) {
    state.lastRunDate = todayKey;
    state.lastRunAt = new Date().toISOString();
    state.lastConfigSignature = configSignature;
    state.lastNotificationSignature = snapshotSignature;
    writeJsonFile(ALERT_STATE_PATH, state);
    return { ok: true, sent: false, count: 0 };
  }

  await sendAmcExpiryEmail(expiringClients, ALERT_WINDOW_DAYS, alertRecipientEmail, config, smtpCredentials);
  state.lastRunDate = todayKey;
  state.lastRunAt = new Date().toISOString();
  state.lastConfigSignature = configSignature;
  state.lastNotificationSignature = snapshotSignature;
  writeJsonFile(ALERT_STATE_PATH, state);
  return { ok: true, sent: true, count: expiringClients.length };
}

async function sendAmcExpiryEmail(expiringClients, windowDays, recipientEmail, config = {}, smtpCredentials = getAlertSmtpCredentials()) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    auth: {
      user: smtpCredentials.user,
      pass: smtpCredentials.pass,
    },
  });

  const subject = `AMC expiry alert: ${expiringClients.length} client${expiringClients.length === 1 ? "" : "s"} within ${windowDays} days`;
  const windowLabel = `${windowDays} day${windowDays === 1 ? "" : "s"}`;
  const htmlRows = expiringClients
    .map((client) => `
      <tr>
        <td style="padding:10px 12px;border:1px solid #d9dee5;">${escapeHtml(client.clientName)}</td>
        <td style="padding:10px 12px;border:1px solid #d9dee5;">${escapeHtml(client.startDateDisplay)}</td>
        <td style="padding:10px 12px;border:1px solid #d9dee5;">${escapeHtml(client.endDateDisplay)}</td>
        <td style="padding:10px 12px;border:1px solid #d9dee5;text-align:center;">${client.daysRemaining}</td>
      </tr>
    `)
    .join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5">
      <h2 style="margin:0 0 12px;color:#0f172a">AMC Expiry Alert</h2>
      <p style="margin:0 0 10px">The following client AMC contracts are expiring within the next ${windowLabel}.</p>
      <p style="margin:0 0 16px;color:#475569;font-size:13px">The <strong>Days Left</strong> column shows the exact remaining calendar days for each client.</p>
      <table style="border-collapse:collapse;width:100%;max-width:900px;font-size:14px">
        <thead>
          <tr style="background:#0f2747;color:#fff">
            <th style="padding:10px 12px;border:1px solid #0f2747;text-align:left;">Client</th>
            <th style="padding:10px 12px;border:1px solid #0f2747;text-align:left;">AMC Start</th>
            <th style="padding:10px 12px;border:1px solid #0f2747;text-align:left;">AMC End</th>
            <th style="padding:10px 12px;border:1px solid #0f2747;text-align:center;">Days Left</th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
  `;

  await withTimeout(
    transporter.sendMail({
      from: `"AMC Alerts" <${smtpCredentials.user}>`,
      to: recipientEmail,
      subject,
      text: buildAmcExpiryText(expiringClients, windowDays),
      html,
    }),
    45000,
    "Gmail send timed out.",
  );
}

function buildAmcExpiryText(expiringClients, windowDays) {
  const windowLabel = `${windowDays} day${windowDays === 1 ? "" : "s"}`;
  const lines = [
    `AMC Expiry Alert`,
    `Clients expiring within the next ${windowLabel}:`,
    `Days Left shows the exact remaining calendar days for each client.`,
    "",
  ];

  for (const client of expiringClients) {
    lines.push(`${client.clientName} | Start: ${client.startDateDisplay} | End: ${client.endDateDisplay} | Days left: ${client.daysRemaining}`);
  }

  return lines.join("\n");
}

async function fetchAmcWorkbook(sourceLink, sourceType) {
  const targetUrls = buildDriveTargetUrls(sourceLink, sourceType, "", true);
  let lastError = null;

  for (const targetUrl of targetUrls.length ? targetUrls : [sourceLink]) {
    try {
      const response = await fetch(targetUrl, { redirect: "follow", cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`AMC fetch failed (${response.status}) from ${targetUrl}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return XLSX.read(buffer, { type: "buffer", cellDates: true, cellNF: true, cellText: true });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to fetch AMC workbook.");
}

function extractAmcRowsFromWorkbook(workbook) {
  const sheet = pickBestAmcSheet(workbook);
  if (!sheet) {
    return [];
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headerMeta = detectAmcHeaderRow(sheet, range);
  const rows = [];

  for (let rowIndex = headerMeta.headerRowIndex + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const clientName = readSheetDisplayValue(sheet, rowIndex, headerMeta.resolvedHeaders.clientName);
    if (!clientName) {
      continue;
    }

    const startMeta = readDateCell(sheet, rowIndex, headerMeta.resolvedHeaders.startDate);
    const endMeta = readDateCell(sheet, rowIndex, headerMeta.resolvedHeaders.endDate);
    rows.push({
      clientName,
      startDateDisplay: startMeta.display,
      endDateDisplay: endMeta.display,
      endDateComparable: endMeta.comparable,
    });
  }

  return rows;
}

function pickBestAmcSheet(workbook) {
  let best = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      continue;
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const headerMeta = detectAmcHeaderRow(sheet, range);
    const score = Object.values(headerMeta.resolvedHeaders).filter((value) => value !== undefined).length;
    const weightedScore = calculateHeaderWeightedScore(headerMeta.matchedAliases) + score * 10;
    const candidate = { sheet, range, headerMeta, score, weightedScore };

    if (!best || candidate.weightedScore > best.weightedScore) {
      best = candidate;
    }
  }

  return best?.sheet || null;
}

function detectAmcHeaderRow(sheet, range) {
  const scanLimit = Math.min(range.e.r, range.s.r + 14);
  let bestMatch = {
    score: -1,
    weightedScore: -1,
    headerRowIndex: range.s.r,
    resolvedHeaders: {
      clientName: undefined,
      startDate: undefined,
      endDate: undefined,
    },
    matchedAliases: {
      clientName: "",
      startDate: "",
      endDate: "",
    },
  };

  for (let rowIndex = range.s.r; rowIndex <= scanLimit; rowIndex += 1) {
    const headerMap = new Map();
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
      const cell = sheet[address];
      const headerText = normalizeHeaderText(cell?.w ?? cell?.v ?? "");
      if (headerText) {
        headerMap.set(headerText, col);
      }
    }

    const clientNameMatch = findHeaderMatch(headerMap, ["client name", "website - url", "website url", "client", "website", "url"]);
    const startDateMatch = findHeaderMatch(headerMap, ["amc start date", "start date", "amc start"]);
    const endDateMatch = findHeaderMatch(headerMap, ["amc end date", "end date", "amc end"]);
    const resolvedHeaders = {
      clientName: clientNameMatch.column,
      startDate: startDateMatch.column,
      endDate: endDateMatch.column,
    };
    const score = Object.values(resolvedHeaders).filter((value) => value !== undefined).length;
    const matchedAliases = {
      clientName: clientNameMatch.alias,
      startDate: startDateMatch.alias,
      endDate: endDateMatch.alias,
    };
    const weightedScore = calculateHeaderWeightedScore(matchedAliases);

    if (weightedScore > bestMatch.weightedScore || (weightedScore === bestMatch.weightedScore && score > bestMatch.score)) {
      bestMatch = { score, weightedScore, headerRowIndex: rowIndex, resolvedHeaders, matchedAliases };
    }

    if (score === 3 && weightedScore >= 70) {
      break;
    }
  }

  return bestMatch;
}

function findHeaderMatch(headerMap, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderText(alias);
    if (headerMap.has(normalizedAlias)) {
      return { column: headerMap.get(normalizedAlias), alias: normalizedAlias };
    }
  }

  return { column: undefined, alias: "" };
}

function calculateHeaderWeightedScore(matchedAliases) {
  let score = 0;
  if (matchedAliases.clientName) {
    score += matchedAliases.clientName === normalizeHeaderText("website - url") ? 40 : 20;
  }
  if (matchedAliases.startDate) {
    score += matchedAliases.startDate === normalizeHeaderText("amc start date") ? 30 : 15;
  }
  if (matchedAliases.endDate) {
    score += matchedAliases.endDate === normalizeHeaderText("amc end date") ? 30 : 15;
  }
  return score;
}

function readSheetDisplayValue(sheet, rowIndex, colIndex) {
  if (colIndex === undefined) {
    return "";
  }

  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
  return String(cell?.w ?? cell?.v ?? "").trim();
}

function readDateCell(sheet, rowIndex, colIndex) {
  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
  const display = String(cell?.w ?? cell?.v ?? "").trim();
  let comparable = Number.NaN;

  if (cell?.v instanceof Date) {
    comparable = normalizeDateComparable(cell.v);
  } else if (typeof cell?.v === "number") {
    const parsed = XLSX.SSF.parse_date_code(cell.v);
    if (parsed) {
      comparable = Date.UTC(parsed.y, parsed.m - 1, parsed.d);
    }
  }

  if (Number.isNaN(comparable) && display) {
    comparable = normalizeDateComparable(display);
  }

  return { display, comparable };
}

function normalizeHeaderText(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/:+/g, "")
    .replace(/[()]+/g, "");
}

function normalizeDateComparable(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return Number.NaN;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const monthNames = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const monthTextMatch = text.match(/^(\d{1,2})[-/\s]([a-z]{3,9})[-/\s](\d{2,4})$/i);
  if (monthTextMatch) {
    const day = Number(monthTextMatch[1]);
    const monthKey = monthTextMatch[2].toLowerCase();
    const month = monthNames[monthKey];
    let year = Number(monthTextMatch[3]);
    if (Number.isInteger(month) && Number.isFinite(day) && Number.isFinite(year)) {
      if (year < 100) {
        year += year >= 70 ? 1900 : 2000;
      }
      return Date.UTC(year, month, day);
    }
  }

  const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    let year = Number(match[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    return Date.UTC(year, month, day);
  }

  return Number.NaN;
}

function findExpiringAmcClients(amcRows, windowDays) {
  const today = startOfLocalDay(new Date());

  return amcRows
    .map((row) => {
      if (Number.isNaN(row.endDateComparable)) {
        return null;
      }

      const endParts = parseCalendarDateParts(row.endDateDisplay) || parseComparableDateParts(row.endDateComparable);
      if (!endParts) {
        return null;
      }

      const endDate = startOfLocalDay(new Date(endParts.year, endParts.month - 1, endParts.day));
      const daysRemaining = Math.max(0, Math.round((endDate.getTime() - today.getTime()) / 86400000));
      return {
        clientName: row.clientName,
        startDateDisplay: row.startDateDisplay,
        endDateDisplay: row.endDateDisplay,
        daysRemaining,
      };
    })
    .filter(Boolean)
    .filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= windowDays)
    .sort((left, right) => left.daysRemaining - right.daysRemaining || left.clientName.localeCompare(right.clientName));
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseComparableDateParts(comparableDate) {
  if (Number.isNaN(comparableDate)) {
    return null;
  }

  const date = new Date(comparableDate);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function parseCalendarDateParts(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const ddMmmYyyyMatch = text.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{4})$/);
  if (ddMmmYyyyMatch) {
    const [, day, monthText, year] = ddMmmYyyyMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      return { day: Number(day), month: monthIndex + 1, year: Number(year) };
    }
  }

  const ddMmmYyMatch = text.match(/^(\d{1,2})-([a-zA-Z]{3,9})-(\d{2})$/);
  if (ddMmmYyMatch) {
    const [, day, monthText, year] = ddMmmYyMatch;
    const monthIndex = getMonthIndex(monthText);
    if (monthIndex !== -1) {
      const yearNumber = Number(year);
      const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
      return { day: Number(day), month: monthIndex + 1, year: fullYear };
    }
  }

  const ddMmYyyyMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    return { day: Number(day), month: Number(month), year: Number(year) };
  }

  const ddMmYyMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (ddMmYyMatch) {
    const [, day, month, year] = ddMmYyMatch;
    const yearNumber = Number(year);
    const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
    return { day: Number(day), month: Number(month), year: fullYear };
  }

  const ddSlashMmSlashYyyyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddSlashMmSlashYyyyMatch) {
    const [, day, month, year] = ddSlashMmSlashYyyyMatch;
    return { day: Number(day), month: Number(month), year: Number(year) };
  }

  const ddSlashMmSlashYyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ddSlashMmSlashYyMatch) {
    const [, day, month, year] = ddSlashMmSlashYyMatch;
    const yearNumber = Number(year);
    const fullYear = yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber;
    return { day: Number(day), month: Number(month), year: fullYear };
  }

  const yyyyMmDdMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyyMmDdMatch) {
    const [, year, month, day] = yyyyMmDdMatch;
    return { day: Number(day), month: Number(month), year: Number(year) };
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      day: parsed.getDate(),
      month: parsed.getMonth() + 1,
      year: parsed.getFullYear(),
    };
  }

  return null;
}

function getMonthIndex(monthText) {
  const normalized = String(monthText ?? "").trim().toLowerCase();
  const months = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  return Object.prototype.hasOwnProperty.call(months, normalized) ? months[normalized] : -1;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function getLocalDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildAlertConfigSignature(sourceLink, sourceType) {
  return `${sourceType}|${sourceLink}`;
}

function buildAlertSnapshotSignature(configSignature, expiringClients = []) {
  const payload = expiringClients
    .map((client) => `${client.clientName}|${client.startDateDisplay}|${client.endDateDisplay}|${client.daysRemaining}`)
    .join("||");
  return `${configSignature}|${payload}`;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ]);
}

function sanitizeString(value) {
  return String(value ?? "").trim();
}

function normalizeSourceType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "sheet" || text === "doc" || text === "file") {
    return text;
  }
  return "file";
}

function inferSourceTypeFromLink(link) {
  const text = String(link || "").toLowerCase();
  if (text.includes("spreadsheets")) {
    return "sheet";
  }
  if (text.includes("document")) {
    return "doc";
  }
  return "file";
}

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
