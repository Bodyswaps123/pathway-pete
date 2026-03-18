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
    const {
      firstName, lastName, email, org, jobRole,
      industry, pathwayTitle, pathwaySummary, units
    } = req.body;

    // ── Build unit list for note ──────────────────────────────
    const unitLines = (units || []).map((u, i) =>
      `  ${i + 1}. [${u.type}] ${u.name || u.title || 'Untitled'} (${u.duration || '?'})`
    ).join('\n');

    const unitCount = (units || []).length;

    // ── Upsert contact + write Pathway Pete properties ────────
    const upsertRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: [{
          idProperty: 'email',
          id: email,
          properties: {
            // Standard properties
            firstname: firstName || '',
            lastname:  lastName  || '',
            email:     email     || '',
            company:   org       || '',
            jobtitle:  jobRole   || '',

            // Pathway Pete properties
            pathway_pete_last_title:          pathwayTitle || '',
            pathway_pete_last_industry:       industry     || '',
            pathway_pete_last_generated_date: new Date().toISOString().split('T')[0],
            pathway_pete_last_unit_count:     String(unitCount),
          }
        }]
      })
    });

    const upsertData = await upsertRes.json();
    const contactId = upsertData.results?.[0]?.id;
    if (!contactId) return res.status(200).json({ ok: true, warning: 'No contact ID' });

    // ── Increment pathway count ───────────────────────────────
    // Fetch current count first, then increment
    const contactRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=pathway_pete_count`,
      { headers }
    );
    const contactData = await contactRes.json();
    const currentCount = parseInt(contactData.properties?.pathway_pete_count || '0', 10);
    const newCount = currentCount + 1;

    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        properties: { pathway_pete_count: String(newCount) }
      })
    });

    // ── Create rich note ──────────────────────────────────────
    const noteBody = [
      `🗺️ PATHWAY PETE — PATHWAY #${newCount} GENERATED`,
      ``,
      `CONTACT`,
      `  Name:         ${firstName} ${lastName}`,
      `  Organisation: ${org || '—'}`,
      `  Job role:     ${jobRole || '—'}`,
      `  Industry:     ${industry || '—'}`,
      ``,
      `PATHWAY`,
      `  Title:        ${pathwayTitle || 'Untitled'}`,
      `  Units:        ${unitCount}`,
      `  Generated:    ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
      ``,
      `UNITS`,
      unitLines || '  No units available',
      ``,
      `─────────────────────────────────`,
      `Submitted via Bodyswaps Pathway Pete`,
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

    return res.status(200).json({ ok: true, pathwayCount: newCount });

  } catch (err) {
    console.error('submit-lead error:', err);
    return res.status(200).json({ ok: true, warning: String(err.message) });
  }
}
