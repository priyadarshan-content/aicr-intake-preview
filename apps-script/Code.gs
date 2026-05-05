// Google Apps Script — AICR Request-a-Proposal Form → Google Sheets
//
// SETUP INSTRUCTIONS:
// 1. Open the target Google Sheet
// 2. Extensions → Apps Script
// 3. Paste this entire file, replacing any existing code
// 4. Click "Deploy" → "New deployment"
//    - Type: Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Authorize the permissions when prompted
// 6. Copy the Web App URL
// 7. Set that URL as SCRIPT_URL in index.html (search for "SCRIPT_URL")

var SPREADSHEET_ID = '1iF82FZVmyEICGrtb5uDJrY4y4e-0SYLEwHkcDXZvBXs';
var SHEET_NAME = 'New Intake Form';

// Works whether the script is bound to a spreadsheet (via Extensions → Apps Script)
// or standalone. Bound scripts are recommended — open the target sheet,
// go to Extensions → Apps Script, paste this file, and deploy from there.

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

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
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

    // Accepts both form-encoded (?payload=...) and raw JSON body
    var raw = (e.parameter && e.parameter.payload)
      ? e.parameter.payload
      : e.postData.contents;
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

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput('AICR proposal endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}
