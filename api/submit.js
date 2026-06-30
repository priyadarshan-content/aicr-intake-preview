// POST /api/submit
// Receives AICR intake form data â creates Asana task with custom field columns
//                                 â writes row to Google Sheet (via GAS)
//                                 â posts Slack notification to #aicr-intake
//
// Required Vercel env vars:
//   ASANA_ACCESS_TOKEN  â Asana personal access token
//   ASANA_PROJECT_GID   â GID of "AICR Intake Submissions" project (1216104302009748)
//   SLACK_BOT_TOKEN     â Slack bot token (xoxb-...) with chat:write scope

const ASANA_ACCESS_TOKEN  = process.env.ASANA_ACCESS_TOKEN;
const ASANA_PROJECT_GID   = process.env.ASANA_PROJECT_GID;
const ASANA_WORKSPACE_GID = '46608419138132';

// Google Apps Script endpoint â writes to "AICR Intake Questions (Responses)" sheet
const GAS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz8C1hxDK69JKs0mBkZj4SJ7oOw9KS_hwXP4krjpCskGbfdIINuoYIAAld1sk1PVE_NFw/exec';

// Set ONE of these in Vercel env vars:
//   SLACK_WEBHOOK_URL â Incoming Webhook URL (https://hooks.slack.com/services/...)
//   SLACK_BOT_TOKEN   â Bot token (xoxb-...) with chat:write scope
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_BOT_TOKEN   = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID  = 'C0ARNJBP93P'; // #aicr-intake

// Team members to ping on every new submission
const SLACK_PING_USERS = [
  'U0ABL3X68PR',  // Priyadarshan Patel (PP)
  'U09VC21UA77',  // Patrycja Bagrowska
  'U08Q2SA7MHQ'   // Praveen Maloo
];

const PRODUCT_LABEL = {
  custom_research:  'Custom Research',
  synthetic_report: 'Synthetic Report'
};

// ââ Custom field definitions ââââââââââââââââââââââââââââââââââââââââââââââââââ
// On first submission, these are created on the project automatically
// and cached for the lifetime of the Lambda instance.
const FIELD_DEFS = [
  { name: 'Company',       resource_subtype: 'text' },
  { name: 'Contact Email', resource_subtype: 'text' },
  { name: 'Intended Use',  resource_subtype: 'text' },
  {
    name: 'Product Type',
    resource_subtype: 'enum',
    enum_options: [
      { name: 'Custom Research',  color: 'blue',  enabled: true },
      { name: 'Synthetic Report', color: 'green', enabled: true }
    ]
  },
  {
    name: 'Budget',
    resource_subtype: 'enum',
    enum_options: [
      { name: 'Under $25k',    color: 'green',        enabled: true },
      { name: '$25k â $50k',   color: 'yellow-green', enabled: true },
      { name: '$50k â $100k',  color: 'yellow',       enabled: true },
      { name: '$100k â $200k', color: 'orange',       enabled: true },
      { name: '$200k+',        color: 'red',          enabled: true },
      { name: 'Not sure yet',  color: 'cool-gray',    enabled: true }
    ]
  }
];

// Module-level cache â survives warm Lambda re-use between requests
let _fieldGids = null;

// ââ Asana REST helper âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function asana(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      Authorization:  `Bearer ${ASANA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      Accept:         'application/json'
    }
  };
  if (body) opts.body = JSON.stringify({ data: body });
  const r = await fetch(`https://app.asana.com/api/1.0${path}`, opts);
  return r.json();
}

// ââ Ensure custom fields exist on the project âââââââââââââââââââââââââââââââââ
async function ensureCustomFields() {
  if (_fieldGids) return _fieldGids;

  // Fetch existing project custom fields (with enum options)
  const project = await asana(
    `/projects/${ASANA_PROJECT_GID}?opt_fields=` +
    `custom_field_settings.custom_field.gid,` +
    `custom_field_settings.custom_field.name,` +
    `custom_field_settings.custom_field.resource_subtype,` +
    `custom_field_settings.custom_field.type,` +
    `custom_field_settings.custom_field.enum_options`
  );

  const existing = {};
  for (const s of (project.data?.custom_field_settings ?? [])) {
    existing[s.custom_field.name] = s.custom_field;
  }

  const gids = {};

  for (const def of FIELD_DEFS) {
    if (existing[def.name]) {
      // Field already exists on project â use it as-is
      gids[def.name] = existing[def.name];
      continue;
    }

    // ââ Create field in the workspace âââââââââââââââââââââââââââââââââââââ
    const created = await asana('/custom_fields', 'POST', {
      name:             def.name,
      resource_subtype: def.resource_subtype,
      workspace:        ASANA_WORKSPACE_GID
    });

    if (!created.data?.gid) {
      console.error(`[setup] Could not create field "${def.name}":`, JSON.stringify(created));
      continue;
    }

    const fieldGid    = created.data.gid;
    const enumOptions = [];

    // ââ Add enum options individually (most reliable approach) ââââââââââââ
    if (def.enum_options) {
      for (const opt of def.enum_options) {
        const optRes = await asana(`/custom_fields/${fieldGid}/enum_options`, 'POST', {
          name:    opt.name,
          color:   opt.color,
          enabled: true
        });
        if (optRes.data?.gid) {
          enumOptions.push({ gid: optRes.data.gid, name: opt.name });
        }
      }
    }

    // ââ Attach field to project (is_important = show as a column) âââââââââ
    await asana(`/projects/${ASANA_PROJECT_GID}/addCustomFieldSetting`, 'POST', {
      custom_field: fieldGid,
      is_important: true
    });

    gids[def.name] = {
      gid:             fieldGid,
      name:            def.name,
      resource_subtype: def.resource_subtype,
      enum_options:    enumOptions
    };
    console.log(`[setup] Created + attached field "${def.name}" â ${fieldGid}`);
  }

  _fieldGids = gids;
  return gids;
}

// ââ Slack notification ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function postSlackNotification({ company, name, email, productLabel, budgetText, deadlineDate, deadlineFlex, intendedUse, asanaTaskGid }) {
  if (!SLACK_WEBHOOK_URL && !SLACK_BOT_TOKEN) return; // silently skip if not configured

  const dash = (v) => v || 'â';
  const asanaUrl = asanaTaskGid
    ? `https://app.asana.com/0/${ASANA_PROJECT_GID}/${asanaTaskGid}`
    : null;

  const pingText = SLACK_PING_USERS.map(u => `<@${u}>`).join(' ');

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${pingText} :inbox_tray: *New AICR intake response* â *${company || 'Unknown'}*` }
    },
    {
      type: 'header',
      text: { type: 'plain_text', text: 'ð New AICR Intake Request', emoji: true }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Company*\n${dash(company)}` },
        { type: 'mrkdwn', text: `*Product Type*\n${dash(productLabel)}` },
        { type: 'mrkdwn', text: `*Contact*\n${dash(name)}${email ? `\n${email}` : ''}` },
        { type: 'mrkdwn', text: `*Budget*\n${dash(budgetText)}` },
        { type: 'mrkdwn', text: `*Intended Use*\n${dash(intendedUse)}` },
        { type: 'mrkdwn', text: `*Publish Date*\n${deadlineDate ? `${deadlineDate}${deadlineFlex ? ` _(${deadlineFlex})_` : ''}` : 'â'}` }
      ]
    }
  ];

  if (asanaUrl) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View in Asana â', emoji: true },
        url:  asanaUrl,
        style: 'primary'
      }]
    });
  }

  const fallbackText = `${pingText} New AICR intake: ${company || 'Unknown'} â ${productLabel}`;

  try {
    let slackRes;
    if (SLACK_WEBHOOK_URL) {
      // Incoming Webhook (simpler, no channel ID needed)
      slackRes = await fetch(SLACK_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: fallbackText, blocks })
      });
      console.log('[submit] Slack webhook status:', slackRes.status);
    } else {
      // Bot token via Web API
      slackRes = await fetch('https://slack.com/api/chat.postMessage', {
        method:  'POST',
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ channel: SLACK_CHANNEL_ID, text: fallbackText, blocks })
      });
      const slackJson = await slackRes.json();
      console.log('[submit] Slack API response:', JSON.stringify(slackJson));
    }
  } catch (err) {
    // Non-fatal â don't fail the submission if Slack is down
    console.error('[submit] Slack notification error:', err);
  }
}

// ââ Google Sheet writer (non-fatal) ââââââââââââââââââââââââââââââââââââââââââ
async function writeToGoogleSheet(payload) {
  try {
    // GAS accepts a GET request with ?payload=<json>
    // It writes a new row to the Intake Responses sheet and returns { success: true }
    const url = GAS_SCRIPT_URL + '?payload=' + encodeURIComponent(JSON.stringify(payload));
    const r = await fetch(url, { redirect: 'follow' });
    const text = await r.text();
    console.log('[submit] GAS response:', text.slice(0, 200));
  } catch (err) {
    console.error('[submit] Google Sheet write error (non-fatal):', err);
  }
}

// Find enum option GID by label (case-insensitive, whitespace-trimmed)
function enumOptionGid(field, label) {
  if (!field?.enum_options || !label) return null;
  const norm = s => s.trim().toLowerCase();
  return field.enum_options.find(o => norm(o.name) === norm(label))?.gid ?? null;
}

// ââ Main handler âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ASANA_ACCESS_TOKEN || !ASANA_PROJECT_GID) {
    console.error('[submit] Missing ASANA_ACCESS_TOKEN or ASANA_PROJECT_GID env vars');
    return res.status(500).json({ error: 'Asana not configured' });
  }

  const {
    company, name, email, g2Profile, stakeholders,
    intendedUse, productType,
    // Custom Research fields
    researchAngle, sampleSize, geographies, respondentProfile, respondentMore,
    seniority, researchDepth, interviewTargets, researchTopics,
    deliveryTier, aeoAddon,
    customReportFormat, customAddons,
    caseStudyInterviews, caseStudySeniority,
    // Synthetic Report fields
    synthCategory, synthAngle, synthPersona, analysisLens,
    synthReportFormat, synthAddons,
    // Common fields
    description,
    engagementType, cadence,
    goals, budgetText, budget,
    deadlineDate, deadline, deadlineFlex, deadlineFlexibility,
    reportFormat,
    submittedAt
  } = req.body;

  const productLabel    = PRODUCT_LABEL[productType] || productType || '';
  const geosStr         = (geographies  || []).join(', ');
  const goalsStr        = (goals        || []).join(', ');
  const analysisLensStr = (analysisLens || []).join('; ');

  // ââ Task notes (full detail in description) âââââââââââââââââââââââââââââââ
  const line = (label, value) => value ? `${label}: ${value}` : null;

  const customSection = productType === 'custom_research' ? [
    line('Research Angle / Topics', researchAngle),
    line('Sample Size',             sampleSize ? `${sampleSize} respondents` : null),
    line('Geographies',             geosStr),
    line('Respondent Profile',      respondentProfile),
    line('Respondent Detail',       respondentMore),
    line('Report Format',           customReportFormat),
    line('Add-ons',                 (customAddons || []).join(', '))
  ].filter(Boolean).join('\n') : [
    line('G2 Category / Product',   synthCategory),
    line('Research Angle / Topics', synthAngle),
    line('Target Persona',          synthPersona),
    line('Analysis Lens',           analysisLensStr),
    line('Report Format',           synthReportFormat),
    line('Add-ons',                 (synthAddons || []).join(', '))
  ].filter(Boolean).join('\n');

  const taskNotes = [
    `ââ CONTACT ââ`,
    line('Company',      company),
    line('Contact',      [name, email ? `<${email}>` : null].filter(Boolean).join('  ')),
    line('G2 Profile',   g2Profile),
    line('Stakeholders', stakeholders),
    '',
    `ââ REQUEST ââ`,
    line('Intended Use', intendedUse),
    line('Product Type', productLabel),
    '',
    customSection,
    '',
    `ââ GOALS & CONTEXT ââ`,
    line('Goals',  goalsStr),
    line('Budget', budgetText),
    deadlineDate
      ? `Publish Date: ${deadlineDate}${deadlineFlex ? ` (${deadlineFlex})` : ''}`
      : null,
    '',
    `Submitted: ${new Date(submittedAt || Date.now()).toLocaleString('en-US', {
      timeZone:  'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short'
    })} CT`
  ].filter(v => v !== null).join('\n');

  const taskName = `[AICR] ${company || 'Unknown'} â ${productLabel}`;

  // ââ Ensure custom fields exist on the project âââââââââââââââââââââââââââââ
  let fields = {};
  try {
    fields = await ensureCustomFields();
  } catch (err) {
    // Non-fatal: task will still be created, just without column values
    console.error('[submit] ensureCustomFields error:', err);
  }

  // ââ Map form values â Asana custom_fields ââââââââââââââââââââââââââââââââ
  const custom_fields = {};

  const setText = (fieldName, value) => {
    const f = fields[fieldName];
    if (f?.gid && value) custom_fields[f.gid] = value;
  };

  setText('Company',       company);
  setText('Contact Email', email);
  setText('Intended Use',  intendedUse);

  const ptGid = enumOptionGid(fields['Product Type'], productLabel);
  if (ptGid && fields['Product Type']?.gid) custom_fields[fields['Product Type'].gid] = ptGid;

  const budgetGid = enumOptionGid(fields['Budget'], budgetText);
  if (budgetGid && fields['Budget']?.gid) custom_fields[fields['Budget'].gid] = budgetGid;

  // ââ Create Asana task âââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const taskData = {
    name:     taskName,
    notes:    taskNotes,
    projects: [ASANA_PROJECT_GID],
    ...(deadlineDate                      ? { due_on: deadlineDate } : {}),
    ...(Object.keys(custom_fields).length ? { custom_fields }        : {})
  };

  let asanaResponse;
  try {
    const r = await fetch('https://app.asana.com/api/1.0/tasks', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${ASANA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept:         'application/json'
      },
      body: JSON.stringify({ data: taskData })
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

  const asanaTaskGid = asanaResponse?.data?.gid ?? null;

  // ââ Write to Google Sheet (non-fatal) ââââââââââââââââââââââââââââââââââââ
  // Field names match GAS writeRow_() exactly
  await writeToGoogleSheet({
    timestamp:           new Date(submittedAt || Date.now()).toISOString(),
    company,
    g2Profile,
    contactName:         name,
    contactEmail:        email,
    stakeholders,
    productType:         productLabel,
    sampleSize,
    seniority:           seniority || respondentProfile || '',
    researchDepth,
    interviewTargets:    interviewTargets || respondentMore || '',
    researchTopics:      researchTopics || researchAngle || '',
    synthCategory,
    synthAngle,
    synthPersona,
    caseStudyInterviews,
    caseStudySeniority,
    geographies:         geosStr,
    deliveryTier,
    aeoAddon,
    reportFormat:        reportFormat || customReportFormat || '',
    goals:               goalsStr,
    description:         description || intendedUse || '',
    engagementType,
    cadence,
    deadline:            deadline || deadlineDate || '',
    deadlineFlexibility: deadlineFlexibility || deadlineFlex || '',
    budget:              budget || budgetText || ''
  });

  // ââ Slack notification (non-fatal) âââââââââââââââââââââââââââââââââââââââ
  await postSlackNotification({
    company, name, email, productLabel, budgetText,
    deadlineDate, deadlineFlex, intendedUse, asanaTaskGid
  });

  return res.status(200).json({ ok: true, asanaTaskGid });
}
