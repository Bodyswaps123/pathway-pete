export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.HUBSPOT_PRIVATE_TOKEN;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`
  };

  try {
    const { email, pathwayTitle } = req.body;

    // Find contact by email
    const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filterGroups: [{
          filters: [{ propertyName: 'email', operator: 'EQ', value: email }]
        }],
        properties: ['email', 'pathway_pete_library_request_count']
      })
    });

    const searchData = await searchRes.json();
    const contact = searchData.results?.[0];
    if (!contact) return res.status(200).json({ ok: true, warning: 'Contact not found' });

    const contactId = contact.id;
    const currentCount = parseInt(contact.properties?.pathway_pete_library_request_count || '0', 10);
    const newCount = currentCount + 1;

    // Update the two library request properties
    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        properties: {
          pathway_pete_library_request_date:  new Date().toISOString().split('T')[0],
          pathway_pete_library_request_count: String(newCount),
        }
      })
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('request-library error:', err);
    return res.status(200).json({ ok: true, warning: String(err.message) });
  }
}
