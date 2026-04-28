const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const APOLLO_KEY = process.env.APOLLO_API_KEY;
const CH_KEY = process.env.CH_API_KEY;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

app.post('/apollo/search', async (req, res) => {
  try {
    const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_KEY, 'Cache-Control': 'no-cache' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    if (!r.ok) console.error('Apollo search error:', r.status, JSON.stringify(data).substring(0,300));
    else console.log('Apollo search ok, people:', (data.people||[]).length);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/apollo/enrich', async (req, res) => {
  try {
    const r = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_KEY, 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ ...req.body, reveal_personal_emails: true })
    });
    const data = await r.json();
    if (!r.ok) console.error('Apollo enrich error:', r.status, JSON.stringify(data).substring(0,300));
    else console.log('Apollo enrich ok, matches:', (data.matches||data.people||[]).length);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/apollo/org-search', async (req, res) => {
  try {
    const r = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_KEY, 'Cache-Control': 'no-cache' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    console.log('Org search:', r.status, JSON.stringify(data).substring(0, 200));
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/ch/search', async (req, res) => {
  try {
    const key = CH_KEY || req.headers['x-ch-key'];
    if (!key) return res.status(400).json({ error: 'No CH key' });
    const r = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(req.query.q)}&items_per_page=5`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64') }
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/ch/officers/:num', async (req, res) => {
  try {
    const key = CH_KEY || req.headers['x-ch-key'];
    if (!key) return res.status(400).json({ error: 'No CH key' });
    const r = await fetch(`https://api.company-information.service.gov.uk/company/${req.params.num}/officers?items_per_page=10`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64') }
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude', async (req, res) => {
  try {
    const key = CLAUDE_KEY || req.headers['x-claude-key'];
    if (!key) return res.status(400).json({ error: 'No Claude API key' });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    if (!r.ok) console.error('Claude error:', r.status, JSON.stringify(data).substring(0,200));
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Gas Safe engineers via Checkatrade search
// Category 88 = Gas Boiler Installation, 187 = Gas Safety Checks CP12
app.get('/gassafe/search', async (req, res) => {
  try {
    const location = (req.query.postcode || '').trim();
    if (!location) return res.status(400).json({ error: 'No location provided' });
    const url = `https://search.checkatrade.com/api/v2/search?query=gas+engineer&location=${encodeURIComponent(location)}&categoryId=88&page=1&pageSize=20`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Origin': 'https://www.checkatrade.com',
        'Referer': 'https://www.checkatrade.com/search?trade=gas-boiler-installation'
      }
    });
    const text = await r.text();
    console.log('Checkatrade search status:', r.status, 'response:', text.substring(0,500));
    try { res.json(JSON.parse(text)); } catch(e) { res.json({ raw: text.substring(0,2000), status: r.status }); }
  } catch(e) {
    console.error('Checkatrade search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({
  status: 'ok',
  apollo: APOLLO_KEY ? 'set' : 'missing',
  ch: CH_KEY ? 'set' : 'missing',
  claude: CLAUDE_KEY ? 'set' : 'missing'
}));

app.listen(process.env.PORT || 3000, () => console.log('NPS proxy running'));
