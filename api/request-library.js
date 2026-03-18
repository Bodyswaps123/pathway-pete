export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_TOKEN;
  const RESEND_KEY    = process.env.RESEND_API_KEY;
  const FROM_EMAIL    = process.env.FROM_EMAIL || 'pete@bodyswaps.co';
  const TEAM_EMAILS   = (process.env.TEAM_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

  const hubHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${HUBSPOT_TOKEN}`
  };

  try {
    const { firstName, lastName, email, org, jobRole, industry, pathwayTitle, pathwayDescription, units } = req.body;

    // ── 1. Find contact and update library request properties ──
    const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: hubHeaders,
      body: JSON.stringify({
        filterGroups: [{
          filters: [{ propertyName: 'email', operator: 'EQ', value: email }]
        }],
        properties: ['email', 'pathway_pete_library_request_count']
      })
    });

    const searchData = await searchRes.json();
    const contact = searchData.results?.[0];

    if (contact) {
      const currentCount = parseInt(contact.properties?.pathway_pete_library_request_count || '0', 10);
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: hubHeaders,
        body: JSON.stringify({
          properties: {
            pathway_pete_library_request_date:  new Date().toISOString().split('T')[0],
            pathway_pete_library_request_count: String(currentCount + 1),
          }
        })
      });
    }

    // ── 2. Build unit rows for email ───────────────────────────
    const typeColors = {
      Module:        { bg: '#E6F1FB', color: '#185FA5' },
      Exercise:      { bg: '#E1F5EE', color: '#0F6E56' },
      Simulator:     { bg: '#FAEEDA', color: '#854F0B' },
      Quiz:          { bg: '#EEEDFE', color: '#534AB7' },
      Questionnaire: { bg: '#FCEBEB', color: '#A32D2D' },
    };

    const unitRows = (units || []).map((u, i) => {
      const tc = typeColors[u.type] || typeColors.Module;
      const simFields = (u.type === 'Simulator' && u.simulatorFields) ? `
        <tr>
          <td colspan="4" style="padding: 0 12px 10px 36px;">
            <div style="background: #FAEEDA30; border: 1px solid #FAEEDA; border-radius: 8px; padding: 10px 12px; font-size: 12px;">
              ${u.simulatorFields.scenario ? `<p style="margin: 0 0 4px;"><strong>Scenario:</strong> ${u.simulatorFields.scenario}</p>` : ''}
              ${u.simulatorFields.roles ? `<p style="margin: 0 0 4px;"><strong>Roles:</strong> ${u.simulatorFields.roles}</p>` : ''}
              ${u.simulatorFields.learnerInstructions ? `<p style="margin: 0;"><strong>Instructions:</strong> ${u.simulatorFields.learnerInstructions}</p>` : ''}
            </div>
          </td>
        </tr>` : '';

      return `
        <tr style="border-bottom: 1px solid #e2e6ed;">
          <td style="padding: 10px 12px; font-size: 13px; color: #5a6475; width: 24px;">${i + 1}</td>
          <td style="padding: 10px 12px;">
            <span style="background: ${tc.bg}; color: ${tc.color}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px;">${u.type}</span>
          </td>
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #0C1723;">${u.name || u.title || ''}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #5a6475;">${u.duration || ''}</td>
        </tr>
        ${simFields}`;
    }).join('');

    const totalDuration = (units || []).reduce((acc, u) => {
      const mins = parseInt((u.duration || '0').replace(/[^0-9]/g, ''), 10) || 0;
      return acc + mins;
    }, 0);

    // ── 3. Build team email HTML ───────────────────────────────
    const teamHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F6F8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:#1B3148;padding:24px 32px;">
            <p style="color:#E58305;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 6px;">Pathway Pete · Library Request</p>
            <h1 style="color:white;font-size:20px;font-weight:800;margin:0;">New pathway request 🗺️</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e6ed;border-radius:10px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#F5F6F8;">
                <td colspan="2" style="padding:10px 14px;font-size:11px;font-weight:700;color:#5a6475;text-transform:uppercase;letter-spacing:0.05em;">Contact details</td>
              </tr>
              <tr><td style="padding:8px 14px;font-size:13px;color:#5a6475;border-top:1px solid #e2e6ed;width:130px;">Name</td><td style="padding:8px 14px;font-size:13px;font-weight:600;border-top:1px solid #e2e6ed;">${firstName} ${lastName}</td></tr>
              <tr><td style="padding:8px 14px;font-size:13px;color:#5a6475;border-top:1px solid #e2e6ed;">Email</td><td style="padding:8px 14px;font-size:13px;font-weight:600;border-top:1px solid #e2e6ed;"><a href="mailto:${email}" style="color:#E58305;">${email}</a></td></tr>
              <tr><td style="padding:8px 14px;font-size:13px;color:#5a6475;border-top:1px solid #e2e6ed;">Organisation</td><td style="padding:8px 14px;font-size:13px;font-weight:600;border-top:1px solid #e2e6ed;">${org || '—'}</td></tr>
              <tr><td style="padding:8px 14px;font-size:13px;color:#5a6475;border-top:1px solid #e2e6ed;">Job role</td><td style="padding:8px 14px;font-size:13px;font-weight:600;border-top:1px solid #e2e6ed;">${jobRole || '—'}</td></tr>
              <tr><td style="padding:8px 14px;font-size:13px;color:#5a6475;border-top:1px solid #e2e6ed;">Industry</td><td style="padding:8px 14px;font-size:13px;font-weight:600;border-top:1px solid #e2e6ed;">${industry || '—'}</td></tr>
            </table>

            <div style="background:#F5F6F8;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
              <p style="color:#E58305;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 4px;">Requested pathway</p>
              <h2 style="color:#0C1723;font-size:17px;font-weight:800;margin:0 0 6px;">${pathwayTitle || 'Untitled'}</h2>
              ${pathwayDescription ? `<p style="color:#5a6475;font-size:13px;line-height:1.5;margin:0;">${pathwayDescription}</p>` : ''}
            </div>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e6ed;border-radius:10px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background:#F5F6F8;">
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#5a6475;text-transform:uppercase;">#</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#5a6475;text-transform:uppercase;">Type</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#5a6475;text-transform:uppercase;">Unit</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#5a6475;text-transform:uppercase;">Duration</th>
                </tr>
              </thead>
              <tbody>${unitRows}</tbody>
              <tfoot>
                <tr style="background:#F5F6F8;">
                  <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:#0C1723;">${(units||[]).length} units total</td>
                  <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#0C1723;">${totalDuration} mins</td>
                </tr>
              </tfoot>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#F5F6F8;padding:20px 32px;border-top:1px solid #e2e6ed;">
            <p style="color:#5a6475;font-size:12px;margin:0;">Pathway Pete · ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // ── 4. Send to all team members via Resend ─────────────────
    if (TEAM_EMAILS.length > 0 && RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_KEY}`
        },
        body: JSON.stringify({
          from: `Pathway Pete <${FROM_EMAIL}>`,
          to: TEAM_EMAILS,
          subject: `🗺️ Library request — ${pathwayTitle || 'New pathway'} (${org || email})`,
          html: teamHtml
        })
      });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('request-library error:', err);
    return res.status(200).json({ ok: true, warning: String(err.message) });
  }
}
