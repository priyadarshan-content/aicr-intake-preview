// POST /api/submit
// Receives AICR intake form data → creates Asana task
//
// Required Vercel env vars:
//   ASANA_ACCESS_TOKEN  — Asana personal access token (Settings → Apps → Developer apps)
//   ASANA_PROJECT_GID   — GID from Asana project URL: app.asana.com/0/<GID>/...

const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN;
const ASANA_PROJECT_GID  = process.env.ASANA_PROJECT_GID;

const PRODUCT_LABEL = {
  custom_research:  'Custom Research',
  synthetic_report: 'Synthetic Report'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  const {
    company, name, email, g2Profile, stakeholders,
    intendedUse, productType,
    researchAngle, sampleSize, geographies, respondentProfile, respondentMore,
    customReportFormat, customAddons,
    synthCategory, synthAngle, synthPersona, analysisLens,
    synthReportFormat, synthAddons,
    goals, budgetValue, budgetText, deadlineDate, deadlineFlex,
    submittedAt
  } = body;

  const productLabel    = PRODUCT_LABEL[productType] || productType || '';
  const geosStr         = (geographies || []).join(', ');
  const goalsStr        = (goals       || []).join(', ');
  const addons          = [...(customAddons || []), ...(synthAddons || [])].join(', ');
  const analysisLensStr = (analysisLens || []).join('; ');

  // ── Asana task body ───────────────────────────────────────────────────
  function line(label, value) {
    return value ? `${label}: ${value}` : null;
  }

  const customSection = productType === 'custom_research' ? [
    line('Research Angle / Topics', researchAngle),
    line('Sample Size',      sampleSize ? `${sampleSize} respondents` : null),
    line('Geographies',      geosStr),
    line('Respondent Profile', respondentProfile),
    line('Respondent Detail',  respondentMore),
    line('Report Format',    customReportFormat),
    line('Add-ons',          (customAddons || []).join(', '))
  ].filter(Boolean).join('\n') : [
    line('G2 Category / Product',   synthCategory),
    line('Research Angle / Topics', synthAngle),
    line('Target Persona',          synthPersona),
    line('Analysis Lens',           analysisLensStr),
    line('Report Format',           synthReportFormat),
    line('Add-ons',                 (synthAddons || []).join(', '))
  ].filter(Boolean).join('\n');

  const taskNotes = [
    `━━ CONTACT ━━`,
    line('Company',      company),
    line('Contact',      [name, email ? `<${email}>` : null].filter(Boolean).join('  ')),
    line('G2 Profile',   g2Profile),
    line('Stakeholders', stakeholders),
    '',
    `━━ REQUEST ━━`,
    line('Intended Use', intendedUse),
    line('Product Type', productLabel),
    '',
    customSection,
    '',
    `━━ GOALS & CONTEXT ━━`,
    line('Goals',   goalsStr),
    line('Budget',  budgetText),
    deadlineDate
      ? `Publish Date: ${deadlineDate}${deadlineFlex ? ` (${deadlineFlex})` : ''}`
      : null,
    '',
    `Submitted: ${new Date(submittedAt || Date.now()).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short'
    })} CT`
  ].filter(v => v !== null).join('\n');

  const taskName = `[AICR] ${company || 'Unknown'} — ${productLabel}`;

  // ── POST to Asana ─────────────────────────────────────────────────────
  if (!ASANA_ACCESS_TOKEN || !ASANA_PROJECT_GID) {
    console.error('[submit] Missing ASANA_ACCESS_TOKEN or ASANA_PROJECT_GID env vars');
    return res.status(500).json({ error: 'Asana not configured' });
  }

  let asanaResponse;
  try {
    const r = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        data: {
          name: taskName,
          notes: taskNotes,
          projects: [ASANA_PROJECT_GID]
        }
      })
    });
    asanaResponse = await r.json();
  } catch (err) {
    console.error('[submit] Asana fetch error:', err);
    return res.status(500).json({ error: 'Failed to create Asana task' });
  }

  if (asanaResponse?.errors) {
    console.error('[submit] Asana API error:', JSON.stringify(asanaResponse.errors));
    return res.status(500).json({ error: 'Asana task creation failed', detail: asanaResponse.errors });
  }

  return res.status(200).json({
    ok: true,
    asanaTaskGid: asanaResponse?.data?.gid ?? null
  });
}
