// Google Apps Script — AICR Creative Brief Form → Google Sheets + Slack
//
// SETUP INSTRUCTIONS:
// 1. Create a new Google Sheet (or add a tab to the existing one)
// 2. Copy the Spreadsheet ID from the URL and paste it into SPREADSHEET_ID below
// 3. Extensions → Apps Script → paste this entire file → Save
// 4. Deploy → New deployment → Web app → Execute as: Me → Anyone → Deploy
// 5. Copy the deployed web app URL → paste into BRIEF_SCRIPT_URL in index.html
// 6. Run initializeLastProcessedRow() once from the Apps Script editor
// 7. Add a time-driven trigger on checkForNewResponses (every 1–5 min) for Slack pings

// ─── Slack config ────────────────────────────────────────────────────────────

var SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';

var PING_USERS = [
  'U09VC21UA77', // Patrycja Bagrowska
  'U08Q2SA7MHQ', // Praveen Maloo
];

// ─── Sheet config ─────────────────────────────────────────────────────────────

var SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
var SHEET_NAME     = 'Creative Brief';
var TARGET_SHEET_NAME = SHEET_NAME;

var HEADERS = [
  'Timestamp',
  'Company',
  'Research Summary',
  'Research Questions',
  'Key Insights',
  'Usage Plans',
  'Audience',
  'Exclusions',
  'Customer Type',
  'Pain Points',
  'Familiarity',
  'Decision Level',
  'Benchmarking',
  'Competitors',
  'Design References',
  'Involvement Level',
  'Deadline',
  'Deadline Flexibility',
  'Milestones',
  'Comms Channel',
  'Blockers',
  'Additional Notes'
];

// ─── Sheet writer (called by doGet / doPost) ──────────────────────────────────

function writeRow_(raw) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#5746B2')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var d = JSON.parse(raw);
  sheet.appendRow([
    d.timestamp           || '',
    d.company             || '',
    d.researchSummary     || '',
    d.researchQuestions   || '',
    d.keyInsights         || '',
    d.usagePlans          || '',
    d.audience            || '',
    d.exclusions          || '',
    d.customerType        || '',
    d.painPoints          || '',
    d.familiarity         || '',
    d.decisionLevel       || '',
    d.benchmarking        || '',
    d.competitors         || '',
    d.designReferences    || '',
    d.involvementLevel    || '',
    d.deadline            || '',
    d.deadlineFlexibility || '',
    d.milestones          || '',
    d.commsChannel        || '',
    d.blockers            || '',
    d.additionalNotes     || ''
  ]);
}

// ─── Web app endpoints ────────────────────────────────────────────────────────

function doGet(e) {
  var cb = (e.parameter && e.parameter.callback) ? e.parameter.callback : null;
  try {
    if (!e.parameter || !e.parameter.payload) {
      var msg = 'AICR creative brief endpoint is live.';
      return cb
        ? ContentService.createTextOutput(cb + '(' + JSON.stringify({ ok: true }) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
        : ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
    }
    writeRow_(e.parameter.payload);
    var result = JSON.stringify({ success: true });
    return cb
      ? ContentService.createTextOutput(cb + '(' + result + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    var result = JSON.stringify({ success: false, error: err.message });
    return cb
      ? ContentService.createTextOutput(cb + '(' + result + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var raw = (e.parameter && e.parameter.payload)
      ? e.parameter.payload
      : (e.postData ? e.postData.contents : null);
    if (!raw) throw new Error('Empty payload');
    writeRow_(raw);
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── Slack polling (time-driven trigger) ─────────────────────────────────────

function checkForNewResponses() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) return;

  var props = PropertiesService.getScriptProperties();
  var lastProcessedRow = parseInt(props.getProperty('lastProcessedRow') || '1');
  var currentLastRow = sheet.getLastRow();

  if (currentLastRow <= lastProcessedRow) return;

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  for (var row = lastProcessedRow + 1; row <= currentLastRow; row++) {
    var rowData = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    if (rowData.every(function(v) { return v === '' || v === null; })) continue;
    sendSlackNotification(headers, rowData, sheet, row);
  }

  props.setProperty('lastProcessedRow', String(currentLastRow));
}

function sendSlackNotification(headers, rowData, sheet, rowNum) {
  var ssUrl = sheet.getParent().getUrl();
  var sheetId = sheet.getSheetId();
  var responseLink = ssUrl + '#gid=' + sheetId + '&range=A' + rowNum;

  var named = {};
  headers.forEach(function(h, i) { if (h) named[h] = rowData[i]; });

  var orgName = named['Company'] || 'Unknown';

  var lines = [];
  for (var col in named) {
    if (col === 'Timestamp') continue;
    var val = String(named[col] || '').trim();
    if (!val) continue;
    lines.push('*' + col + '*\n' + val);
  }

  var mentions = PING_USERS.map(function(id) { return '<@' + id + '>'; }).join(' ');

  var message =
    mentions + ' :pencil: *New AICR creative brief* — *' + orgName + '*\n\n' +
    lines.join('\n\n') +
    '\n\n<' + responseLink + '|View full response in sheet →>';

  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: message })
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initializeLastProcessedRow() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    Logger.log('Sheet not found: ' + TARGET_SHEET_NAME);
    return;
  }
  var lastRow = sheet.getLastRow();
  PropertiesService.getScriptProperties().setProperty('lastProcessedRow', String(lastRow));
  Logger.log('Initialized lastProcessedRow to: ' + lastRow);
}

function testSlack() {
  var mentions = PING_USERS.map(function(id) { return '<@' + id + '>'; }).join(' ');
  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: mentions + ' :white_check_mark: Test message from BriefCode.gs — pings should be active!' })
  });
}
