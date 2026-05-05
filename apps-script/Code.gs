// Google Apps Script — AICR Request-a-Proposal Form → Google Sheets
//
// SETUP INSTRUCTIONS:
// 1. Open the target Google Sheet
// 2. Extensions → Apps Script
// 3. Paste this entire file, replacing any existing code
// 4. Deploy → Manage deployments → edit pencil → Version: "New version" → Deploy
//    (This keeps the same URL but runs the updated code)
//    If deploying fresh: Deploy → New deployment → Web app → Execute as: Me → Anyone
// 5. Authorize the permissions when prompted

var SPREADSHEET_ID = '1iF82FZVmyEICGrtb5uDJrY4y4e-0SYLEwHkcDXZvBXs';
var SHEET_NAME = 'New Intake Form';

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
  'Deadline Flexibility'
];

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
    d.deadlineFlexibility || ''
  ]);
}

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

// Kept as fallback — POST bodies can be silently dropped by Google's redirect.
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
