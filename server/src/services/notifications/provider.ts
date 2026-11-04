export type NotificationType =
  | 'balance_reminder' | 'mission_new' | 'mission_validated' | 'mission_rejected'
  | 'recognition_received' | 'cycle_ending' | 'cycle_closed' | 'achievement' | 'wheel_winner';

export interface OutgoingNotification {
  id: string;
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string | null;
  payload: Record<string, unknown>;
}

export interface SendResult { delivered: boolean; error?: string }

/**
 * Contrato de canal. Hoje: Web Push. Futuro: WhatsApp (Evolution API), e-mail...
 * Cada provider decide como localizar o destino (subscriptions, telefone) a partir do userId.
 */
export interface NotificationProvider {
  readonly channel: string;
  send(n: OutgoingNotification): Promise<SendResult>;
}
