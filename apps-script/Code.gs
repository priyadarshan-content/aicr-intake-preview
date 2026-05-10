// Google Apps Script — AICR Request-a-Proposal Form → Google Sheets + Slack
//
// SETUP INSTRUCTIONS:
// 1. Open the target Google Sheet
// 2. Extensions → Apps Script
// 3. Paste this entire file, replacing any existing code
// 4. Deploy → Manage deployments → edit pencil → Version: "New version" → Deploy
//    (This keeps the same URL but runs the updated code)
//    If deploying fresh: Deploy → New deployment → Web app → Execute as: Me → Anyone
// 5. Authorize the permissions when prompted
// 6. Set a time-driven trigger on checkForNewResponses (every 1–5 min) to get Slack pings

// ─── Slack config ────────────────────────────────────────────────────────────

var SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';

var PING_USERS = [
  'U09VC21UA77', // Patrycja Bagrowska
  'U08Q2SA7MHQ', // Praveen Maloo
];

// ─── Sheet config ─────────────────────────────────────────────────────────────

var SPREADSHEET_ID = '1iF82FZVmyEICGrtb5uDJrY4y4e-0SYLEwHkcDXZvBXs';
var SHEET_NAME = 'New Intake Form';
var TARGET_SHEET_NAME = SHEET_NAME; // alias used by Slack polling functions

var HEADERS = [
  'Timestamp',
  'Company',
  'G2 Profile',
  'Contact Name',
  'Contact Email',
  'Stakeholders',
  'Product Type',
  'Sample Size',
  'Respondent Seniority',
  'Research Depth',
  'Interview Targets',
  'Research Topics',
  'Synth Category',
  'Synth Angle',
  'Synth Persona',
  'Case Study Interviews',
  'Case Study Seniority',
  'Geographies',
  'Delivery Tier',
  'AEO Add-on',
  'Report Format',
  'Goals',
  'Brief Description',
  'Engagement Type',
  'Cadence',
  'Deadline',
  'Deadline Flexibility',
  'Budget'
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
    d.g2Profile           || '',
    d.contactName         || '',
    d.contactEmail        || '',
    d.stakeholders        || '',
    d.productType         || '',
    d.sampleSize          || '',
    d.seniority           || '',
    d.researchDepth       || '',
    d.interviewTargets    || '',
    d.researchTopics      || '',
    d.synthCategory       || '',
    d.synthAngle          || '',
    d.synthPersona        || '',
    d.caseStudyInterviews || '',
    d.caseStudySeniority  || '',
    d.geographies         || '',
    d.deliveryTier        || '',
    d.aeoAddon            || '',
    d.reportFormat        || '',
    d.goals               || '',
    d.description         || '',
    d.engagementType      || '',
    d.cadence             || '',
    d.deadline            || '',
    d.deadlineFlexibility || '',
    d.budget              || ''
  ]);
}

// ─── Web app endpoints ────────────────────────────────────────────────────────

// Primary entry point — called via JSONP GET from the browser.
// URL parameters survive Google's redirect chain; POST bodies do not.
function doGet(e) {
  var cb = (e.parameter && e.parameter.callback) ? e.parameter.callback : null;
  try {
    if (!e.parameter || !e.parameter.payload) {
      var msg = 'AICR proposal endpoint is live.';
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

// Fallback — POST bodies can be silently dropped by Google's redirect chain.
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

// ─── Slack — old Google Form trigger ─────────────────────────────────────────

function onFormSubmit(e) {
  var named = e.namedValues || {};
  var sheet = e.range.getSheet();
  var ssUrl = sheet.getParent().getUrl();
  var rowNum = e.range.getRow();
  var sheetId = sheet.getSheetId();
  var responseLink = ssUrl + '#gid=' + sheetId + '&range=A' + rowNum;

  var orgName = (
    named['Company'] ||
    named['What is the name of your organization?'] ||
    named['Company (Product - PID)'] ||
    ['Unknown']
  )[0];

  var lines = [];
  for (var q in named) {
    if (q === 'Timestamp') continue;
    var a = (named[q] || []).join(', ').trim();
    if (!a) continue;
    lines.push('*' + q + '*\n' + a);
  }

  var mentions = PING_USERS.map(function(id) { return '<@' + id + '>'; }).join(' ');

  var message =
    mentions + ' :inbox_tray: *New AICR intake response* — *' + orgName + '*\n\n' +
    lines.join('\n\n') +
    '\n\n<' + responseLink + '|View full response in sheet →>';

  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: message })
  });
}

// ─── Slack — new intake form polling (time-driven trigger) ────────────────────

function checkForNewResponses() {
  var ss = SpreadsheetApp.getActive();
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

    var named = {};
    headers.forEach(function(h, i) {
      if (h) named[h] = [rowData[i]];
    });

    sendSlackNotification(named, sheet, row);
  }

  props.setProperty('lastProcessedRow', String(currentLastRow));
}

function sendSlackNotification(named, sheet, rowNum) {
  var ssUrl = sheet.getParent().getUrl();
  var sheetId = sheet.getSheetId();
  var responseLink = ssUrl + '#gid=' + sheetId + '&range=A' + rowNum;

  var orgName = (named['Company'] && named['Company'][0]) || 'Unknown';

  var lines = [];
  for (var q in named) {
    if (q === 'Timestamp') continue;
    var a = String(named[q] || '').trim();
    if (!a) continue;
    lines.push('*' + q + '*\n' + a);
  }

  var mentions = PING_USERS.map(function(id) { return '<@' + id + '>'; }).join(' ');

  var message =
    mentions + ' :inbox_tray: *New AICR intake response* — *' + orgName + '*\n\n' +
    lines.join('\n\n') +
    '\n\n<' + responseLink + '|View full response in sheet →>';

  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: message })
  });
}

function initializeLastProcessedRow() {
  var ss = SpreadsheetApp.getActive();
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
    payload: JSON.stringify({ text: mentions + ' :white_check_mark: Test message — pings should be active!' })
  });
}
