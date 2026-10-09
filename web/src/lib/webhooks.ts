import { platformStore } from "./store";
import type { WebhookDelivery } from "./types";

export const DEFAULT_WEBHOOK_URL = "https://partner.example/webhooks/bimafy";

export function enqueueWebhook(event: string, payload: Record<string, unknown>, url = DEFAULT_WEBHOOK_URL) {
  const row: WebhookDelivery = {
    id: `wh-${crypto.randomUUID().slice(0, 8)}`,
    event,
    url,
    status: "delivered",
    payload,
    createdAt: new Date().toISOString(),
  };
  platformStore.addWebhook(row);
  return row;
}

export function retryWebhook(id: string) {
  platformStore.updateWebhook(id, { status: "delivered", createdAt: new Date().toISOString() });
}
