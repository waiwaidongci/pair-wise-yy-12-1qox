// 领域规则：全部为纯函数，不依赖 React / localStorage。
// 业务红线集中在本文件：
//  - 每匹马仅一张未结束适配单
//  - 四蹄长宽、钉孔距、钉位、步态分级缺项不得启动
//  - 任一蹄尺寸差>2mm / 钉孔模式不符 / 钉位落入蹄底敏感区 => 整单待备料，库存不扣减
//  - 试装后另一名蹄铁师连续两次确认才完成
//  - 修正测量 / 换蹄铁 / 停用库存使结论失效；旧单留档、不重复扣库

import {
  Confirmation,
  Deduction,
  FittingOrder,
  Farrier,
  GaitGrade,
  HOOF_KEYS,
  HOOF_LABELS,
  HoofInput,
  HoofIssue,
  HoofKey,
  HoofKind,
  NailPosition,
  OrderEvent,
  ReminderItem,
  Shoe,
  StockMovement,
} from "./types";

// ---------- 常量（规则阈值） ----------

export const SIZE_TOLERANCE_MM = 2; // 蹄-蹄铁长宽差超过此值 => 不合
export const SPACING_TOLERANCE_MM = 2; // 钉孔距公差
export const SENSITIVE_MARGIN_MM = 20; // 钉位距蹄踵小于此值 => 落入蹄底敏感区
export const REQUIRED_PASSES = 2; // 连续两次确认

// ---------- 基础工具 ----------

export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}${rand}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(todayISO() + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function hoofKind(key: HoofKey): HoofKind {
  return key.endsWith("F") ? "front" : "hind";
}

export function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export function makeEvent(
  type: OrderEvent["type"],
  text: string,
  by?: string
): OrderEvent {
  return { at: nowISO(), type, text, by };
}

export function emptyNails(): NailPosition[] {
  // 默认 6 孔：内3外3，钉位待测量
  const nails: NailPosition[] = [];
  (["medial", "lateral"] as const).forEach((side) => {
    for (let i = 0; i < 3; i++) {
      nails.push({ id: uid("n-"), side, fromHeelMm: "" });
    }
  });
  return nails;
}

export function nailsForPattern(pattern: HoofInput["pattern"]): NailPosition[] {
  const perSide = pattern === "P6" ? 3 : pattern === "P7" ? 3 : 4;
  const nails: NailPosition[] = [];
  (["medial", "lateral"] as const).forEach((side, sideIdx) => {
    const count = pattern === "P7" && sideIdx === 0 ? perSide + 1 : perSide;
    for (let i = 0; i < count; i++) {
      nails.push({ id: uid("n-"), side, fromHeelMm: "" });
    }
  });
  return nails;
}

export function emptyHoof(): HoofInput {
  return {
    lengthMm: "",
    widthMm: "",
    nailSpacingMm: "",
    pattern: "P6",
    nails: emptyNails(),
    shoeId: null,
  };
}

// ---------- 缺项：四蹄长宽 / 钉孔距 / 钉位 / 步态分级 ----------

export interface MissingField {
  scope: string;
  field: string;
}

export function findMissingFields(order: FittingOrder): MissingField[] {
  const missing: MissingField[] = [];
  for (const key of HOOF_KEYS) {
    const h = order.hooves[key];
    const label = HOOF_LABELS[key];
    if (!isFiniteNum(h.lengthMm)) missing.push({ scope: label, field: "蹄长" });
    if (!isFiniteNum(h.widthMm)) missing.push({ scope: label, field: "蹄宽" });
    if (!isFiniteNum(h.nailSpacingMm))
      missing.push({ scope: label, field: "钉孔距" });
    h.nails.forEach((n, i) => {
      if (!isFiniteNum(n.fromHeelMm)) {
        missing.push({
          scope: label,
          field: `${n.side === "medial" ? "内侧" : "外侧"}钉位${i + 1}`,
        });
      }
    });
  }
  if (!order.gaitGrade) missing.push({ scope: "整体", field: "步态分级" });
  if (!order.farrierId) missing.push({ scope: "整体", field: "装蹄蹄铁师" });
  if (!order.nextReviewDate)
    missing.push({ scope: "整体", field: "下次复查日期" });
  return missing;
}

// ---------- 单蹄校验 ----------

export interface EvaluateContext {
  shoes: Shoe[];
  // 该蹄已经领用 / 已沿用的蹄铁（视为已备料，不再占用库存）
  alreadyIssued?: Map<HoofKey, string>;
}

export function evaluateHoof(
  key: HoofKey,
  hoof: HoofInput,
  ctx: EvaluateContext
): HoofIssue[] {
  const issues: HoofIssue[] = [];
  const label = HOOF_LABELS[key];

  if (!hoof.shoeId) {
    issues.push({ code: "SHOE_MISSING", message: `${label}未选配蹄铁` });
    return issues; // 缺蹄铁时后续尺寸比较无意义
  }

  const shoe = ctx.shoes.find((s) => s.id === hoof.shoeId) ?? null;
  if (!shoe) {
    issues.push({
      code: "SHOE_MISSING",
      message: `${label}选配的蹄铁在库存中不存在`,
    });
    return issues;
  }

  const issuedId = ctx.alreadyIssued?.get(key);
  const isIssued = issuedId === shoe.id;

  if (!shoe.active) {
    issues.push({
      code: "SHOE_INACTIVE",
      message: `${label}的「${shoe.sku} ${shoe.name}」已停用库存`,
    });
  }
  if (!isIssued && shoe.qty <= 0) {
    issues.push({
      code: "SHOE_EMPTY",
      message: `${label}的「${shoe.sku}」库存为 0`,
    });
  }
  if (!isIssued && shoe.qty > 0 && shoe.qty < 1) {
    // 数量为小数等异常场景兜底
    issues.push({ code: "SHOE_EMPTY", message: `${label}的蹄铁库存不足` });
  }

  // 前/后蹄适配
  if (shoe.kind !== "universal" && shoe.kind !== hoofKind(key)) {
    issues.push({
      code: "POSITION_MISMATCH",
      message: `${label}不能使用${shoe.kind === "front" ? "前蹄" : "后蹄"}蹄铁「${
        shoe.sku
      }」`,
    });
  }

  if (isFiniteNum(hoof.lengthMm)) {
    const diff = Math.abs(hoof.lengthMm - shoe.lengthMm);
    if (diff > SIZE_TOLERANCE_MM) {
      issues.push({
        code: "LENGTH_DIFF",
        message: `${label}蹄长 ${hoof.lengthMm}mm 与蹄铁 ${
          shoe.lengthMm
        }mm 相差 ${diff.toFixed(1)}mm（>2mm）`,
      });
    }
  }
  if (isFiniteNum(hoof.widthMm)) {
    const diff = Math.abs(hoof.widthMm - shoe.widthMm);
    if (diff > SIZE_TOLERANCE_MM) {
      issues.push({
        code: "WIDTH_DIFF",
        message: `${label}蹄宽 ${hoof.widthMm}mm 与蹄铁 ${
          shoe.widthMm
        }mm 相差 ${diff.toFixed(1)}mm（>2mm）`,
      });
    }
  }
  if (isFiniteNum(hoof.nailSpacingMm)) {
    const diff = Math.abs(hoof.nailSpacingMm - shoe.holeSpacingMm);
    if (diff > SPACING_TOLERANCE_MM) {
      issues.push({
        code: "SPACING_DIFF",
        message: `${label}钉孔距 ${hoof.nailSpacingMm}mm 与蹄铁 ${shoe.holeSpacingMm}mm 相差 ${diff.toFixed(1)}mm（>2mm）`,
      });
    }
  }
  if (hoof.pattern !== shoe.pattern) {
    issues.push({
      code: "PATTERN_MISMATCH",
      message: `${label}钉孔模式（蹄 ${hoof.pattern} / 蹄铁 ${shoe.pattern}）不符`,
    });
  }

  hoof.nails.forEach((n, i) => {
    if (
      isFiniteNum(n.fromHeelMm) &&
      n.fromHeelMm < SENSITIVE_MARGIN_MM
    ) {
      issues.push({
        code: "NAIL_SENSITIVE",
        message: `${label}${n.side === "medial" ? "内侧" : "外侧"}钉位${
          i + 1
        } 距蹄踵 ${n.fromHeelMm}mm，落入蹄底敏感区（<${SENSITIVE_MARGIN_MM}mm）`,
      });
    }
  });

  return issues;
}

export type OrderIssues = Partial<Record<HoofKey, HoofIssue[]>>;

// 已领用/沿用映射：这些蹄铁视作已备料，不再受当前库存影响
export function issuedMap(order: FittingOrder): Map<HoofKey, string> {
  const map = new Map<HoofKey, string>();
  [...order.carriedDeductions, ...order.deductions].forEach((d) => {
    if (!map.has(d.hoofKey)) map.set(d.hoofKey, d.shoeId);
  });
  return map;
}

export function evaluateOrder(order: FittingOrder, shoes: Shoe[]): OrderIssues {
  const result: OrderIssues = {};
  const already = issuedMap(order);
  for (const key of HOOF_KEYS) {
    const issues = evaluateHoof(key, order.hooves[key], {
      shoes,
      alreadyIssued: already,
    });
    if (issues.length > 0) result[key] = issues;
  }
  return result;
}

export function blockingIssues(issues: OrderIssues): HoofIssue[] {
  return HOOF_KEYS.flatMap((k) => issues[k] ?? []);
}

// 钉孔数量与钉位数量不一致仅作提示（非阻断）
export function nailCountWarnings(order: FittingOrder): string[] {
  const warnings: string[] = [];
  for (const key of HOOF_KEYS) {
    const h = order.hooves[key];
    const filled = h.nails.filter((n) => isFiniteNum(n.fromHeelMm)).length;
    const expected =
      h.pattern === "P6" ? 6 : h.pattern === "P7" ? 7 : 8;
    if (filled > 0 && filled !== expected) {
      warnings.push(
        `${HOOF_LABELS[key]}：${h.pattern} 模式应有 ${expected} 个钉位，当前填了 ${filled} 个`
      );
    }
  }
  return warnings;
}

// ---------- 自动推荐蹄铁 ----------

export interface ShoeSuggestion {
  shoe: Shoe;
  score: number; // 越小越匹配
  exact: boolean;
  reasons: string[];
}

export function suggestShoe(
  key: HoofKey,
  hoof: HoofInput,
  shoes: Shoe[],
  issuedId?: string
): ShoeSuggestion | null {
  let best: ShoeSuggestion | null = null;
  for (const shoe of shoes) {
    // 已领用/沿用的蹄铁始终首选
    if (issuedId && shoe.id === issuedId) {
      return {
        shoe,
        score: -1,
        exact: true,
        reasons: ["沿用已领用蹄铁，不再扣库"],
      };
    }
    if (!shoe.active || shoe.qty <= 0) continue;
    if (shoe.kind !== "universal" && shoe.kind !== hoofKind(key)) continue;

    let score = 0;
    const reasons: string[] = [];
    if (isFiniteNum(hoof.lengthMm)) {
      const d = Math.abs(hoof.lengthMm - shoe.lengthMm);
      score += d;
      if (d <= SIZE_TOLERANCE_MM) reasons.push(`蹄长差 ${d.toFixed(1)}mm`);
    }
    if (isFiniteNum(hoof.widthMm)) {
      const d = Math.abs(hoof.widthMm - shoe.widthMm);
      score += d;
      if (d <= SIZE_TOLERANCE_MM) reasons.push(`蹄宽差 ${d.toFixed(1)}mm`);
    }
    if (isFiniteNum(hoof.nailSpacingMm)) {
      const d = Math.abs(hoof.nailSpacingMm - shoe.holeSpacingMm);
      score += d * 2;
    }
    if (hoof.pattern === shoe.pattern) {
      score -= 1;
      reasons.push("钉孔模式一致");
    } else {
      score += 100;
    }
    if (shoe.kind === hoofKind(key)) score -= 0.5;
    if (!best || score < best.score) best = { shoe, score, exact: false, reasons };
  }
  if (best && best.score <= SIZE_TOLERANCE_MM * 2 + 1) best.exact = true;
  return best;
}

// ---------- 启动 / 备料计划（库存扣减只在这里发生） ----------

export interface IssuePlan {
  ok: boolean;
  movements: StockMovement[]; // 负值扣库、正值退库
  deductions: Deduction[]; // 新产生的领用记录
  carried: Deduction[]; // 沿用的旧单记录
  blocking: { hoofKey: HoofKey; issue: HoofIssue }[];
}

// 计算把 order 备料到 awaiting_trial 需要的库存变化
export function planIssue(
  order: FittingOrder,
  shoes: Shoe[],
  carryOver: Deduction[] = []
): IssuePlan {
  const movements: StockMovement[] = [];
  const deductions: Deduction[] = [];
  const carried: Deduction[] = [];
  const blocking: IssuePlan["blocking"] = [];

  // 当前蹄上已经领用的 shoe（本单扣过的 + 刚沿用的）
  const haveOnHoof = new Map<HoofKey, string>();
  order.deductions.forEach((d) => haveOnHoof.set(d.hoofKey, d.shoeId));
  carryOver.forEach((d) => haveOnHoof.set(d.hoofKey, d.shoeId));

  for (const key of HOOF_KEYS) {
    const hoof = order.hooves[key];
    const issues = evaluateHoof(key, hoof, {
      shoes,
      alreadyIssued: haveOnHoof,
    });
    if (issues.length > 0) {
      issues.forEach((issue) => blocking.push({ hoofKey: key, issue }));
      continue;
    }
    if (!hoof.shoeId) continue;
    const current = haveOnHoof.get(key);
    if (current === hoof.shoeId) {
      // 蹄上已是该蹄铁：沿用旧领用，不重复扣库
      const prior =
        carryOver.find((d) => d.hoofKey === key) ??
        order.deductions.find((d) => d.hoofKey === key);
      if (prior) {
        if (carryOver.some((d) => d.id === prior.id)) carried.push(prior);
      }
      continue;
    }
    // 旧蹄铁退回库存
    if (current) {
      movements.push({
        shoeId: current,
        delta: +1,
        reason: "swap_out",
        hoofKey: key,
      });
    }
    // 新蹄铁扣库
    movements.push({
      shoeId: hoof.shoeId,
      delta: -1,
      reason: current ? "swap_in" : "issue",
      hoofKey: key,
    });
    deductions.push({
      id: uid("d-"),
      shoeId: hoof.shoeId,
      hoofKey: key,
      source: "issued",
      at: nowISO(),
    });
    haveOnHoof.set(key, hoof.shoeId);
  }

  return {
    ok: blocking.length === 0,
    movements,
    deductions,
    carried,
    blocking,
  };
}

// ---------- 试装与双确认 ----------

export function canSubmitConfirmation(
  order: FittingOrder,
  confirmerId: string
): string | null {
  if (order.status !== "awaiting_trial") return "当前不在待试装阶段";
  if (!order.trialFittedAt) return "尚未标记试装完成";
  if (!confirmerId) return "请选择复核蹄铁师";
  if (confirmerId === order.farrierId)
    return "复核蹄铁师必须与装蹄蹄铁师为不同人";
  return null;
}

// 从尾部开始连续通过的次数（遇失败即中断）
export function trailingPasses(confirmations: Confirmation[]): number {
  let n = 0;
  for (let i = confirmations.length - 1; i >= 0; i--) {
    const c = confirmations[i];
    if (c.gaitStable && c.shoeSecure) n += 1;
    else break;
  }
  return n;
}

export function validConfirmers(
  order: FittingOrder,
  farriers: Farrier[]
): Farrier[] {
  return farriers.filter((f) => f.id !== order.farrierId);
}

// ---------- 马匹唯一未结束单 ----------

const OPEN_STATUSES = ["draft", "pending_material", "awaiting_trial"] as const;
export function isOpenStatus(status: FittingOrder["status"]): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function openOrderForHorse(
  orders: FittingOrder[],
  horseCode: string,
  excludeId?: string
): FittingOrder | undefined {
  return orders.find(
    (o) =>
      o.horseCode.trim() === horseCode.trim() &&
      isOpenStatus(o.status) &&
      o.id !== excludeId
  );
}

// ---------- 停用库存影响 ----------

// 哪些进行中的单使用了被停用蹄铁（需回退待备料、旧结论失效）
export function affectedOrdersByDeactivation(
  orders: FittingOrder[],
  shoeId: string
): FittingOrder[] {
  return orders.filter(
    (o) =>
      isOpenStatus(o.status) &&
      HOOF_KEYS.some((k) => o.hooves[k].shoeId === shoeId)
  );
}

export function completedOrdersUsingShoe(
  orders: FittingOrder[],
  shoeId: string
): FittingOrder[] {
  return orders.filter(
    (o) =>
      (o.status === "completed" || o.status === "archived") &&
      HOOF_KEYS.some((k) => o.hooves[k].shoeId === shoeId)
  );
}

// ---------- 提醒与指标（列表、库存、提醒刷新一致，均来自同一数据） ----------

export function buildReminders(
  orders: FittingOrder[],
  shoes: Shoe[]
): ReminderItem[] {
  const items: ReminderItem[] = [];

  for (const o of orders) {
    if (!isOpenStatus(o.status) && o.status !== "completed") continue;
    const d = daysUntil(o.nextReviewDate);
    if (d !== null && d <= 3) {
      items.push({
        id: `review-${o.id}`,
        kind: d < 0 ? "overdue" : d === 0 ? "review_today" : "review_soon",
        title:
          d < 0
            ? `${o.horseCode} 复查已逾期 ${-d} 天`
            : d === 0
            ? `${o.horseCode} 今日复查`
            : `${o.horseCode} ${d} 天后复查`,
        orderId: o.id,
        date: o.nextReviewDate,
      });
    }
    if (
      isOpenStatus(o.status) &&
      (o.gaitGrade === "moderate" || o.gaitGrade === "severe")
    ) {
      items.push({
        id: `gait-${o.id}`,
        kind: "gait",
        title: `${o.horseCode} 步态分级异常（${
          o.gaitGrade === "severe" ? "明显跛行" : "中度异常"
        }）`,
        orderId: o.id,
      });
    }
    if (o.status === "pending_material") {
      items.push({
        id: `material-${o.id}`,
        kind: "material",
        title: `${o.horseCode} 适配单停在待备料`,
        orderId: o.id,
      });
    }
    if (o.status === "awaiting_trial") {
      const passes = trailingPasses(o.confirmations);
      if (passes < REQUIRED_PASSES) {
        items.push({
          id: `confirm-${o.id}`,
          kind: "confirm",
          title: `${o.horseCode} 待第 ${passes + 1} 次复核确认（需另一名蹄铁师）`,
          orderId: o.id,
        });
      }
    }
  }

  for (const s of shoes) {
    if (s.active && s.qty <= 2) {
      items.push({
        id: `stock-${s.id}`,
        kind: "low_stock",
        title: `蹄铁 ${s.sku} ${s.name} 库存不足（剩 ${s.qty}）`,
      });
    }
  }

  const rank: Record<ReminderItem["kind"], number> = {
    overdue: 0,
    review_today: 1,
    gait: 2,
    material: 3,
    confirm: 4,
    review_soon: 5,
    low_stock: 6,
  };
  return items.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export interface BoardMetrics {
  openOrders: number;
  pendingMaterial: number;
  awaitingTrial: number;
  abnormalGait: number;
  completed: number;
  lowStock: number;
}

export function buildMetrics(
  orders: FittingOrder[],
  shoes: Shoe[]
): BoardMetrics {
  return {
    openOrders: orders.filter((o) => isOpenStatus(o.status)).length,
    pendingMaterial: orders.filter((o) => o.status === "pending_material").length,
    awaitingTrial: orders.filter((o) => o.status === "awaiting_trial").length,
    abnormalGait: orders.filter(
      (o) =>
        isOpenStatus(o.status) &&
        (o.gaitGrade === "moderate" || o.gaitGrade === "severe")
    ).length,
    completed: orders.filter((o) => o.status === "completed").length,
    lowStock: shoes.filter((s) => s.active && s.qty <= 2).length,
  };
}

// 步态分级合法性（用于 UI 与规则双重确认）
export function gaitGradeValid(grade: GaitGrade): boolean {
  return grade === "normal" || grade === "mild" || grade === "moderate" || grade === "severe";
}
