import webpush from 'web-push';
import { config } from '../../config.js';
import { query } from '../../db.js';
import type { NotificationProvider, OutgoingNotification, SendResult } from './provider.js';

export class WebPushProvider implements NotificationProvider {
  readonly channel = 'web_push';
  private configured: boolean;

  constructor() {
    this.configured = !!(config.vapid.publicKey && config.vapid.privateKey);
    if (this.configured) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  }

  async send(n: OutgoingNotification): Promise<SendResult> {
    if (!this.configured) return { delivered: false, error: 'push_not_configured' };
    const subs = await query(`select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1 and revoked_at is null`, [n.userId]);
    if (!subs.length) return { delivered: false, error: 'no_subscription' };
    const payload = JSON.stringify({ id: n.id, title: n.title, body: n.body, url: `${config.frontendUrl}${n.deepLink ?? '/'}`, type: n.type });
    let delivered = 0; let lastError: string | undefined;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        delivered++;
      } catch (e: any) {
        lastError = String(e?.statusCode ?? e?.message);
        if (e?.statusCode === 404 || e?.statusCode === 410) await query(`update push_subscriptions set revoked_at = now() where id = $1`, [s.id]);
      }
    }));
    return { delivered: delivered > 0, error: delivered ? undefined : lastError };
  }
}
