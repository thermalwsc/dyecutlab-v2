/* =========================================================
   DYE CUT LAB — the factory portal's words, in English and Chinese
============================================================
   Every sentence a factory reads lives here, once per language. The Chinese table is typed as the
   English one, so a missing or extra line is a build error, not a blank on screen. Pure data and
   small functions, no server-only imports, covered by tests/factoryI18n.test.ts.

   A factory reads Chinese by default and can switch to English; the choice is kept in a cookie
   (app/factory/langActions.ts). The thread's own words are in lib/factoryThread.ts. */

import type { Lang } from "./translationGuard.ts";

export const PORTAL_LANG_COOKIE = "dcl_factory_lang";
export const DEFAULT_PORTAL_LANG: Lang = "zh";

/* The cookie's value, or the default when it is missing or odd. */
export function parsePortalLang(value: string | null | undefined): Lang {
  return value === "en" || value === "zh" ? value : DEFAULT_PORTAL_LANG;
}

export type NextStep = { headline: string; detail: string; cta?: string };

const EN = {
  // the shell
  role: "Factory",
  switchLabel: "Language",
  // the list page
  portalTitle: "Factory portal.",
  introLinked: (who: string, factory: string) => `Signed in as ${who}. Work DYE CUT LAB sends to ${factory} will appear here.`,
  introAttention: (n: number) => `${n === 1 ? "One project needs" : `${n} projects need`} your attention.`,
  introCalm: "Nothing needs you right now. Here's where your projects stand.",
  introNoFactory: (who: string) => `Signed in as ${who}. No factory is linked to this account yet — ask DYE CUT LAB to set that up.`,
  summary: "Summary",
  chipNeedYou: "need you",
  chipOnTheWay: "on the way",
  chipDelivered: "delivered",
  productionJobs: "Production jobs",
  nothingAssigned: "Nothing assigned yet. When DYE CUT LAB sends you a project, the brief, files and status show up here.",
  attentionA: "Needs your ",
  attentionB: "attention",
  onTheWay: "On the way",
  delivered: (n: number) => `Delivered (${n})`,
  yourDetails: "Your details on file",
  factory: "Factory",
  notLinked: "Not linked yet",
  contactOnRecord: "Contact on record",
  emailOnRecord: "Email on record",
  phoneOnRecord: "Phone on record",
  wrongBefore: "Something wrong? Call or text ",
  wrongMid: " or email ",
  wrongAfter: ".",
  backToSite: "Back to the site",
  openProject: "Open project",
  pieces: (n: string) => `${n} pcs`,
  untitled: "Untitled project",
  // the project page
  allProjects: "← All projects",
  briefTitle: "Project brief",
  assigned: "assigned",
  moveSeen: "DYE CUT LAB and the customer see this update straight away.",
  quoteHeading: "Your quote",
  quoteIntro: "Send your price for this project. All amounts in US dollars.",
  quoteApproved: "Your quote was approved. Thank you.",
  quoteClosed: "This project is no longer open for new quotes.",
  quotesSent: "Quotes you sent",
  version: (n: number, total: string) => `Version ${n} · ${total}`,
  toolingWord: "tooling",
  days: (n: number) => `${n} days`,
  sent: "sent",
  reasonFrom: "Reason from DYE CUT LAB:",
  changeHeading: "Changes you made",
  changeIntro: "Changed the artwork, the material, the price or the timing? Tell DYE CUT LAB what changed and why. It helps us learn and quote faster next time.",
  changeKind: "What kind of change",
  choose: "Choose…",
  whatChanged: "What changed",
  whatChangedHint: "For example: changed from 350 gsm to 400 gsm board",
  why: "Why",
  whyHint: "For example: the 350 gsm board is out of stock",
  recordChange: "Record this change",
  noteForever: "A note cannot be edited or deleted once it is recorded.",
  whyLabel: "Why:",
  briefHeading: "Manufacturing brief",
  noSpecs: "No specifications recorded yet. DYE CUT LAB will add them.",
  asked: "What was asked for",
  files: "Files",
  noFiles: "No files yet. Artwork and references will appear here.",
  download: "Download",
  downloadMissing: "Download unavailable. Ask DYE CUT LAB.",
  linksValid: "Download links stay valid for 15 minutes. Reload the page for fresh ones.",
  // the quote form
  qQuantity: "Quantity (pieces)",
  qPrice: "Price per piece (USD)",
  qTooling: "Tooling, one time (USD)",
  qToolingHint: "0.00, or empty if none",
  qLead: "Lead time (days)",
  qLeadHint: "Production days",
  qNotes: "Notes for DYE CUT LAB (optional)",
  qTotal: "Total",
  qTotalNote: "Quantity × price per piece + tooling. Shipping is not included.",
  qSend: "Send quote",
  qReview: "DYE CUT LAB reviews it before anything goes to the customer. Sending again replaces a quote that is still waiting.",
};

export type PortalText = typeof EN;

const ZH: PortalText = {
  role: "工厂",
  switchLabel: "语言",
  portalTitle: "工厂门户。",
  introLinked: (who, factory) => `已登录：${who}。DYE CUT LAB 分配给 ${factory} 的工作会显示在这里。`,
  introAttention: (n) => (n === 1 ? "有 1 个项目需要您处理。" : `有 ${n} 个项目需要您处理。`),
  introCalm: "目前没有需要您处理的事项。以下是您项目的进展情况。",
  introNoFactory: (who) => `已登录：${who}。此账号尚未关联工厂，请联系 DYE CUT LAB 进行设置。`,
  summary: "概览",
  chipNeedYou: "待您处理",
  chipOnTheWay: "进行中",
  chipDelivered: "已送达",
  productionJobs: "生产任务",
  nothingAssigned: "暂无分配的项目。DYE CUT LAB 发给您项目后，需求简介、文件和状态会显示在这里。",
  attentionA: "需要您",
  attentionB: "处理",
  onTheWay: "进行中",
  delivered: (n) => `已送达（${n}）`,
  yourDetails: "我们记录的您的资料",
  factory: "工厂",
  notLinked: "尚未关联",
  contactOnRecord: "联系人",
  emailOnRecord: "邮箱",
  phoneOnRecord: "电话",
  wrongBefore: "资料有误？请致电或发短信至 ",
  wrongMid: "，或发送邮件至 ",
  wrongAfter: "。",
  backToSite: "返回网站",
  openProject: "打开项目",
  pieces: (n) => `${n} 个`,
  untitled: "未命名项目",
  allProjects: "← 所有项目",
  briefTitle: "项目简介",
  assigned: "分配于",
  moveSeen: "DYE CUT LAB 和客户会立即看到此更新。",
  quoteHeading: "您的报价",
  quoteIntro: "请提交此项目的价格。所有金额均以美元计。",
  quoteApproved: "您的报价已获批准，谢谢。",
  quoteClosed: "此项目已不再接受新报价。",
  quotesSent: "您已提交的报价",
  version: (n, total) => `第 ${n} 版 · ${total}`,
  toolingWord: "模具费",
  days: (n) => `${n} 天`,
  sent: "提交于",
  reasonFrom: "DYE CUT LAB 的说明：",
  changeHeading: "您所做的更改",
  changeIntro: "更改了设计稿、材料、价格或时间？请告诉 DYE CUT LAB 更改了什么以及原因。这有助于我们下次更快地报价。",
  changeKind: "更改类型",
  choose: "请选择…",
  whatChanged: "更改了什么",
  whatChangedHint: "例如：由 350 克卡纸改为 400 克卡纸",
  why: "原因",
  whyHint: "例如：350 克卡纸缺货",
  recordChange: "记录此更改",
  noteForever: "记录后无法编辑或删除。",
  whyLabel: "原因：",
  briefHeading: "生产简介",
  noSpecs: "尚未记录规格。DYE CUT LAB 会补充。",
  asked: "客户的要求",
  files: "文件",
  noFiles: "暂无文件。设计稿和参考资料会显示在这里。",
  download: "下载",
  downloadMissing: "无法下载，请联系 DYE CUT LAB。",
  linksValid: "下载链接 15 分钟内有效。请刷新页面获取新链接。",
  qQuantity: "数量（个）",
  qPrice: "单价（美元）",
  qTooling: "模具费，一次性（美元）",
  qToolingHint: "0.00，没有则留空",
  qLead: "生产周期（天）",
  qLeadHint: "生产天数",
  qNotes: "给 DYE CUT LAB 的备注（选填）",
  qTotal: "合计",
  qTotalNote: "数量 × 单价 + 模具费。不含运费。",
  qSend: "提交报价",
  qReview: "DYE CUT LAB 审核后才会发给客户。再次提交会替换仍在等待中的报价。",
};

export function portalText(lang: Lang): PortalText {
  return lang === "zh" ? ZH : EN;
}

/* ---------------------------------------------------------------------------
   Project stages, what is on the factory, the brief, files, change kinds, quote statuses
   --------------------------------------------------------------------------- */

const STAGES_ZH: Record<string, string> = {
  lead: "线索",
  development: "开发中",
  quote_ready: "报价就绪",
  factory_review: "工厂审核",
  approved: "已批准",
  payment: "付款",
  proof: "打样确认",
  production: "生产中",
  qc: "质检",
  shipping: "发货",
  delivered: "已送达",
};

/* The stage as the reader should see it; an unknown value shows as it is. */
export function stageLabelFor(lang: Lang, status: string | null | undefined, english: string): string {
  return lang === "zh" ? (STAGES_ZH[(status || "").toLowerCase()] ?? english) : english;
}

const NEXT_ZH: Record<string, NextStep> = {
  lead: { headline: "尚未就绪", detail: "DYE CUT LAB 仍在向客户收集详细信息。" },
  development: { headline: "尚未就绪", detail: "DYE CUT LAB 仍在与客户确定需求简介。" },
  quote_ready: { headline: "由 DYE CUT LAB 处理", detail: "估价已发给客户。如果项目继续推进，会请您审核。" },
  factory_review: { headline: "审核需求简介", detail: "请查看规格，然后与 DYE CUT LAB 确认价格和交货期。", cta: "打开简介" },
  approved: { headline: "报价已批准", detail: "等待客户付款后开始生产。" },
  payment: { headline: "等待付款", detail: "客户付款后开始生产。" },
  proof: { headline: "打样阶段", detail: "请准备供客户确认的样稿。", cta: "打开简介" },
  production: { headline: "生产中", detail: "请随时向 DYE CUT LAB 更新进度。", cta: "打开简介" },
  qc: { headline: "质量检查", detail: "出货前的最终检查和拍照。", cta: "打开简介" },
  shipping: { headline: "已发货", detail: "货物在途。DYE CUT LAB 正在跟踪送达情况。" },
  delivered: { headline: "已送达", detail: "此项目无需再做任何操作。" },
};
const NEXT_ZH_FALLBACK: NextStep = { headline: "进行中", detail: "打开项目查看最新情况。" };

export function nextStepZh(status: string | null | undefined): NextStep {
  return NEXT_ZH[(status || "").toLowerCase()] ?? NEXT_ZH_FALLBACK;
}

export const BRIEF_LABELS_ZH: Record<string, string> = {
  product_type: "产品",
  quantity: "数量",
  units: "单位",
  size: "尺寸",
  box_dimensions: "盒子尺寸",
  pouch_size: "袋子尺寸",
  closure: "封口方式",
  material: "材料",
  finish: "表面处理",
  flavor_count: "口味数量",
  flavor_split: "口味分配",
  use_type: "用途",
  artwork_status: "设计稿状态",
};

export const FILE_CATEGORY_ZH: Record<string, string> = {
  artwork: "设计稿",
  reference: "参考",
  production: "生产",
  sample: "样品",
  other: "其他",
};

export const CHANGE_KIND_ZH: Record<string, string> = {
  artwork: "设计稿",
  price: "价格",
  material: "材料",
  finish: "表面处理",
  timing: "时间",
  other: "其他",
};

export const QUOTE_STATUS_ZH: Record<string, string> = {
  submitted: "等待 DYE CUT LAB 审核",
  approved: "已批准",
  rejected: "未被接受",
  superseded: "已被新报价取代",
};

export const MOVES_ZH: Record<string, { button: string; note: string }> = {
  production: { button: "转到质量检查", note: "生产已完成，您正在出货前检查。" },
  qc: { button: "标记为已发货", note: "质量检查已通过，货物已离开您的工厂。" },
};

/* Banner sentences after an action (?ok= and ?error=). */
export const MESSAGES_ZH: Record<string, string> = {
  moved_qc: "已转到质量检查。DYE CUT LAB 和客户都能看到此更新。",
  moved_shipping: "已标记为已发货。DYE CUT LAB 和客户都能看到此更新。",
  change_recorded: "更改已记录。DYE CUT LAB 会保存它，帮助团队不断改进。",
  change_invalid: "无法保存该记录。请检查填写的内容后重试。",
  quote_sent: "报价已提交。DYE CUT LAB 审核后才会发给客户。",
  quote_closed: "此项目已不再接受报价。",
  quote_approved: "此项目已有获批的报价。",
  quote_invalid: "无法提交该报价。请检查数值后重试。",
  stale: "此项目的状态已发生变化。请查看下方内容后重试。",
  save_failed: "未能保存，请重试。",
  not_found: "找不到该项目。",
  invalid: "此链接似乎有误。请从您的项目列表中打开项目。",
  rate_limited: "一分钟内操作过多。请稍等片刻后重试。",
  no_service_key: "状态更新功能尚未开启。请告知 DYE CUT LAB。",
  thread_sent: "消息已发送。DYE CUT LAB 会看到英文翻译。",
  thread_flagged: "消息已发送。翻译可能改动了某些细节，DYE CUT LAB 会对照您的原文核对。",
  thread_untranslated: "消息已发送，但翻译未完成。完成前 DYE CUT LAB 看到的是您的原文。",
  thread_failed: "无法发送该消息。",
  correction_corrected: "更正已保存。更正后的内容已替换原翻译，并会被保留，用于改进今后的翻译。",
  correction_flagged: "更正已保存，但其中改动或遗漏了原文中的数字。DYE CUT LAB 会看到核对提示。",
  correction_failed: "无法保存该更正。",
};

/* The plain sentences a refused form can come back with (from lib/factoryQuote.ts, lib/factoryChange.ts and
   lib/factoryThread.ts), so a Chinese reader is not shown English. An unknown sentence stays as it is. */
const WHY_ZH: Record<string, string> = {
  "Fill in the quantity.": "请填写数量。",
  "The quantity must be a whole number of at least 1.": "数量必须是不小于 1 的整数。",
  "Fill in the price per piece.": "请填写单价。",
  "The price per piece must be a number.": "单价必须是数字。",
  "The price per piece must be above zero.": "单价必须大于零。",
  "The price per piece looks too large. Check it and try again.": "单价似乎过大。请检查后重试。",
  "The tooling cost must be a number (or leave it empty if there is none).": "模具费必须是数字（没有则留空）。",
  "The lead time must be a whole number of days.": "生产周期必须是整数天数。",
  "The notes are too long (up to 2,000 characters).": "备注过长（最多 2,000 个字符）。",
  "You can only send a quote for a project assigned to your factory.": "您只能为分配给您工厂的项目提交报价。",
  "The database refused one of those numbers. Check the values and try again.": "其中一个数值被拒绝。请检查后重试。",
  "That did not save. Please try again.": "未能保存，请重试。",
  "Choose what kind of change it was.": "请选择更改类型。",
  "Say what changed.": "请说明更改了什么。",
  "Say why it changed. DYE CUT LAB keeps this to learn from.": "请说明更改的原因。DYE CUT LAB 会保存它以便学习改进。",
  "You can only record a change on a project assigned to your factory.": "您只能为分配给您工厂的项目记录更改。",
  "The database refused that note. Check what you typed and try again.": "该记录被拒绝。请检查填写的内容后重试。",
  "Write a message first.": "请先输入消息。",
  "The message is too long (up to 4,000 characters).": "消息过长（最多 4,000 个字符）。",
  "You can only write in the thread of a project assigned to your factory.": "您只能在分配给您工厂的项目中发送消息。",
  "This project has no factory yet, or the message was refused. Check it and try again.": "此项目尚未分配工厂，或消息被拒绝。请检查后重试。",
  "That did not send. Please try again.": "未能发送，请重试。",
  "That message could not be found.": "找不到该消息。",
  "Choose what was wrong with the translation.": "请选择翻译的问题所在。",
  "Write the corrected translation.": "请填写更正后的翻译。",
  "The corrected translation is too long (up to 12,000 characters).": "更正后的翻译过长（最多 12,000 个字符）。",
  "The note is too long (up to 1,000 characters).": "备注过长（最多 1,000 个字符）。",
  'Say what was wrong when you choose "Something else".': "选择“其他”时，请说明问题所在。",
  "You can only correct a message on a project you can see.": "您只能更正自己可见项目中的消息。",
  "That correction was refused. Only a finished translation of the other side's message can be corrected, and it must change it.":
    "该更正被拒绝。只能更正对方消息的已完成翻译，且必须有所改动。",
};

export function localizeWhy(lang: Lang, sentence: string): string {
  if (lang !== "zh") return sentence;
  if (WHY_ZH[sentence]) return WHY_ZH[sentence];
  /* the two with a number in them */
  const long = sentence.match(/^"(What changed|Why)" is too long \(up to ([\d,]+) characters\)\.$/);
  if (long) return `“${long[1] === "Why" ? "原因" : "更改了什么"}”过长（最多 ${long[2]} 个字符）。`;
  return sentence;
}

export function portalDate(lang: Lang, value: string): string {
  return new Date(value).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}
