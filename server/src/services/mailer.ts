import { Resend } from 'resend';
import { config } from '../config.js';

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

export async function sendMagicLink(to: string, link: string, tenantName: string) {
  if (!resend) {
    if (!config.isTest) console.log(`\n[mailer] Magic link para ${to}:\n${link}\n`);
    return { delivered: false };
  }
  await resend.emails.send({
    from: config.mailFrom,
    to,
    subject: `Seu acesso ao ${tenantName}`,
    html: `<p>Olá! Clique para entrar no <b>${tenantName}</b>:</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Entrar</a></p>
<p style="color:#666;font-size:13px">O link vale por ${config.magicLinkMinutes} minutos. Se você não pediu, ignore este e-mail.</p>`,
  });
  return { delivered: true };
}
