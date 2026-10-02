'use strict';
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
    });
  }
} catch {}

async function sendMail({ to, subject, text, html }) {
  if (!to) return { sent: false, reason: 'no-recipient' };
  if (!transporter) return { sent: false, reason: 'smtp-not-configured' };
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Red Apple <noreply@redapple.digital>',
      to, subject, text, html: html || `<p>${text}</p>`
    });
    return { sent: true };
  } catch (e) {
    console.error('mail error', e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = { sendMail };
