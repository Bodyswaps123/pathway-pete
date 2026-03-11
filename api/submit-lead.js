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
    const { firstName, lastName, email, org, jobRole, industry, pathwayTitle, pathwaySummary } = req.body;

    const upsertRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: [{
          idProperty: 'email',
          id: email,
          properties: {
            firstname: firstName || '',
            lastname:  lastName  || '',
            email:     email     || '',
            company:   org       || '',
            jobtitle:  jobRole   || '',
          }
        }]
      })
    });

    const upsertData = await upsertRes.json();
    const contactId = upsertData.results?.[0]?.id;
    if (!contactId) return res.status(200).json({ ok: true, warning: 'No contact ID' });

    const noteBody = [
      `📋 PATHWAY BUILDER SUBMISSION`,
      ``,
      `Title: ${pathwayTitle || 'Untitled pathway'}`,
      `Learner industry: ${industry || 'Not specified'}`,
      `Organisation: ${org || 'Not specified'}`,
      `Requestor: ${firstName} ${lastName}${jobRole ? ` — ${jobRole}` : ''}`,
      ``,
      `── PATHWAY CONTENT ──`,
      pathwaySummary || 'No summary available',
      ``,
      `Submitted via Bodyswaps Pathway Builder`,
    ].join('\n');

    await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          hs_timestamp: String(Date.now()),
          hs_note_body: noteBody,
        },
        associations: [{
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
        }]
      })
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('submit-lead error:', err);
    return res.status(200).json({ ok: true, warning: String(err.message) });
  }
}
