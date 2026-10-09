import type { ChannelEffect } from "./ussd";

export type WhatsAppMessage = {
  id: string;
  from: "customer" | "bot" | "agent";
  text: string;
  at: string;
};

export type WhatsAppReply = {
  replies: string[];
  handoff?: boolean;
  effects?: ChannelEffect[];
};

const greetings = /^(hi|hello|salaam|salam|habari|hey)\b/i;

/**
 * Lightweight WhatsApp care bot for Bimafy.
 * Intent detection is keyword-based for the demo; production uses NLP + CRM.
 */
export function replyWhatsApp(text: string, phone = "+254700000000"): WhatsAppReply {
  const q = text.trim();
  if (!q) return { replies: ["Karibu Bimafy. Type HELP for options."] };

  if (greetings.test(q) || /^help$/i.test(q)) {
    return {
      replies: [
        "Hello. I am Bimafy Care.",
        "You can ask: BALANCE, PAY 200, CLAIM, CERTIFICATE, AGENT, or BUY BODA.",
      ],
    };
  }

  if (/balance|policy|cover|status/i.test(q)) {
    return {
      replies: [
        "Your active covers:",
        "• Hospital Cash Micro - POL-MED-19002 - Active",
        "• Motor Comprehensive - POL-MOT-88421 - Active",
        "Next contribution: KES 200 (weekly).",
      ],
    };
  }

  const payMatch = q.match(/pay\s+(\d+)/i);
  if (payMatch || /^(pay|stk|mpesa)$/i.test(q)) {
    const amount = payMatch ? Number(payMatch[1]) : 200;
    return {
      replies: [
        `M-Pesa collection of KES ${amount} recorded for POL-MED-19002.`,
        "You will receive an SMS receipt shortly.",
      ],
      effects: [
        {
          type: "payment",
          amount,
          phone,
          policyNumber: "POL-MED-19002",
          participantName: "WhatsApp customer",
        },
      ],
    };
  }

  if (/pay|stk|mpesa|contribution|premium/i.test(q)) {
    return {
      replies: [
        "To pay now, reply with PAY 200 or open the app Payments desk.",
        "We will send an M-Pesa STK push to the number on your profile.",
      ],
    };
  }

  if (/^claim\b/i.test(q) || /claim|accident|loss|damage/i.test(q)) {
    const description = q.replace(/^claim\s*/i, "").slice(0, 80) || "WhatsApp FNOL intake";
    return {
      replies: [
        "Claim intake logged from WhatsApp.",
        "An assessor is usually assigned within 24 hours. You can add photos in the app.",
      ],
      effects: [
        {
          type: "claim",
          phone,
          policyNumber: "POL-MOT-88421",
          description,
        },
      ],
    };
  }

  if (/cert|certificate|download/i.test(q)) {
    return {
      replies: [
        "Your latest certificate is ready in Documents.",
        "Open the Bimafy app → Documents, or ask an agent to resend by email.",
      ],
      effects: [
        {
          type: "certificate",
          phone,
          policyNumber: "POL-MOT-88421",
        },
      ],
    };
  }

  if (/buy\s*boda|product|quote|cover options/i.test(q)) {
    return {
      replies: [
        "Boda Micro interest captured. An agent will follow up, or continue on USSD *384*90#.",
        "Popular covers: Boda Micro, Hospital Cash, Motor, Family Takaful.",
      ],
      effects: [
        {
          type: "lead",
          name: `WhatsApp ${phone}`,
          phone,
          productLine: "micro",
          notes: "BUY BODA via WhatsApp care bot",
        },
      ],
    };
  }

  if (/agent|human|officer|call/i.test(q)) {
    return {
      replies: ["Connecting you to a care officer. Average wait under 3 minutes."],
      handoff: true,
      effects: [
        {
          type: "notify",
          channel: "whatsapp",
          title: "Care handoff",
          body: `Customer ${phone} requested a human agent on WhatsApp.`,
        },
      ],
    };
  }

  if (/surplus|shariah|halal/i.test(q)) {
    return {
      replies: [
        "Bimafy supports wakala takaful and conventional books. Surplus may be declared after claims and expenses.",
        "Your FY25 provisional surplus share is shown on Home when available.",
      ],
    };
  }

  return {
    replies: [
      "I did not catch that. Try BALANCE, PAY 200, CLAIM, CERTIFICATE, BUY BODA, or AGENT.",
    ],
  };
}
