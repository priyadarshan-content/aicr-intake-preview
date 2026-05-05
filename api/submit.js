const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'New Intake Form';

const HEADERS = [
  'Timestamp', 'Company', 'G2 Profile', 'Contact Name', 'Contact Email',
  'Stakeholders', 'Product Type', 'Sample Size', 'Respondent Seniority',
  'Research Depth', 'Interview Targets', 'Research Topics',
  'Synth Category', 'Synth Angle', 'Synth Persona',
  'Case Study Interviews', 'Case Study Seniority',
  'Geographies', 'Delivery Tier', 'AEO Add-on', 'Report Format',
  'Goals', 'Brief Description', 'Engagement Type', 'Cadence',
  'Deadline', 'Deadline Flexibility'
];

async function getSheet() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const d = req.body;
    const sheets = await getSheet();

    const meta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:A1`,
    }).catch(() => null);

    const hasHeaders = meta?.data?.values?.length > 0;
    const rows = [];
    if (!hasHeaders) rows.push(HEADERS);

    rows.push([
      d.timestamp            || '',
      d.company              || '',
      d.g2Profile            || '',
      d.contactName          || '',
      d.contactEmail         || '',
      d.stakeholders         || '',
      d.productType          || '',
      d.sampleSize           || '',
      d.seniority            || '',
      d.researchDepth        || '',
      d.interviewTargets     || '',
      d.researchTopics       || '',
      d.synthCategory        || '',
      d.synthAngle           || '',
      d.synthPersona         || '',
      d.caseStudyInterviews  || '',
      d.caseStudySeniority   || '',
      d.geographies          || '',
      d.deliveryTier         || '',
      d.aeoAddon             || '',
      d.reportFormat         || '',
      d.goals                || '',
      d.description          || '',
      d.engagementType       || '',
      d.cadence              || '',
      d.deadline             || '',
      d.deadlineFlexibility  || '',
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sheet write failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
