const nodemailer = require("nodemailer");
const XLSX = require("xlsx");

const DRIVE_EXPORT_MIME_TYPES = {
  sheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "text/plain",
  file: "",
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-Drive-Access-Token, Content-Type");
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

function buildDriveTargetUrls(fileId, sourceType, exportMimeType, allowAuthenticatedFallback = false) {
  const encodedFileId = encodeURIComponent(fileId);
  if (/^https?:\/\//i.test(fileId)) {
    return [fileId];
  }

  if (sourceType === "sheet") {
    const urls = [`https://docs.google.com/spreadsheets/d/${encodedFileId}/export?format=xlsx`];
    if (allowAuthenticatedFallback) {
      urls.push(
        `https://www.googleapis.com/drive/v3/files/${encodedFileId}/export?mimeType=${encodeURIComponent(exportMimeType)}&supportsAllDrives=true`,
        `https://www.googleapis.com/drive/v3/files/${encodedFileId}?alt=media&supportsAllDrives=true`,
      );
    }
    return urls;
  }

  if (sourceType === "doc") {
    const urls = [`https://docs.google.com/document/d/${encodedFileId}/export?format=txt`];
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

  if (targetUrl.toLowerCase().endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  return "application/octet-stream";
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

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

function readSheetDisplayValue(sheet, rowIndex, colIndex) {
  if (colIndex === undefined) {
    return "";
  }

  const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
  return String(cell?.w ?? cell?.v ?? "").trim();
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

function findExpiringAmcClients(amcRows, windowDays) {
  const today = startOfLocalDay(new Date());

  return amcRows
    .map((row) => {
      if (Number.isNaN(row.endDateComparable)) {
        return null;
      }

      const endDate = startOfLocalDay(new Date(row.endDateComparable));
      const daysRemaining = Math.round((endDate.getTime() - today.getTime()) / 86400000);
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

function buildAlertSnapshotSignature(configSignature, expiringClients = []) {
  const payload = expiringClients
    .map((client) => `${client.clientName}|${client.startDateDisplay}|${client.endDateDisplay}|${client.daysRemaining}`)
    .join("||");
  return `${configSignature}|${payload}`;
}

function buildAlertConfigSignature(sourceLink, sourceType) {
  return `${sourceType}|${sourceLink}`;
}

function getLocalDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ]);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

async function sendAmcExpiryEmail(expiringClients, windowDays, recipientEmail, smtpCredentials) {
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
    "AMC Expiry Alert",
    `Clients expiring within the next ${windowLabel}:`,
    "Days Left shows the exact remaining calendar days for each client.",
    "",
  ];

  for (const client of expiringClients) {
    lines.push(`${client.clientName} | Start: ${client.startDateDisplay} | End: ${client.endDateDisplay} | Days left: ${client.daysRemaining}`);
  }

  return lines.join("\n");
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

async function runAmcAlertCheckFromPayload(payload = {}, defaults = {}) {
  const smtpUser = sanitizeString(process.env.GMAIL_USER || process.env.SMTP_USER || defaults.smtpUser);
  const smtpPass = sanitizeString(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || defaults.smtpPass).replace(/\s+/g, "");
  if (!smtpUser || !smtpPass) {
    return { ok: false, reason: "alerts_disabled" };
  }

  const sourceLink = sanitizeString(payload.amcDriveLink || payload.amcFileId || defaults.amcDriveLink || defaults.amcFileId);
  if (!sourceLink) {
    return { ok: false, reason: "missing_amc_source" };
  }

  const sourceType = normalizeSourceType(payload.amcSourceType || defaults.amcSourceType || inferSourceTypeFromLink(sourceLink));
  const windowDays = Number.isFinite(Number.parseInt(payload.alertWindowDays || defaults.alertWindowDays || "5", 10))
    ? Number.parseInt(payload.alertWindowDays || defaults.alertWindowDays || "5", 10)
    : 5;
  const recipientEmail = sanitizeString(payload.alertRecipientEmail || defaults.alertRecipientEmail);
  if (!recipientEmail) {
    return { ok: false, reason: "missing_alert_recipient_email" };
  }

  const workbook = await fetchAmcWorkbook(sourceLink, sourceType);
  const amcRows = extractAmcRowsFromWorkbook(workbook);
  const expiringClients = findExpiringAmcClients(amcRows, windowDays);

  if (!expiringClients.length) {
    return { ok: true, sent: false, count: 0 };
  }

  await sendAmcExpiryEmail(expiringClients, windowDays, recipientEmail, { user: smtpUser, pass: smtpPass });
  return { ok: true, sent: true, count: expiringClients.length };
}

module.exports = {
  buildAlertConfigSignature,
  buildAlertSnapshotSignature,
  buildDriveTargetUrls,
  detectAmcHeaderRow,
  escapeHtml,
  extractAmcRowsFromWorkbook,
  fetchAmcWorkbook,
  findExpiringAmcClients,
  guessContentType,
  handleDriveFileProxy,
  inferSourceTypeFromLink,
  normalizeSourceType,
  readJsonBody,
  sanitizeString,
  setCorsHeaders,
  runAmcAlertCheckFromPayload,
};
