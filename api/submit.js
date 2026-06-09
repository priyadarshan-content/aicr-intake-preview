// Routes AICR intake form submissions → n8n
// n8n handles: Google Sheets append + email notification to ppatel3@g2.com

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL || 'https://n8n.g2.com/webhook/aicr-intake';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json().catch(() => ({ success: response.ok }));
    return res.status(response.ok ? 200 : 500).json(data);
  } catch (err) {
    console.error('n8n webhook forward failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
