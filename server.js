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

// Claude proxy — routes Claude API calls through server to work on mobile
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

// Gas Safe Register search
app.get('/gassafe/search', async (req, res) => {
  try {
    const postcode = (req.query.postcode || '').trim();
    const distance = req.query.distance || '10';
    if (!postcode) return res.status(400).json({ error: 'No postcode provided' });

    const url = `https://www.gassafe.co.uk/find-an-engineer/search-results?postcode=${encodeURIComponent(postcode)}&distance=${distance}&workType=gas`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Referer': 'https://www.gassafe.co.uk/find-an-engineer'
      }
    });

    const html = await r.text();
    console.log('Gas Safe status:', r.status, 'HTML length:', html.length);

    // Parse engineer cards from HTML
    const engineers = [];

    // Try to extract engineer listing blocks
    const blocks = html.split(/class="[^"]*engineer[^"]*"/i);
    
    // Extract all business names
    const nameReg = /(?:business-name|engineer-name|company-name|h2|h3)[^>]*>([^<]{3,80})</gi;
    const regReg = /(?:registration|reg\.?\s*no\.?|gas\s*safe\s*no\.?)[^>]*>?\s*:?\s*([0-9]{5,7})/gi;
    const phoneReg = /(?:tel|phone|telephone|mob)[^>]*>\s*([0-9][0-9\s\-\(\)]{8,15})/gi;
    const addressReg = /(?:address|location)[^>]*>([^<]{5,100})</gi;

    const names = [...html.matchAll(nameReg)].map(m=>m[1].trim()).filter(n=>n.length>2&&n.length<80);
    const regs = [...html.matchAll(regReg)].map(m=>m[1].trim());
    const phones = [...html.matchAll(phoneReg)].map(m=>m[1].trim());

    names.slice(0,20).forEach((name,i) => {
      if (name && !name.toLowerCase().includes('script') && !name.toLowerCase().includes('function')) {
        engineers.push({
          name,
          gasSafe: regs[i] || '',
          phone: phones[i] || '',
          source: 'Gas Safe Register'
        });
      }
    });

    res.json({ 
      engineers, 
      status: r.status, 
      htmlLength: html.length,
      raw: html.substring(0, 3000) // first 3000 chars for debugging
    });
  } catch(e) {
    console.error('Gas Safe error:', e.message);
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
