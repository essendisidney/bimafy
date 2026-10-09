export type UssdRequest = {
  sessionId: string;
  phoneNumber: string;
  text: string;
  serviceCode?: string;
};

export type ChannelEffect =
  | {
      type: "payment";
      amount: number;
      phone: string;
      policyNumber?: string;
      participantName?: string;
    }
  | {
      type: "lead";
      name: string;
      phone: string;
      productLine: "micro" | "motor" | "medical";
      notes: string;
    }
  | {
      type: "claim";
      phone: string;
      policyNumber: string;
      description: string;
    }
  | {
      type: "certificate";
      phone: string;
      policyNumber?: string;
    }
  | {
      type: "notify";
      title: string;
      body: string;
      channel: "sms" | "whatsapp";
    };

export type UssdResponse = {
  sessionId: string;
  phoneNumber: string;
  type: "CON" | "END";
  message: string;
  effects?: ChannelEffect[];
};

function parts(text: string) {
  return text
    .split("*")
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Bimafy USSD shortcode flow (*384*90#).
 * CON = continue, END = terminate (Africa's Talking convention).
 * Effects are applied by the console simulator / PAS webhook adapter.
 */
export function handleUssd(req: UssdRequest): UssdResponse {
  const steps = parts(req.text);
  const phone = req.phoneNumber;

  if (steps.length === 0) {
    return reply(req, "CON", [
      "Bimafy",
      "1. Buy boda cover",
      "2. Pay contribution",
      "3. Check policy",
      "4. File claim",
      "5. Agent help",
      "0. Exit",
    ]);
  }

  const [a, b, c] = steps;

  if (a === "0") return reply(req, "END", ["Asante. Bimafy — one platform, every workflow."]);

  if (a === "1") {
    if (!b) {
      return reply(req, "CON", [
        "Boda Micro - daily KES 30",
        "1. Confirm buy",
        "2. Weekly KES 180",
        "0. Back",
      ]);
    }
    if (b === "0") return handleUssd({ ...req, text: "" });
    if (b === "1" || b === "2") {
      const plan = b === "1" ? "daily KES 30" : "weekly KES 180";
      return reply(
        req,
        "END",
        [`Cover queued for ${phone}.`, `Plan: ${plan}.`, "STK push will follow shortly."],
        [
          {
            type: "lead",
            name: `USSD ${phone}`,
            phone,
            productLine: "micro",
            notes: `Boda micro via USSD · ${plan}`,
          },
          {
            type: "notify",
            channel: "sms",
            title: "Boda cover queued",
            body: `Bimafy: ${plan} enrolment started for ${phone}. Complete M-Pesa STK to activate.`,
          },
        ],
      );
    }
  }

  if (a === "2") {
    if (!b) return reply(req, "CON", ["Enter amount in KES", "or 0 to cancel"]);
    if (b === "0") return handleUssd({ ...req, text: "" });
    const amount = Number(b);
    if (!Number.isFinite(amount) || amount < 1) {
      return reply(req, "CON", ["Invalid amount. Enter KES", "or 0 to cancel"]);
    }
    return reply(
      req,
      "END",
      [`Payment of KES ${Math.round(amount)} initiated.`, "Approve the M-Pesa prompt on your phone."],
      [
        {
          type: "payment",
          amount: Math.round(amount),
          phone,
          policyNumber: "POL-BODA-4410",
          participantName: `USSD ${phone}`,
        },
      ],
    );
  }

  if (a === "3") {
    return reply(req, "END", [
      "Active covers:",
      "1. Boda Micro POL-BODA-4410",
      "Status: Active",
      "Next due: KES 900",
    ]);
  }

  if (a === "4") {
    if (!b) {
      return reply(req, "CON", ["Select policy for claim", "1. POL-BODA-4410", "0. Cancel"]);
    }
    if (b === "0") return handleUssd({ ...req, text: "" });
    if (!c) return reply(req, "CON", ["Briefly describe incident", "(max 40 chars)"]);
    const description = c.slice(0, 40);
    return reply(
      req,
      "END",
      ["Claim registered.", `Ref: CLM-USSD-${Date.now().toString().slice(-5)}`, "An officer will call you."],
      [
        {
          type: "claim",
          phone,
          policyNumber: "POL-BODA-4410",
          description,
        },
      ],
    );
  }

  if (a === "5") {
    return reply(req, "END", [
      "Agent desk: 0700 000 001",
      "WhatsApp: +254700000001",
      "Hours: 8am-6pm EAT",
    ]);
  }

  return reply(req, "END", ["Invalid option. Dial *384*90# again."]);
}

function reply(
  req: UssdRequest,
  type: "CON" | "END",
  lines: string[],
  effects?: ChannelEffect[],
): UssdResponse {
  return {
    sessionId: req.sessionId,
    phoneNumber: req.phoneNumber,
    type,
    message: lines.join("\n"),
    effects,
  };
}
