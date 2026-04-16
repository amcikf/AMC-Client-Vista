# AMC Hours Tracking and Reporting

AMC Hours Tracking and Reporting app for uploading an AMC master Excel file and daily task TXT file, calculating client-wise utilization in the browser, and exporting PDF reports.

The app also supports published source links for refresh-based syncing. A small local proxy server is included so published Google Sheets and Google Docs can be fetched without browser CORS issues.

## Stack

- HTML
- CSS
- Vanilla JavaScript
- [SheetJS](https://sheetjs.com/)
- [jsPDF](https://github.com/parallax/jsPDF)
- [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable)

## Expected Input Files

### AMC Master Excel

Required columns:

- `Client Name`
- `AMC Start Date`
- `AMC End Date`
- `Total AMC Hours Allocated`

Date display values are shown exactly as read from Excel.

### Daily Task TXT

Format:

```txt
Date | Client Name | Task Description | Minutes
```

Examples:

```txt
01-03-2026 | Praj | Homepage banner update |
02-03-2026 | Praj | Server issue fix | 90
```

If minutes are blank, the browser applies the requested smart auto-time rules.

## Usage

1. Run `npm start`.
2. Open `http://localhost:3000` in your browser.
3. Paste the published AMC sheet and task doc links in the `Published Sources` panel. The app will prefill the saved links automatically.
4. Choose a `Report Month` if you want a month-specific report, or leave it blank for all months.
5. Upload the AMC Excel file and daily task TXT file, or refresh the page to let the app fetch saved sources automatically.
6. Click `Generate Report`.
7. Click a client row to view task-level details and export an individual PDF.
8. Use `Generate All Clients Summary PDF` for the overall report.

If your browser supports the File System Access API, use the `Live Watch` buttons in the `Inputs` panel to pick local files that auto-refresh the report whenever you save the XLS/TXT again.

## Published Source Notes

- `Published Sources` stores the published links in `localStorage` so refresh keeps the settings.
- The app accepts full published Google URLs, not just IDs.
- If Google blocks the link, the file needs to be published or shared in a way the proxy can access, or a login-based access flow must be added later.
- The proxy server removes the browser CORS limitation by fetching Google files server-side.

## AMC Expiry Email Alerts

The local server can send a daily Gmail SMTP alert when any AMC end date is within the last 5 days.

Set these environment variables before starting the app:

- `GMAIL_USER` - your Gmail / Google Workspace sender address
- `GMAIL_APP_PASSWORD` - the Gmail app password for SMTP
- `AMC_ALERT_RECIPIENT_EMAIL` - optional fallback recipient if you want the server to prefill one
- `AMC_ALERT_WINDOW_DAYS` - optional, defaults to `5`
- `AMC_ALERT_RUN_HOUR` - optional daily run hour, defaults to `9`
- `AMC_ALERT_RUN_MINUTE` - optional daily run minute, defaults to `0`

The browser saves the active AMC source into the server automatically when `Published Sources` is loaded or saved, so the alert job can read the same source link without changing the UI flow. Set your email address in the new `AMC Alert Recipient Email` field, save the sources once, and the daily check will email that address whenever any AMC end date falls within the last 5 days.

## Offline Notes

- The app is static and performs all calculations client-side.
- A service worker is included to cache the application and CDN libraries after the first successful online load.
- For best offline support, run it from a local server rather than `file://`, because service workers do not register on direct file opens.

## Vercel Deployment

This project can run on Vercel with the UI served statically and the Google Drive proxy / alert endpoints exposed as serverless functions under `api/`.

### Safe deployment notes

- `index.html`, `app.js`, `styles.css`, `sw.js`, and the image assets stay unchanged in behavior.
- The existing local Node server in `server.js` can still be used for local development.
- The serverless alert endpoints accept the current source and email payload from the browser so manual alert checks continue to work.
- Daily email scheduling on Vercel needs an external scheduler or Vercel Cron plus persistent storage. The local file-based scheduler in `server.js` is not a good fit for Vercel because serverless files are ephemeral.

### Typical flow

1. Create a Git repository in this folder.
2. Push it to GitHub.
3. Import the GitHub repo into Vercel.
4. Set these environment variables in Vercel if you want email alerts:
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
   - `AMC_ALERT_RECIPIENT_EMAIL`
   - `AMC_ALERT_WINDOW_DAYS`
5. Deploy first as a preview, verify the report flow, then promote to production.
