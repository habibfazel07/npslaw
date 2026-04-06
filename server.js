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
    const details = req.body.details || [];
    const results = [];
    for (const person of details.slice(0, 5)) {
      try {
        const r = await fetch('https://api.apollo.io/api/v1/people/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_KEY, 'Cache-Control': 'no-cache' },
          body: JSON.stringify({ id: person.id, reveal_personal_emails: true, reveal_phone_number: true })
        });
        const data = await r.json();
        if (r.ok && data.person) {
          console.log('Person match:', data.person.name, 'email:', data.person.email, 'phone:', data.person.sanitized_phone);
          results.push(data.person);
        } else {
          console.log('Person match failed:', r.status, JSON.stringify(data).substring(0,150));
        }
      } catch(e) { console.warn('Person match error:', e.message); }
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`Enrich complete: ${results.length} enriched`);
    res.json({ matches: results, people: results });
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
    console.log('Org search:', r.status, JSON.stringify(data).substring(0, 300));
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/ch/search', async (req, res) => {
  try {
    const q = req.query.q;
    const key = CH_KEY || req.headers['x-ch-key'];
    if (!key) return res.status(400).json({ error: 'No Companies House API key' });
    const r = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=5`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64') }
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/ch/officers/:companyNumber', async (req, res) => {
  try {
    const key = CH_KEY || req.headers['x-ch-key'];
    if (!key) return res.status(400).json({ error: 'No Companies House API key' });
    const r = await fetch(`https://api.company-information.service.gov.uk/company/${req.params.companyNumber}/officers?items_per_page=10`, {
      headers: { 'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64') }
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'ok', apollo: APOLLO_KEY ? 'set' : 'missing', ch: CH_KEY ? 'set' : 'missing' }));

app.listen(process.env.PORT || 3000, () => console.log('NPS proxy running'));
