const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// Allow requests from your Netlify app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const APOLLO_KEY = process.env.APOLLO_API_KEY;

// People search
app.post('/apollo/search', async (req, res) => {
  try {
    const r = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_KEY,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// People enrich — gets emails and phones (uses credits)
app.post('/apollo/enrich', async (req, res) => {
  try {
    const r = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_KEY,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({ ...req.body, reveal_personal_emails: true, reveal_phone_number: true })
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT || 3000, () => console.log('Apollo proxy running'));
