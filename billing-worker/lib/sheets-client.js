'use strict';

// Sheets client used by jobs/dashboard-sync.js to write the operator
// dashboard. Authenticates via Application Default Credentials — on Cloud
// Run that means the runtime service account's identity is used directly.
// The target Sheet (SHEETS_DASHBOARD_ID env var) must be shared with that
// SA as Editor.

const { google } = require('googleapis');

let _sheets = null;

async function getSheets() {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

// Ensure a tab exists; returns its sheetId for batchUpdate range refs.
async function ensureTab(spreadsheetId, title) {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = meta.data.sheets.find((s) => s.properties.title === title);
  if (found) return found.properties.sheetId;
  const added = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return added.data.replies[0].addSheet.properties.sheetId;
}

// Replace a tab's contents with `rows` (first row should be the header).
// Clears existing values first so removed rows don't linger.
async function writeTab(spreadsheetId, title, rows) {
  await ensureTab(spreadsheetId, title);
  const sheets = await getSheets();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${title}!A:ZZ` });
  if (!rows || rows.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

module.exports = { getSheets, ensureTab, writeTab };
