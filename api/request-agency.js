import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const RECIPIENT = 'enterprise@stateaffairs.com';
const FROM = process.env.RESEND_FROM || 'Reg Tracker <noreply@stateaffairs.com>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, agency, note } = req.body || {};

  if (!email || !agency) {
    return res.status(400).json({ error: 'email and agency are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid email' });
  }
  if (agency.length > 200 || (note && note.length > 4000)) {
    return res.status(400).json({ error: 'payload too large' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: RECIPIENT,
      replyTo: email,
      subject: `Reg Tracker: agency request — ${agency}`,
      text: [
        `New agency request from the Federal Regulatory Tracker.`,
        ``,
        `Requester: ${email}`,
        `Agency:    ${agency}`,
        ``,
        `Notes:`,
        note?.trim() || '(none)',
      ].join('\n'),
    });

    if (error) {
      return res.status(502).json({ error: error.message || 'send failed' });
    }
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'unknown error' });
  }
}
