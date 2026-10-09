import type { CrossSellReason, LeadTemperature, NextAction, RenewalDriver, ScoreReason } from "../engines/agency";
import type { Lang } from "../lang";
import type { Frequency, LeadActivity, LeadSource, LeadStatus, ProductLine } from "../types";

/**
 * Agent desk copy in English and Swahili. Swahili needs a native-speaker
 * review before launch, especially the insurance terms.
 */

type Dict = {
  locale: string;
  eyebrow: string;
  title: (first: string) => string;
  description: (code: string, branch: string, license: string) => string;
  viewAgent: string;
  newQuote: string;
  stats: {
    due: string;
    dueHint: (n: number) => string;
    pipeline: string;
    pipelineHint: (open: number, win: string) => string;
    renewals: string;
    renewalsHint: (n: number) => string;
    gwp: string;
    gwpHint: (pct: string, target: string) => string;
    wallet: string;
    walletHint: (net: string) => string;
  };
  loading: string;
  tabs: Record<"today" | "pipeline" | "renewals" | "book" | "commissions" | "team", string>;
  today: {
    followUps: string;
    followUpsHint: string;
    overdue: string;
    today: string;
    unscheduled: string;
    upcoming: string;
    inboxZero: string;
    inboxZeroHint: string;
    targetPace: string;
    runRate: (projected: string, pct: string) => string;
    onTrack: string;
    behind: (pace: string, months: number, gap: string) => string;
    renewalsMonth: string;
    noRenewals: string;
    expiredAgo: (n: number) => string;
    daysLeft: (n: number) => string;
  };
  capture: {
    title: string;
    name: string;
    phone: string;
    interest: string;
    source: string;
    value: string;
    notes: string;
    save: string;
    saving: string;
    saved: (name: string) => string;
  };
  pipeline: { empty: string };
  drawer: {
    lead: (line: string) => string;
    close: string;
    nextAction: string;
    call: string;
    whatsapp: string;
    quote: string;
    waTitle: string;
    waClientLang: string;
    waSend: string;
    logTouch: string;
    placeholder: string;
    nextFollowUp: string;
    saveActivity: string;
    moveStage: string;
    lostReason: string;
    lost: string;
    reopen: string;
    timeline: string;
    created: string;
    noActivity: string;
    movedTo: (status: string, reason?: string) => string;
    notSpecified: string;
    waSent: (template: string) => string;
  };
  renewals: {
    persistency: string;
    persistencyHint: string;
    premium: string;
    highRisk: string;
    highRiskHint: string;
    buckets: Record<"win_back" | "0-30" | "31-60" | "61-90", string>;
    headers: string[];
    ago: (n: number) => string;
    left: (n: number) => string;
    clean: string;
    remind: string;
    reminded: string;
    work: string;
    inPipeline: string;
    noPhone: string;
    empty: string;
    emptyHint: string;
    risk: Record<"high" | "medium" | "low", string>;
    renewalNote: (number: string, expiry: string) => string;
  };
  book: {
    title: string;
    summary: (policies: number, quotes: number, contribution: string) => string;
    headers: string[];
    empty: string;
    emptyHint: string;
    radar: string;
    radarHint: (amount: string) => string;
    has: (lines: string) => string;
    addLead: string;
    inPipeline: string;
    whatsapp: string;
    noGaps: string;
    noGapsHint: string;
    crossSellNote: (reason: string) => string;
  };
  commissions: {
    title: string;
    hint: string;
    headers: string[];
    total: string;
    withdraw: string;
    available: string;
    amount: string;
    all: string;
    withdrawCta: (amount: string) => string;
    ledgerNote: string;
  };
  team: { title: string; hint: string; headers: string[]; you: string };
  status: Record<LeadStatus, string>;
  temperature: Record<LeadTemperature, string>;
  line: Record<ProductLine, string>;
  source: Record<LeadSource, string>;
  activity: Record<LeadActivity["kind"], string>;
  frequency: Record<Frequency, string>;
  action: Record<NextAction["code"], string>;
  reason: (r: ScoreReason) => string;
  driver: (d: RenewalDriver) => string;
  crossSell: (reason: CrossSellReason, age?: number) => string;
};

const en: Dict = {
  locale: "en-KE",
  eyebrow: "InsuraX Agent",
  title: (first) => `${first}'s desk`,
  description: (code, branch, license) =>
    `${code} · ${branch} · ${license}. Your day, your pipeline, your renewals and your money — in one place.`,
  viewAgent: "View agent",
  newQuote: "New quotation",
  stats: {
    due: "Due today",
    dueHint: (n) => `${n} overdue follow-ups`,
    pipeline: "Weighted pipeline",
    pipelineHint: (open, win) => `${open} open leads · win ${win}`,
    renewals: "Renewals ≤90d",
    renewalsHint: (n) => `${n} high lapse risk`,
    gwp: "YTD GWP",
    gwpHint: (pct, target) => `${pct} of ${target}`,
    wallet: "Wallet",
    walletHint: (net) => `Net earned on book ${net}`,
  },
  loading: "Loading your leads…",
  tabs: { today: "Today", pipeline: "Pipeline", renewals: "Renewals", book: "Book & cross-sell", commissions: "Commissions", team: "Team" },
  today: {
    followUps: "Follow-ups",
    followUpsHint: "Ranked by propensity-to-bind. Tap a lead to log a call, WhatsApp or move the stage.",
    overdue: "Overdue",
    today: "Today",
    unscheduled: "Needs a follow-up date",
    upcoming: "Next 7 days",
    inboxZero: "Inbox zero.",
    inboxZeroHint: "Capture a lead to fill tomorrow's pipeline.",
    targetPace: "Target pace",
    runRate: (projected, pct) => `Run-rate lands at ${projected} (${pct} of target).`,
    onTrack: "On track — protect it with renewals.",
    behind: (pace, months, gap) => `Need ${pace}/month for the next ${months} months to close a ${gap} gap.`,
    renewalsMonth: "Renewals this month",
    noRenewals: "Nothing expiring in the next 30 days.",
    expiredAgo: (n) => `expired ${n}d ago`,
    daysLeft: (n) => `${n}d left`,
  },
  capture: {
    title: "Capture lead",
    name: "Name",
    phone: "Phone",
    interest: "Interest",
    source: "Source",
    value: "Est. annual contribution (KES, optional)",
    notes: "Notes",
    save: "Save lead",
    saving: "Saving…",
    saved: (name) => `${name} added — follow-up booked for tomorrow.`,
  },
  pipeline: { empty: "Empty" },
  drawer: {
    lead: (line) => `${line} lead`,
    close: "Close",
    nextAction: "Next best action",
    call: "Call",
    whatsapp: "WhatsApp",
    quote: "Quote",
    waTitle: "WhatsApp message",
    waClientLang: "Client's language",
    waSend: "Open in WhatsApp",
    logTouch: "Log touch",
    placeholder: "What happened? What did they object to?",
    nextFollowUp: "Next follow-up",
    saveActivity: "Save activity",
    moveStage: "Move stage",
    lostReason: "Lost reason (price, timing, competitor…)",
    lost: "Lost",
    reopen: "Reopen lead",
    timeline: "Timeline",
    created: "Created",
    noActivity: "No activity yet.",
    movedTo: (status, reason) => `Moved to ${status}${reason ? ` — ${reason}` : ""}`,
    notSpecified: "Not specified",
    waSent: (template) => `Sent "${template}" on WhatsApp`,
  },
  renewals: {
    persistency: "Persistency",
    persistencyHint: "Book still in force",
    premium: "Premium up for renewal",
    highRisk: "High lapse risk",
    highRiskHint: "Call these first",
    buckets: { win_back: "Win-back (expired ≤60d)", "0-30": "0–30 days", "31-60": "31–60 days", "61-90": "61–90 days" },
    headers: ["Policy", "Client", "Expiry", "Contribution", "Lapse risk", ""],
    ago: (n) => `${n}d ago`,
    left: (n) => `${n}d left`,
    clean: "Clean payment history",
    remind: "WhatsApp reminder",
    reminded: "Reminder sent",
    work: "Work renewal",
    inPipeline: "In pipeline",
    noPhone: "No phone on file",
    empty: "No renewals in the next 90 days.",
    emptyHint: "Your book is quiet — a good week to prospect.",
    risk: { high: "High risk", medium: "Medium risk", low: "Low risk" },
    renewalNote: (number, expiry) => `Renewal of ${number} — expiry ${expiry}.`,
  },
  book: {
    title: "My book",
    summary: (policies, quotes, contribution) => `${policies} policies · ${quotes} quotes · ${contribution} contribution`,
    headers: ["Policy", "Client", "Product", "Status"],
    empty: "No policies yet.",
    emptyHint: "Bind a quote to start your book.",
    radar: "Cross-sell radar",
    radarHint: (amount) => `Coverage gaps in your existing clients — ${amount} of annual contribution you don't need to prospect for.`,
    has: (lines) => `has ${lines}`,
    addLead: "+ Lead",
    inPipeline: "In pipeline",
    whatsapp: "WhatsApp",
    noGaps: "No gaps found.",
    noGapsHint: "Every client is fully covered.",
    crossSellNote: (reason) => `Cross-sell: ${reason}`,
  },
  commissions: {
    title: "Commission statement",
    hint: "Earned on collected contributions only. First-year lapses claw back the unexpired share.",
    headers: ["Policy", "Line", "Collected", "Rate", "Earned", "Clawback", "Net"],
    total: "Total",
    withdraw: "Withdraw to M-Pesa",
    available: "Available",
    amount: "Amount (KES)",
    all: "All",
    withdrawCta: (amount) => `Withdraw ${amount}`,
    ledgerNote: "Posts a journal entry and SMS receipt on the live ledger.",
  },
  team: {
    title: "Leaderboard",
    hint: "Ranked by target attainment, not raw volume — so every branch can win.",
    headers: ["#", "Agent", "Branch", "YTD GWP", "Target", "Attainment"],
    you: "you",
  },
  status: { new: "New", contacted: "Contacted", quoted: "Quoted", won: "Won", lost: "Lost" },
  temperature: { hot: "Hot", warm: "Warm", cold: "Cold" },
  line: {
    motor: "Motor",
    medical: "Medical",
    family_takaful: "Family takaful",
    funeral: "Funeral",
    agriculture: "Crop",
    livestock: "Livestock",
    travel: "Travel",
    gadget: "Phone & gadget",
    micro: "Boda micro",
    asset: "Home & business",
  },
  source: {
    referral: "Referral",
    walk_in: "Walk-in",
    whatsapp: "WhatsApp",
    ussd: "USSD",
    campaign: "Campaign",
    bulk_import: "Bulk import",
    partner: "Partner",
    renewal: "Renewal",
  },
  activity: { call: "Call", whatsapp: "WhatsApp", sms: "SMS", meeting: "Meeting", note: "Note", status: "Stage" },
  frequency: { daily: "daily", weekly: "weekly", monthly: "monthly", quarterly: "quarterly", annually: "annually", single: "single" },
  action: {
    first_call: "Call within 24h — first contact",
    price_quote: "Price a quotation",
    close: "Ask for the close — send M-Pesa STK",
    whatsapp_quote: "WhatsApp the quote & handle objections",
    none: "No action",
  },
  reason: (r) => {
    switch (r.code) {
      case "bound":
        return "Bound";
      case "lost":
        return r.detail || "Lost";
      case "stage":
        return `${en.status[r.detail].toLowerCase()} stage`;
      case "source":
        return `${en.source[r.detail].toLowerCase()} source`;
      case "high_value":
        return "high-value cover";
      case "engaged":
        return "engaged in last 3 days";
      case "idle":
        return `${r.n} days without contact`;
      case "overdue":
        return `follow-up ${r.n}d overdue`;
      case "no_followup":
        return "no follow-up booked";
    }
  },
  driver: (d) => {
    switch (d.code) {
      case "failed_collections":
        return `${d.n} failed collection${d.n > 1 ? "s" : ""}`;
      case "policy_status":
        return `policy ${d.detail}`;
      case "instalment_payer":
        return `${en.frequency[d.detail]} payer`;
      case "expired":
        return `expired ${d.n}d ago`;
      case "expires_soon":
        return "expires within 2 weeks";
      case "no_settled_payment":
        return "no settled payment on file";
    }
  },
  crossSell: (reason, age) =>
    ({
      drives_without_medical: "Drives daily without hospital cash cover",
      boda_funeral: "Boda riders: low-cost Janaaza cover for the family",
      farmer_livestock: "Farmer with crop cover — protect the herd too",
      income_protection: `Age ${age}: income protection for dependants`,
      complete_family_plan: "Complete the family plan with funeral cover",
      vehicle_owner_assets: "Vehicle owner — home & business assets likely uninsured",
      digital_travel: "Digital-first client — travel cover via app",
    })[reason],
};

const sw: Dict = {
  locale: "sw-KE",
  eyebrow: "Wakala wa InsuraX",
  title: (first) => `Dawati la ${first}`,
  description: (code, branch, license) =>
    `${code} · ${branch} · ${license}. Siku yako, wateja wako, bima za kuhuisha na pesa zako — mahali pamoja.`,
  viewAgent: "Angalia wakala",
  newQuote: "Bei mpya",
  stats: {
    due: "Za leo",
    dueHint: (n) => `${n} zimepitwa na muda`,
    pipeline: "Thamani ya mauzo yanayotarajiwa",
    pipelineHint: (open, win) => `${open} wazi · ushindi ${win}`,
    renewals: "Za kuhuisha ≤siku 90",
    renewalsHint: (n) => `${n} hatari kubwa ya kukatika`,
    gwp: "Michango ya mwaka huu",
    gwpHint: (pct, target) => `${pct} ya ${target}`,
    wallet: "Mkoba",
    walletHint: (net) => `Mapato halisi ${net}`,
  },
  loading: "Inapakia wateja wako…",
  tabs: { today: "Leo", pipeline: "Mauzo", renewals: "Kuhuisha", book: "Wateja & mauzo ya ziada", commissions: "Kamisheni", team: "Timu" },
  today: {
    followUps: "Ufuatiliaji",
    followUpsHint: "Wamepangwa kwa uwezekano wa kununua. Gusa mteja kurekodi simu, WhatsApp au kubadilisha hatua.",
    overdue: "Zimepitwa na muda",
    today: "Leo",
    unscheduled: "Hawana tarehe ya ufuatiliaji",
    upcoming: "Siku 7 zijazo",
    inboxZero: "Hakuna kinachosubiri.",
    inboxZeroHint: "Ongeza mteja mtarajiwa ujaze mauzo ya kesho.",
    targetPace: "Kasi ya lengo",
    runRate: (projected, pct) => `Kwa kasi hii utafika ${projected} (${pct} ya lengo).`,
    onTrack: "Uko kwenye mstari — linda kwa kuhuisha bima.",
    behind: (pace, months, gap) => `Unahitaji ${pace} kwa mwezi kwa miezi ${months} ijayo kuziba pengo la ${gap}.`,
    renewalsMonth: "Za kuhuisha mwezi huu",
    noRenewals: "Hakuna inayoisha ndani ya siku 30.",
    expiredAgo: (n) => `iliisha siku ${n} zilizopita`,
    daysLeft: (n) => `zimebaki siku ${n}`,
  },
  capture: {
    title: "Ongeza mteja mtarajiwa",
    name: "Jina",
    phone: "Simu",
    interest: "Anachotaka",
    source: "Chanzo",
    value: "Makadirio ya mchango wa mwaka (KES, si lazima)",
    notes: "Maelezo",
    save: "Hifadhi",
    saving: "Inahifadhi…",
    saved: (name) => `${name} ameongezwa — ufuatiliaji umepangwa kesho.`,
  },
  pipeline: { empty: "Tupu" },
  drawer: {
    lead: (line) => `Mteja mtarajiwa · ${line}`,
    close: "Funga",
    nextAction: "Hatua bora inayofuata",
    call: "Piga simu",
    whatsapp: "WhatsApp",
    quote: "Bei",
    waTitle: "Ujumbe wa WhatsApp",
    waClientLang: "Lugha ya mteja",
    waSend: "Fungua kwenye WhatsApp",
    logTouch: "Rekodi mawasiliano",
    placeholder: "Nini kilitokea? Alipinga nini?",
    nextFollowUp: "Ufuatiliaji unaofuata",
    saveActivity: "Hifadhi",
    moveStage: "Badilisha hatua",
    lostReason: "Sababu ya kupoteza (bei, muda, mshindani…)",
    lost: "Amepotea",
    reopen: "Fungua tena",
    timeline: "Historia",
    created: "Ameongezwa",
    noActivity: "Bado hakuna shughuli.",
    movedTo: (status, reason) => `Amehamishiwa ${status}${reason ? ` — ${reason}` : ""}`,
    notSpecified: "Haijaelezwa",
    waSent: (template) => `Ametumiwa "${template}" kwa WhatsApp`,
  },
  renewals: {
    persistency: "Uendelevu",
    persistencyHint: "Bima ambazo bado zinafanya kazi",
    premium: "Michango ya kuhuisha",
    highRisk: "Hatari kubwa ya kukatika",
    highRiskHint: "Wapigie hawa kwanza",
    buckets: { win_back: "Rudisha (zimeisha ≤siku 60)", "0-30": "Siku 0–30", "31-60": "Siku 31–60", "61-90": "Siku 61–90" },
    headers: ["Bima", "Mteja", "Mwisho", "Mchango", "Hatari ya kukatika", ""],
    ago: (n) => `siku ${n} zilizopita`,
    left: (n) => `zimebaki siku ${n}`,
    clean: "Historia safi ya malipo",
    remind: "Kumbusha kwa WhatsApp",
    reminded: "Amekumbushwa",
    work: "Shughulikia",
    inPipeline: "Iko kwenye mauzo",
    noPhone: "Hakuna namba ya simu",
    empty: "Hakuna za kuhuisha ndani ya siku 90.",
    emptyHint: "Wiki tulivu — wakati mzuri wa kutafuta wateja wapya.",
    risk: { high: "Hatari kubwa", medium: "Hatari ya kati", low: "Hatari ndogo" },
    renewalNote: (number, expiry) => `Kuhuisha ${number} — inaisha ${expiry}.`,
  },
  book: {
    title: "Wateja wangu",
    summary: (policies, quotes, contribution) => `Bima ${policies} · bei ${quotes} · michango ${contribution}`,
    headers: ["Bima", "Mteja", "Bidhaa", "Hali"],
    empty: "Bado hakuna bima.",
    emptyHint: "Kamilisha bei moja kuanza orodha yako.",
    radar: "Fursa za mauzo ya ziada",
    radarHint: (amount) => `Mapengo ya kinga kwa wateja ulionao — michango ya ${amount} kwa mwaka bila kutafuta wateja wapya.`,
    has: (lines) => `ana ${lines}`,
    addLead: "+ Ongeza",
    inPipeline: "Iko kwenye mauzo",
    whatsapp: "WhatsApp",
    noGaps: "Hakuna mapengo.",
    noGapsHint: "Kila mteja amelindwa kikamilifu.",
    crossSellNote: (reason) => `Mauzo ya ziada: ${reason}`,
  },
  commissions: {
    title: "Taarifa ya kamisheni",
    hint: "Hulipwa kwa michango iliyokusanywa tu. Bima ikikatika mwaka wa kwanza, sehemu iliyobaki hurudishwa.",
    headers: ["Bima", "Aina", "Iliyokusanywa", "Kiwango", "Uliyopata", "Iliyorudishwa", "Halisi"],
    total: "Jumla",
    withdraw: "Toa kwenda M-Pesa",
    available: "Inapatikana",
    amount: "Kiasi (KES)",
    all: "Zote",
    withdrawCta: (amount) => `Toa ${amount}`,
    ledgerNote: "Inarekodi kwenye leja na kutuma risiti kwa SMS.",
  },
  team: {
    title: "Ubao wa viongozi",
    hint: "Wamepangwa kwa asilimia ya lengo, si kiasi — ili kila tawi liweze kushinda.",
    headers: ["#", "Wakala", "Tawi", "Michango ya mwaka", "Lengo", "Kufikia lengo"],
    you: "wewe",
  },
  status: { new: "Mpya", contacted: "Amewasiliana", quoted: "Amepewa bei", won: "Amenunua", lost: "Amepotea" },
  temperature: { hot: "Moto", warm: "Vuguvugu", cold: "Baridi" },
  line: {
    motor: "Gari",
    medical: "Matibabu",
    family_takaful: "Takaful ya familia",
    funeral: "Mazishi",
    agriculture: "Mazao",
    livestock: "Mifugo",
    travel: "Safari",
    gadget: "Simu na vifaa",
    micro: "Boda",
    asset: "Nyumba na biashara",
  },
  source: {
    referral: "Rufaa",
    walk_in: "Alifika ofisini",
    whatsapp: "WhatsApp",
    ussd: "USSD",
    campaign: "Kampeni",
    bulk_import: "Orodha iliyoingizwa",
    partner: "Mshirika",
    renewal: "Kuhuisha",
  },
  activity: { call: "Simu", whatsapp: "WhatsApp", sms: "SMS", meeting: "Mkutano", note: "Dokezo", status: "Hatua" },
  frequency: { daily: "kila siku", weekly: "kila wiki", monthly: "kila mwezi", quarterly: "kila robo mwaka", annually: "kila mwaka", single: "mara moja" },
  action: {
    first_call: "Mpigie ndani ya saa 24 — mawasiliano ya kwanza",
    price_quote: "Mpe bei",
    close: "Omba akamilishe — tuma ombi la M-Pesa",
    whatsapp_quote: "Mtumie bei kwa WhatsApp na ujibu wasiwasi wake",
    none: "Hakuna hatua",
  },
  reason: (r) => {
    switch (r.code) {
      case "bound":
        return "Amenunua";
      case "lost":
        return r.detail || "Amepotea";
      case "stage":
        return `hatua: ${sw.status[r.detail].toLowerCase()}`;
      case "source":
        return `chanzo: ${sw.source[r.detail].toLowerCase()}`;
      case "high_value":
        return "bima ya thamani kubwa";
      case "engaged":
        return "amewasiliana ndani ya siku 3";
      case "idle":
        return `siku ${r.n} bila mawasiliano`;
      case "overdue":
        return `ufuatiliaji umechelewa siku ${r.n}`;
      case "no_followup":
        return "hakuna ufuatiliaji uliopangwa";
    }
  },
  driver: (d) => {
    switch (d.code) {
      case "failed_collections":
        return `malipo ${d.n} yameshindikana`;
      case "policy_status":
        return `bima imesimamishwa (${d.detail})`;
      case "instalment_payer":
        return `hulipa ${sw.frequency[d.detail]}`;
      case "expired":
        return `iliisha siku ${d.n} zilizopita`;
      case "expires_soon":
        return "inaisha ndani ya wiki 2";
      case "no_settled_payment":
        return "hakuna malipo yaliyokamilika";
    }
  },
  crossSell: (reason, age) =>
    ({
      drives_without_medical: "Anaendesha kila siku bila bima ya hospitali",
      boda_funeral: "Waendesha boda: bima nafuu ya Janaaza kwa familia",
      farmer_livestock: "Mkulima mwenye bima ya mazao — linda mifugo pia",
      income_protection: `Umri ${age}: kinga ya kipato kwa wanaomtegemea`,
      complete_family_plan: "Kamilisha mpango wa familia kwa bima ya mazishi",
      vehicle_owner_assets: "Mmiliki wa gari — nyumba na biashara huenda hazina bima",
      digital_travel: "Mteja wa kidijitali — bima ya safari kupitia app",
    })[reason],
};

export const agencyCopy: Record<Lang, Dict> = { en, sw };

export function formatDay(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(agencyCopy[lang].locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

/* ------------------------------------------------------------ WhatsApp */

export type WaTemplate = "follow_up" | "send_quote" | "ask_payment" | "thank_you";

export const WA_TEMPLATE_NAMES: Record<Lang, Record<WaTemplate, string>> = {
  en: { follow_up: "Follow up", send_quote: "Send price", ask_payment: "Ask for M-Pesa", thank_you: "Thank you" },
  sw: { follow_up: "Ufuatiliaji", send_quote: "Tuma bei", ask_payment: "Omba M-Pesa", thank_you: "Asante" },
};

type LeadMsg = { first: string; agent: string; line: ProductLine; price: string };

/** Client-facing lead messages; the client's language is chosen per message. */
export function leadMessage(template: WaTemplate, lang: Lang, m: LeadMsg) {
  const line = agencyCopy[lang].line[m.line].toLowerCase();
  if (lang === "sw") {
    return {
      follow_up: `Habari ${m.first}, ni ${m.agent} kutoka InsuraX. Nafuatilia kuhusu bima yako ya ${line} — ni wakati mzuri wa kuongea?`,
      send_quote: `Habari ${m.first}, bima yako ya ${line} ni takriban ${m.price} kwa mwaka. Naweza kuiwasha leo — jibu NDIYO nikutumie ombi la M-Pesa.`,
      ask_payment: `Habari ${m.first}, niko tayari kuwasha bima yako ya ${line}. Jibu NDIYO na nitakutumia ombi la M-Pesa kwenye namba hii.`,
      thank_you: `Asante ${m.first} kwa kuchagua InsuraX! Bima yako ya ${line} iko tayari. Nitumie ujumbe wakati wowote ukihitaji msaada au kuwasilisha dai.`,
    }[template];
  }
  return {
    follow_up: `Hi ${m.first}, this is ${m.agent} from InsuraX. Following up on your ${line} cover — is now a good time to talk?`,
    send_quote: `Hi ${m.first}, your ${line} cover comes to about ${m.price} a year. I can activate it today — reply YES and I'll send the M-Pesa prompt.`,
    ask_payment: `Hi ${m.first}, I'm ready to activate your ${line} cover. Reply YES and I'll send an M-Pesa request to this number.`,
    thank_you: `Thank you ${m.first} for choosing InsuraX! Your ${line} cover is in place. Message me any time you need help or want to make a claim.`,
  }[template];
}

export function renewalMessage(
  lang: Lang,
  m: { first: string; agent: string; product: string; number: string; expiry: string; expired: boolean },
) {
  const date = formatDay(m.expiry, lang);
  if (lang === "sw") {
    return m.expired
      ? `Habari ${m.first}, ni ${m.agent} kutoka InsuraX. Bima yako ya ${m.product} (${m.number}) iliisha tarehe ${date}. Kwa sasa huna kinga — jibu NDIYO niihuishe leo kupitia M-Pesa.`
      : `Habari ${m.first}, ni ${m.agent} kutoka InsuraX. Bima yako ya ${m.product} (${m.number}) inaisha tarehe ${date}. Jibu NDIYO nikutumie ombi la M-Pesa ili uendelee kulindwa.`;
  }
  return m.expired
    ? `Hi ${m.first}, this is ${m.agent} from InsuraX. Your ${m.product} (${m.number}) expired on ${date}, so you're not covered right now. Reply YES and I'll renew it today via M-Pesa.`
    : `Hi ${m.first}, this is ${m.agent} from InsuraX. Your ${m.product} (${m.number}) renews on ${date}. Reply YES and I'll send the M-Pesa prompt to keep you covered.`;
}

export function crossSellMessage(lang: Lang, m: { first: string; agent: string; line: ProductLine; reason: CrossSellReason; age?: number }) {
  const line = agencyCopy[lang].line[m.line].toLowerCase();
  const why = agencyCopy[lang].crossSell(m.reason, m.age);
  return lang === "sw"
    ? `Habari ${m.first}, ni ${m.agent} kutoka InsuraX. Asante kwa kutuamini. Wateja wengi kama wewe huongeza bima ya ${line} — ${why.charAt(0).toLowerCase()}${why.slice(1)}. Nikutumie bei?`
    : `Hi ${m.first}, this is ${m.agent} from InsuraX. Thanks for trusting us with your cover. Many clients like you also add ${line} cover — ${why.charAt(0).toLowerCase()}${why.slice(1)}. Shall I send you a price?`;
}
