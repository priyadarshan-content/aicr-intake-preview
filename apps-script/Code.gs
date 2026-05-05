// Google Apps Script — AICR Intake Form → Google Sheets
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
// 7. Paste it as the SCRIPT_URL value in index.html

var SPREADSHEET_ID = '1iF82FZVmyEICGrtb5uDJrY4y4e-0SYLEwHkcDXZvBXs';
var SHEET_NAME = 'New Intake Form';

var HEADERS = [
  'Timestamp',
  'Organization',
  'G2 Profile Link(s)',
  'Contact Name',
  'Contact Email',
  'Key Stakeholders',
  'Research Purpose',
  'Research Topics',
  'Key Insights Sought',
  'Target Audience',
  'Geographies',
  'Exclusions',
  'Panel Sourcing',
  'Competitive Benchmarking',
  'Competitors',
  'Panel Size',
  'Respondent Seniority',
  'Interview Length',
  'Report Format(s)',
  'Add-ons',
  'Analytical Lenses',
  'Branding',
  'G2 Assets Integration',
  'Writing Lead',
  'Target Delivery Date',
  'Timeline Flexibility',
  'Estimated Total ($)'
];

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length)
        .setFontWeight('bold')
        .setBackground('#5A39A2')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    var raw = (e.parameter && e.parameter.payload) ? e.parameter.payload : e.postData.contents;
    var data = JSON.parse(raw);

    sheet.appendRow([
      data.timestamp         || '',
      data.orgName           || '',
      data.g2Links           || '',
      data.contactName       || '',
      data.contactEmail      || '',
      data.stakeholders      || '',
      data.purpose           || '',
      data.topics            || '',
      data.insights          || '',
      data.audience          || '',
      data.geographies       || '',
      data.exclusions        || '',
      data.panelSourcing     || '',
      data.competitive       || '',
      data.competitors       || '',
      data.panelSize ? String(data.panelSize) : '',
      data.seniority         || '',
      data.interviewLength   || '',
      (data.reportFormat || []).join(', '),
      (data.addons       || []).join(', '),
      (data.lenses       || []).join(', '),
      data.branding          || '',
      data.g2Assets          || '',
      data.writingLead       || '',
      data.targetDate        || '',
      data.flexibility       || '',
      data.estimatedTotal    || ''
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

// Allows testing from the Apps Script editor via doGet
function doGet() {
  return ContentService
    .createTextOutput('AICR intake endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}
