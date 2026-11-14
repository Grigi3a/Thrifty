'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

class HttpError extends Error {
  constructor(status, message, errors) { super(message); this.status = status; this.errors = errors; }
}
const bad = (m, errors) => new HttpError(400, m, errors);

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  try {
    const [t, s, h] = String(stored).split('$');
    if (t !== 'scrypt') return false;
    const hh = await scrypt(pw, Buffer.from(s, 'hex'), 64);
    const b = Buffer.from(h, 'hex');
    return hh.length === b.length && crypto.timingSafeEqual(hh, b);
  } catch { return false; }
}
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (v, max) => (typeof v === 'string' ? v.replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanText = (v, max) => (typeof v === 'string' ? v.replace(CTRL, '').replace(/\r\n/g, '\n').trim().slice(0, max) : '');
const isEmail = (e) => typeof e === 'string' && e.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const normPhone = (p) => { const d = String(p || '').replace(/[^\d+]/g, ''); const digits = d.replace(/\D/g, ''); return digits.length >= 8 && digits.length <= 15 ? d.slice(0, 20) : ''; };
const int = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : NaN; };

const buckets = new Map();
function rateLimit(name, max, windowMs, keyFn) {
  return (req, res, next) => {
    const k = name + ':' + (keyFn ? keyFn(req) : req.ip);
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(k, b); }
    b.n++;
    if (b.n > max) {
      res.set('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
      return res.status(429).json({ error: 'rate', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    }
    next();
  };
}
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (b.reset < n) buckets.delete(k); }, 60000).unref();

let transporter = null;
function mailer() {
  if (transporter !== null) return transporter;
  transporter = false;
  if (process.env.SMTP_URL) {
    try { transporter = require('nodemailer').createTransport(process.env.SMTP_URL); }
    catch (e) { console.error('nodemailer indisponible :', e.message); }
  }
  return transporter;
}
async function sendMail(to, subject, text) {
  const t = mailer();
  if (!t) { console.log(`[e-mail non configuré] à ${to} : ${subject}\n${text}\n`); return false; }
  try { await t.sendMail({ from: process.env.MAIL_FROM || 'Thrifty <no-reply@localhost>', to, subject, text }); return true; }
  catch (e) { console.error('Envoi e-mail échoué :', e.message); return false; }
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csvCell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

module.exports = { HttpError, bad, hashPassword, verifyPassword, sha, token, norm, clean, cleanText, isEmail, normPhone, int, rateLimit, sendMail, esc, csvCell };
