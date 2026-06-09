// Vercel Serverless Function: /api/submit.js
// Receives form submissions from aicr-request-proposal.html and saves to Airtable.
//
// Required environment variable in Vercel:
//   AIRTABLE_TOKEN  — your Airtable Personal Access Token

const AIRTABLE_BASE_ID = 'appiqZ5wKKmfzjbME';
const AIRTABLE_TABLE_ID = 'tblklz8UJ7qDuR38c'; // "AICR Form Submissions"

const SENIORITY_MAP    = { users: 'Users', buyers: 'Buyers', vp: 'VP+' };
const DEPTH_MAP        = { quick_pulse: 'Quick Pulse', standard: 'Standard', deep_dive: 'Deep Dive' };
const TIER_MAP         = { standard: 'Standard', custom: 'Custom' };
const ENGAGEMENT_MAP   = { one_time: 'One-time', recurring: 'Recurring' };
const CADENCE_MAP      = { monthly: 'Monthly', quarterly: 'Quarterly', 'semi-annual': 'Semi-annual', annual: 'Annual' };
const FLEX_MAP         = { firm: 'Firm deadline', preferred: 'Preferred date', flexible: 'No hard deadline' };
const BUDGET_MAP       = { under_25k: '< $25K', '25k_75k': '$25K - $75K', over_75k: '$75K+', not_sure: 'Not sure yet' };

function mapField(value, map) {
  if (!value) return undefined;
  return map[value] || value;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  const d = req.body;
  const fields = {};
  const set = (key, val) => { if (val !== undefined && val !== null && val !== '') fields[key] = val; };

  set('Company', d.company);
  set('Contact Name', d.contactName);
  set('Contact Email', d.contactEmail);
  set('Submitted At', d.timestamp || new Date().toISOString());
  set('G2 Profile URL', d.g2Profile);
  set('Stakeholders', d.stakeholders);
  set('Product Type', d.productType);
  set('Interview Targets', d.interviewTargets);
  set('Research Topics', d.researchTopics);
  set('Synth Category', d.synthCategory);
  set('Synth Angle', d.synthAngle);
  set('Synth Persona', d.synthPersona);
  set('Case Study Seniority', d.caseStudySeniority);
  set('Geographies', d.geographies);
  set('AEO Add-on', d.aeoAddon);
  set('Report Format', d.reportFormat);
  set('Goals', d.goals);
  set('Research Focus', d.description);
  set('Admin Notes', d.adminNotes);
  set('Approved By', d.approvedBy);
  set('Deadline', d.deadline);

  if (d.sampleSize) set('Sample Size', parseInt(d.sampleSize, 10));
  if (d.caseStudyInterviews) set('Case Study Interviews', parseInt(d.caseStudyInterviews, 10));

  set('Seniority', mapField(d.seniority, SENIORITY_MAP));
  set('Research Depth', mapField(d.researchDepth, DEPTH_MAP));
  set('Delivery Tier', mapField(d.deliveryTier, TIER_MAP));
  set('Engagement Type', mapField(d.engagementType, ENGAGEMENT_MAP));
  set('Cadence', mapField(d.cadence, CADENCE_MAP));
  set('Deadline Flexibility', mapField(d.deadlineFlexibility, FLEX_MAP));
  set('Budget', mapField(d.budget, BUDGET_MAP));

  try {
    const airtableRes = await fetch(
      'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + AIRTABLE_TABLE_ID,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.json().catch(() => ({}));
      return res.status(500).json({ success: false, error: err && err.error && err.error.message || 'Airtable write failed' });
    }

    return res.status(200).json({ success: true });

  } catch (e) {
    return res.status(500).json({ success: false, error: 'Network error reaching Airtable' });
  }
};
