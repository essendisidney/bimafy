import type { UserRole } from "./types";

export type NavIcon =
  | "home"
  | "platform"
  | "products"
  | "quotes"
  | "policies"
  | "documents"
  | "underwriting"
  | "claims"
  | "collections"
  | "accounting"
  | "fraud"
  | "apis"
  | "channels"
  | "agency"
  | "broker"
  | "ai"
  | "analytics"
  | "regulatory"
  | "surplus"
  | "reinsurance"
  | "selfService"
  | "crm"
  | "notifications"
  | "profile"
  | "admin";

export type NavItem = {
  href: string;
  label: string;
  roles: UserRole[] | "*";
  /** Grouped by the job people come to do, not by internal product name. */
  section: string;
  icon: NavIcon;
};

const STAFF_RISK: UserRole[] = ["underwriter", "admin", "branch_manager"];
const STAFF_FRAUD: UserRole[] = [
  "admin",
  "claims_officer",
  "claims_assessor",
  "underwriter",
  "compliance",
  "branch_manager",
];
const STAFF_CONNECT: UserRole[] = [
  "admin",
  "underwriter",
  "claims_officer",
  "claims_assessor",
  "compliance",
  "branch_manager",
];
const STAFF_AGENT: UserRole[] = ["agent", "admin", "branch_manager"];
const STAFF_AI: UserRole[] = ["admin", "underwriter", "claims_officer", "claims_assessor", "shariah_officer"];
const STAFF_DATA: UserRole[] = ["admin", "branch_manager", "finance", "underwriter", "shariah_officer"];
const STAFF_PAY: UserRole[] = ["finance", "admin", "shariah_officer"];
const STAFF_CARE: UserRole[] = ["call_center", "admin", "branch_manager", "agent"];

export const navItems: NavItem[] = [
  { href: "/app/dashboard", label: "Home", roles: "*", section: "Overview", icon: "home" },
  { href: "/app/modules", label: "Platform", roles: "*", section: "Overview", icon: "platform" },

  { href: "/app/agent", label: "Agency", roles: STAFF_AGENT, section: "Sell", icon: "agency" },
  { href: "/app/broker", label: "Broker", roles: ["broker", "admin"], section: "Sell", icon: "broker" },
  { href: "/app/quotes", label: "Quotations", roles: "*", section: "Sell", icon: "quotes" },
  { href: "/app/products", label: "Products", roles: "*", section: "Sell", icon: "products" },
  { href: "/app/crm", label: "CRM & care", roles: STAFF_CARE, section: "Sell", icon: "crm" },

  { href: "/app/policies", label: "Policies", roles: "*", section: "Policies", icon: "policies" },
  { href: "/app/underwriting", label: "Underwriting", roles: STAFF_RISK, section: "Policies", icon: "underwriting" },
  { href: "/app/documents", label: "Documents", roles: "*", section: "Policies", icon: "documents" },

  { href: "/app/claims", label: "Claims", roles: "*", section: "Claims", icon: "claims" },
  { href: "/app/fraud", label: "Fraud desk", roles: STAFF_FRAUD, section: "Claims", icon: "fraud" },

  { href: "/app/payments", label: "Collections", roles: "*", section: "Money", icon: "collections" },
  { href: "/app/finance", label: "Accounting", roles: STAFF_PAY, section: "Money", icon: "accounting" },
  { href: "/app/reinsurance", label: "Reinsurance", roles: ["finance", "admin", "underwriter"], section: "Money", icon: "reinsurance" },
  { href: "/app/shariah", label: "Surplus & Shariah", roles: ["shariah_officer", "finance", "admin"], section: "Money", icon: "surplus" },

  { href: "/app/customer", label: "Self-service", roles: "*", section: "Customers", icon: "selfService" },
  { href: "/app/channels", label: "WhatsApp & USSD", roles: ["admin", "call_center", "agent", "branch_manager", "participant"], section: "Customers", icon: "channels" },
  { href: "/app/notifications", label: "Notifications", roles: "*", section: "Customers", icon: "notifications" },
  { href: "/app/profile", label: "Profile & KYC", roles: "*", section: "Customers", icon: "profile" },

  { href: "/app/analytics", label: "Analytics", roles: STAFF_DATA, section: "Insight & control", icon: "analytics" },
  { href: "/app/ai", label: "Intelligence", roles: STAFF_AI, section: "Insight & control", icon: "ai" },
  { href: "/app/compliance", label: "Regulatory", roles: ["compliance", "admin", "shariah_officer"], section: "Insight & control", icon: "regulatory" },
  { href: "/app/integrations", label: "APIs & partners", roles: STAFF_CONNECT, section: "Insight & control", icon: "apis" },
  { href: "/app/admin", label: "Administration", roles: ["admin"], section: "Insight & control", icon: "admin" },
];

export function visibleNav(role: UserRole) {
  return navItems.filter((item) => item.roles === "*" || item.roles.includes(role));
}

/** The four places each role lives in — the phone tab bar. Everything else is under "More". */
const PRIMARY: Partial<Record<UserRole, string[]>> = {
  participant: ["/app/dashboard", "/app/customer", "/app/claims", "/app/profile"],
  agent: ["/app/dashboard", "/app/agent", "/app/quotes", "/app/policies"],
  broker: ["/app/dashboard", "/app/broker", "/app/quotes", "/app/policies"],
  underwriter: ["/app/dashboard", "/app/underwriting", "/app/quotes", "/app/policies"],
  claims_officer: ["/app/dashboard", "/app/claims", "/app/fraud", "/app/policies"],
  claims_assessor: ["/app/dashboard", "/app/claims", "/app/fraud", "/app/policies"],
  finance: ["/app/dashboard", "/app/payments", "/app/finance", "/app/analytics"],
  compliance: ["/app/dashboard", "/app/compliance", "/app/fraud", "/app/claims"],
  shariah_officer: ["/app/dashboard", "/app/shariah", "/app/compliance", "/app/analytics"],
  call_center: ["/app/dashboard", "/app/crm", "/app/claims", "/app/policies"],
  branch_manager: ["/app/dashboard", "/app/agent", "/app/policies", "/app/analytics"],
};
const DEFAULT_PRIMARY = ["/app/dashboard", "/app/policies", "/app/claims", "/app/analytics"];

export function primaryNav(role: UserRole) {
  const visible = visibleNav(role);
  return (PRIMARY[role] ?? DEFAULT_PRIMARY)
    .map((href) => visible.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
}
