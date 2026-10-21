import type { Reminder, ReminderKind } from "../engines/reminders";
import type { Lang } from "../lang";
import { formatDay } from "./agency.ts";

/**
 * Client reminder texts, kept short enough for a 2-part SMS (≤ 306 chars).
 * Swahili needs a native-speaker review before launch.
 */

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

export function reminderMessage(lang: Lang, r: Reminder, agent: string) {
  const first = r.policy.participantName.split(" ")[0] || r.policy.participantName;
  const product = r.policy.productName;
  const no = r.policy.number;
  const date = formatDay(r.anchor, lang);
  const amount = kes(r.amount);
  const which = r.instalment
    ? r.instalment.n === 0
      ? lang === "sw" ? "malipo ya awali" : "deposit"
      : lang === "sw"
        ? `awamu ya ${r.instalment.n} kati ya ${r.instalment.of}`
        : `instalment ${r.instalment.n} of ${r.instalment.of}`
    : "";

  if (lang === "sw") {
    const sw: Record<ReminderKind, string> = {
      renewal_30: `Habari ${first}, ni ${agent} wa Bimafy. Bima yako ya ${product} (${no}) inaisha ${date}. Unaweza kulipa ${amount} mara moja au kwa awamu kupitia M-Pesa. Jibu NDIYO nikusaidie.`,
      renewal_7: `Habari ${first}, bima yako ya ${product} (${no}) inaisha baada ya siku 7 (${date}). Jibu NDIYO nikutumie ombi la M-Pesa la ${amount} au tupange awamu.`,
      renewal_1: `${first}, bima yako ya ${product} (${no}) inaisha KESHO. Usibaki bila kinga, jibu NDIYO nikutumie ombi la M-Pesa sasa. ${agent}, Bimafy.`,
      renewal_lapsed: `Habari ${first}, bima yako ya ${product} (${no}) iliisha ${date} na kwa sasa huna kinga. Jibu NDIYO niihuishe leo kupitia M-Pesa. ${agent}, Bimafy.`,
      instalment_soon: `Habari ${first}, ukumbusho: ${which} ya bima yako ${no} (${amount}) inalipwa ${date}. Jibu NDIYO nikutumie ombi la M-Pesa siku hiyo. ${agent}, Bimafy.`,
      instalment_today: `Habari ${first}, ${which} ya bima yako ${no} (${amount}) inalipwa leo. Jibu NDIYO nikutumie ombi la M-Pesa sasa. Asante! ${agent}, Bimafy.`,
      instalment_late: `Habari ${first}, hatujapokea ${which} ya bima yako ${no} iliyopaswa ${date}. Kiasi kinachodaiwa ni ${amount}. Jibu NDIYO nikutumie ombi la M-Pesa. ${agent}, Bimafy.`,
      instalment_final: `${first}, bima yako ${no} inaweza kusimamishwa kwa sababu ya malipo ya ${amount} yaliyochelewa. Lipa leo ili uendelee kulindwa, jibu NDIYO. ${agent}, Bimafy.`,
    };
    return sw[r.kind];
  }
  const en: Record<ReminderKind, string> = {
    renewal_30: `Hi ${first}, it's ${agent} from Bimafy. Your ${product} cover (${no}) renews on ${date}. You can pay ${amount} at once or in instalments by M-Pesa. Reply YES and I'll set it up.`,
    renewal_7: `Hi ${first}, your ${product} cover (${no}) ends in 7 days (${date}). Reply YES for an M-Pesa request of ${amount}, or ask me about paying in instalments.`,
    renewal_1: `${first}, your ${product} cover (${no}) ends TOMORROW. Don't drive or work uncovered, reply YES and I'll send the M-Pesa request now. ${agent}, Bimafy.`,
    renewal_lapsed: `Hi ${first}, your ${product} cover (${no}) ended on ${date}, so you're not covered right now. Reply YES and I'll renew it today by M-Pesa. ${agent}, Bimafy.`,
    instalment_soon: `Hi ${first}, a reminder that your ${which} for policy ${no} (${amount}) is due on ${date}. Reply YES and I'll send the M-Pesa request that day. ${agent}, Bimafy.`,
    instalment_today: `Hi ${first}, your ${which} for policy ${no} (${amount}) is due today. Reply YES and I'll send the M-Pesa request now. Thank you! ${agent}, Bimafy.`,
    instalment_late: `Hi ${first}, we haven't received your ${which} for policy ${no}, due ${date}. Amount owed: ${amount}. Reply YES and I'll send an M-Pesa request. ${agent}, Bimafy.`,
    instalment_final: `${first}, your policy ${no} may be suspended because ${amount} is overdue. Pay today to stay covered, reply YES for an M-Pesa request. ${agent}, Bimafy.`,
  };
  return en[r.kind];
}

/** Short label an agent scans in the queue. */
export function reminderReason(r: Reminder, today: string) {
  const which = r.instalment ? (r.instalment.n === 0 ? "Deposit" : `Instalment ${r.instalment.n}/${r.instalment.of}`) : "";
  switch (r.kind) {
    case "renewal_30":
      return "Renews in 30 days";
    case "renewal_7":
      return "Renews in 7 days";
    case "renewal_1":
      return "Renews tomorrow";
    case "renewal_lapsed":
      return "Expired — win back";
    case "instalment_soon":
      return `${which} due in 3 days`;
    case "instalment_today":
      return r.anchor === today ? `${which} due today` : `${which} due`;
    case "instalment_late":
      return `${which} late`;
    case "instalment_final":
      return `${which} — cover at risk`;
  }
}
