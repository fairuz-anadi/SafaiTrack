/**
 * WhatsApp intake — the municipal WhatsApp Business number as a reporting
 * channel.
 *
 * Meta's WhatsApp Business Cloud API delivers every message sent to the
 * municipal number as a webhook POST to this endpoint, and the same API sends
 * our reply back. The message text goes through exactly the same handler as
 * an SMS, so "BIN W27-B001 FULL" on WhatsApp files the same complaint, with
 * the same tracking code and the same audit trail, tagged `whatsapp`.
 *
 * Connecting a real number needs three values in .env (see .env.example):
 *   WHATSAPP_VERIFY_TOKEN   — any secret you choose; Meta echoes it back when
 *                             verifying the webhook URL
 *   WHATSAPP_TOKEN          — the Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID — the ID of the municipal number
 * Without WHATSAPP_TOKEN the webhook still files the complaint and returns
 * the reply in its own response, which is what the on-screen phone at /phone
 * uses to demonstrate the channel with no Meta account at all.
 */
import { Hono } from "hono";
import { handleInboundMessage } from "./complaints.js";
import type { AppEnv } from "../middleware/auth.js";

export const whatsappRoutes = new Hono<AppEnv>();

/** Meta verifies a webhook URL once, with a GET carrying the shared token. */
whatsappRoutes.get("/intake/whatsapp", c => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) return c.text(challenge, 200);
  return c.text("Verification failed", 403);
});

/**
 * WhatsApp numbers arrive in international form without the plus —
 * "8801911000000" — while every phone in the database is stored the way a
 * resident writes it, "01911000000". Anything that is not a Bangladeshi
 * mobile number is ignored rather than guessed at.
 */
export function normalizeBangladeshiNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}

interface CloudApiMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

/** Pull the text messages out of a Cloud API webhook payload, whatever else it carries. */
export function extractMessages(payload: unknown): { from: string; text: string; id: string }[] {
  const out: { from: string; text: string; id: string }[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const messages = ((change as { value?: { messages?: CloudApiMessage[] } })?.value?.messages) ?? [];
      for (const m of messages) {
        if (m.type !== "text" || !m.from || !m.text?.body) continue;
        out.push({ from: m.from, text: m.text.body, id: m.id ?? "" });
      }
    }
  }
  return out;
}

/** Best effort: a failed reply must never make Meta retry the whole webhook. */
async function sendWhatsAppReply(to: string, body: string): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn("[whatsapp] reply rejected:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.warn("[whatsapp] reply failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

whatsappRoutes.post("/intake/whatsapp", async c => {
  const payload = await c.req.json().catch(() => null);
  const messages = extractMessages(payload);
  const handled: { from: string; ok: boolean; reply: string; complaintCode?: string; delivered: boolean }[] = [];

  for (const m of messages) {
    const from = normalizeBangladeshiNumber(m.from);
    if (!from) {
      handled.push({ from: m.from, ok: false, reply: "Not a Bangladeshi mobile number; ignored.", delivered: false });
      continue;
    }
    const result = await handleInboundMessage({ from, text: m.text.slice(0, 320), channel: "whatsapp" });
    const delivered = await sendWhatsAppReply(m.from, result.body.reply);
    handled.push({ from, ok: result.body.ok, reply: result.body.reply, complaintCode: result.body.complaintCode, delivered });
  }

  // Always 200: Meta re-sends anything else, and a bad message is not a reason
  // to receive it again.
  return c.json({ ok: true, received: messages.length, handled });
});
