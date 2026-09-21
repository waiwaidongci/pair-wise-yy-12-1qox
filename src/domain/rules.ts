import type {
  AppState,
  FittingOrder,
  GaitGrade,
  HoofAssignment,
  HoofCheck,
  HoofId,
  HoofMeasurement,
  NailSpot,
  OrderStatus,
  ShoeSku,
} from "./types";

// ---------- 常量 ----------

/** 尺寸超差阈值：任一蹄与库存蹄铁长宽差 > 2mm 即停在待备料 */
export const SIZE_TOLERANCE_MM = 2;
/** 钉孔距容差同样为 2mm */
export const SPACING_TOLERANCE_MM = 2;
/** 钉尖深入蹄壁超过此值即落入蹄底敏感区（安全余量） */
export const SENSITIVE_MARGIN_MM = 10;

export const HOOF_IDS: HoofId[] = ["LF", "RF", "LH", "RH"];

export const HOOF_META: Record<
  HoofId,
  { label: string; short: string; side: "front" | "hind"; lr: "left" | "right" }
> = {
  LF: { label: "左前蹄", short: "左前", side: "front", lr: "left" },
  RF: { label: "右前蹄", short: "右前", side: "front", lr: "right" },
  LH: { label: "左后蹄", short: "左后", side: "hind", lr: "left" },
  RH: { label: "右后蹄", short: "右后", side: "hind", lr: "right" },
};

export const GAIT_GRADES: { value: Exclude<GaitGrade, "">; label: string; tone: string }[] = [
  { value: "stable", label: "步态稳定", tone: "ok" },
  { value: "mild", label: "轻度异常", tone: "warn" },
  { value: "moderate", label: "中度异常", tone: "bad" },
  { value: "severe", label: "重度跛行", tone: "bad" },
];

export const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: "neutral" | "warn" | "ok" | "bad" | "lock"; desc: string }
> = {
  draft: { label: "测量中", tone: "neutral", desc: "四蹄数据未核验，可自由修改" },
  pendingStock: { label: "待备料", tone: "warn", desc: "核验未过，库存不扣减，等待备料或修蹄" },
  ready: { label: "待领用", tone: "ok", desc: "四蹄核验通过，可领用扣库" },
  issued: { label: "已领用·待试装", tone: "neutral", desc: "库存已扣减，等待试装确认" },
  trial: { label: "试装确认中", tone: "warn", desc: "需另一名蹄铁师连续两次确认" },
  completed: { label: "已完成", tone: "ok", desc: "两次确认通过，本次适配结束" },
  archived: { label: "已留档", tone: "lock", desc: "结论失效后留档，不重复扣库" },
};

/** 结论已产生、修改将导致失效的状态 */
export const CONCLUDED_STATUSES: OrderStatus[] = ["issued", "trial", "completed"];

export const GAIT_LABEL: Record<GaitGrade, string> = {
  "": "未评定",
  stable: "步态稳定",
  mild: "轻度异常",
  moderate: "中度异常",
  severe: "重度跛行",
};

// ---------- 工厂 ----------

export function emptyMeasurement(): HoofMeasurement {
  return { lengthMm: null, widthMm: null, nailSpacingMm: null, gaitGrade: "" };
}

export function emptyHoof(): HoofAssignment {
  return {
    measurement: emptyMeasurement(),
    shoeId: null,
    nails: [],
    carryOver: false,
    check: null,
  };
}

// ---------- 钉位 ----------

/**
 * 依据蹄铁钉孔生成默认钉位：
 * 蹄铁为 U 形开叉，钉孔均布在两侧蹄支（约 ±25° 到 ±70°），
 * 外侧为正、内侧为负，避开蹄尖正中与蹄底敏感区。
 */
export function buildNailPlan(shoe: ShoeSku): NailSpot[] {
  const n = Math.max(2, shoe.holeCount);
  const inner = 25;
  const outer = 70;
  const step = (outer - inner) / Math.ceil(n / 2);
  const spots: NailSpot[] = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    spots.push({ id: `n${spots.length + 1}`, angleDeg: round1(-(inner + step * (i + 1))), insetMm: 4 });
  }
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    spots.push({ id: `n${spots.length + 1}`, angleDeg: round1(inner + step * (i + 1)), insetMm: 4 });
  }
  return spots.sort((a, b) => a.angleDeg - b.angleDeg);
}

/** 钉尖是否落入蹄底敏感区。
 * 蹄铁外缘为椭圆（长轴=蹄铁长、短轴=蹄铁宽），钉深沿射线方向量入；
 * 敏感区为蹄铁内缘再留安全余量形成的椭圆，钉 tip 落在内椭圆内即判危险。
 */
export function nailInSensitive(shoe: ShoeSku, nail: NailSpot): boolean {
  const a = shoe.lengthMm / 2 - SENSITIVE_MARGIN_MM;
  const b = shoe.widthMm / 2 - SENSITIVE_MARGIN_MM;
  if (a <= 0 || b <= 0) return true;
  const rad = (nail.angleDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  // 外缘椭圆在该角度的极径
  const wallR =
    (shoe.lengthMm * shoe.widthMm) /
    2 /
    Math.sqrt((shoe.widthMm * sin) ** 2 + (shoe.lengthMm * cos) ** 2);
  const tipR = Math.max(0, wallR - nail.insetMm);
  const x = tipR * cos;
  const y = tipR * sin;
  return (x * x) / (a * a) + (y * y) / (b * b) <= 1;
}

// ---------- 缺项校验：四蹄长宽、钉孔距、步态分级缺项不得启动 ----------

export function hoofMissing(m: HoofMeasurement): string[] {
  const missing: string[] = [];
  if (m.lengthMm == null) missing.push("长");
  if (m.widthMm == null) missing.push("宽");
  if (m.nailSpacingMm == null) missing.push("钉孔距");
  if (!m.gaitGrade) missing.push("步态分级");
  return missing;
}

export function orderMissing(o: FittingOrder): { hoofId: HoofId; items: string[] }[] {
  const out: { hoofId: HoofId; items: string[] }[] = [];
  for (const id of HOOF_IDS) {
    const items = hoofMissing(o.hooves[id].measurement);
    if (items.length) out.push({ hoofId: id, items });
  }
  return out;
}

export function isComplete(o: FittingOrder): boolean {
  return orderMissing(o).length === 0;
}

// ---------- 单蹄核验：尺寸 >2mm、钉孔模式不符、钉位入敏感区 ----------

export function evaluateHoof(
  a: HoofAssignment,
  shoe: ShoeSku | undefined,
): HoofCheck {
  const m = a.measurement;
  const reasons: string[] = [];
  const sensitiveHits: string[] = [];
  const missing = hoofMissing(m);
  if (missing.length) {
    return {
      pass: false,
      lengthDelta: null,
      widthDelta: null,
      spacingDelta: null,
      reasons: [`测量缺项：${missing.join("、")}`],
      sensitiveHits,
    };
  }

  let lengthDelta: number | null = null;
  let widthDelta: number | null = null;
  let spacingDelta: number | null = null;

  if (!shoe) {
    reasons.push("未选配库存蹄铁");
  } else {
    if (!shoe.active && !a.carryOver) reasons.push(`蹄铁 ${shoe.id} 已停用`);

    lengthDelta = round1(m.lengthMm! - shoe.lengthMm);
    widthDelta = round1(m.widthMm! - shoe.widthMm);
    if (Math.abs(lengthDelta) > SIZE_TOLERANCE_MM) {
      reasons.push(`长度差 ${fmtSigned(lengthDelta)}mm（超 ${SIZE_TOLERANCE_MM}mm）`);
    }
    if (Math.abs(widthDelta) > SIZE_TOLERANCE_MM) {
      reasons.push(`宽度差 ${fmtSigned(widthDelta)}mm（超 ${SIZE_TOLERANCE_MM}mm）`);
    }

    // 钉孔模式：孔数一致 + 孔距差不超过 2mm
    spacingDelta = round1(m.nailSpacingMm! - shoe.nailSpacingMm);
    if (a.nails.length !== shoe.holeCount) {
      reasons.push(`钉孔模式不符：钉位 ${a.nails.length} 个 / 孔 ${shoe.holeCount} 个`);
    }
    if (Math.abs(spacingDelta) > SPACING_TOLERANCE_MM) {
      reasons.push(`钉孔距差 ${fmtSigned(spacingDelta)}mm（超 ${SPACING_TOLERANCE_MM}mm）`);
    }

    for (const nail of a.nails) {
      if (nailInSensitive(shoe, nail)) {
        sensitiveHits.push(nail.id);
      }
    }
    if (sensitiveHits.length) {
      reasons.push(`钉位 ${sensitiveHits.join("、")} 落入蹄底敏感区`);
    }
  }

  return { pass: reasons.length === 0, lengthDelta, widthDelta, spacingDelta, reasons, sensitiveHits };
}

/** 整单核验：任一蹄不过则停在待备料；同时校验可扣库存是否充足（不扣减） */
export function evaluateOrder(
  o: FittingOrder,
  shoes: ShoeSku[],
): { pass: boolean; hoofReports: Record<HoofId, HoofCheck>; demand: Map<string, number>; shortage: string[] } {
  const byId = new Map(shoes.map((s) => [s.id, s]));
  const hoofReports = {} as Record<HoofId, HoofCheck>;
  let pass = true;

  for (const id of HOOF_IDS) {
    const a = o.hooves[id];
    const report = evaluateHoof(a, a.shoeId ? byId.get(a.shoeId) : undefined);
    hoofReports[id] = report;
    if (!report.pass) pass = false;
  }

  // 库存模拟占用：同一张单内同一 SKU 多蹄使用需合计
  const demand = new Map<string, number>();
  const shortage: string[] = [];
  if (pass) {
    for (const id of HOOF_IDS) {
      const a = o.hooves[id];
      if (a.carryOver) continue; // 沿用旧蹄铁不扣库
      const sku = byId.get(a.shoeId!);
      if (!sku) continue;
      demand.set(sku.id, (demand.get(sku.id) ?? 0) + 1);
    }
    for (const [id, need] of demand) {
      const sku = byId.get(id)!;
      if (!sku.active || sku.quantity < need) {
        shortage.push(`${sku.name}（需 ${need}，可用 ${sku.quantity}）`);
        pass = false;
      }
    }
  }

  return { pass, hoofReports, demand, shortage };
}

// ---------- 状态流转 ----------

/** 核验后落点：全过 → 待领用；任一不过 → 待备料（库存不扣减） */
export function statusAfterCheck(pass: boolean): OrderStatus {
  return pass ? "ready" : "pendingStock";
}

/** 试装确认：步态稳定且蹄铁无松动，且确认人非开单蹄铁师 */
export function applyConfirmation(
  o: FittingOrder,
  confirmer: string,
  gaitStable: boolean,
  shoeSecure: boolean,
): { ok: boolean; error?: string; confirmations: TrialConfirmationLike[]; nextStatus: OrderStatus } {
  const confirmations = [...o.confirmations];
  if (o.status !== "issued" && o.status !== "trial") {
    return { ok: false, error: "当前状态不可确认", confirmations, nextStatus: o.status };
  }
  if (confirmer.trim() === o.farrier.trim()) {
    return { ok: false, error: "必须由另一名蹄铁师确认（不可为开单人）", confirmations, nextStatus: o.status };
  }
  if (!gaitStable || !shoeSecure) {
    // 任一不满足：连续计数清零，需重新连续两次
    return {
      ok: true,
      confirmations: [],
      nextStatus: "trial",
    };
  }
  confirmations.push({
    at: nowStamp(),
    confirmer: confirmer.trim(),
    gaitStable,
    shoeSecure,
    note: "",
  });
  // 同一人连续两次确认可接受；关键约束是“另一名”且“连续”
  const nextStatus: OrderStatus = confirmations.length >= 2 ? "completed" : "trial";
  return { ok: true, confirmations, nextStatus };
}

type TrialConfirmationLike = FittingOrder["confirmations"][number];

// ---------- 库存需求 ----------

/** 本单实际扣库的 SKU 数量（沿用蹄铁不扣） */
export function orderDeductions(o: FittingOrder): Map<string, number> {
  const demand = new Map<string, number>();
  for (const id of HOOF_IDS) {
    const a = o.hooves[id];
    if (!a.shoeId || a.carryOver) continue;
    demand.set(a.shoeId, (demand.get(a.shoeId) ?? 0) + 1);
  }
  return demand;
}

// ---------- 提醒 ----------

export interface Reminder {
  kind: "stock" | "trial" | "recheck" | "open";
  level: "warn" | "bad" | "info";
  title: string;
  detail: string;
  orderId?: string;
}

export function buildReminders(state: AppState, todayISO: string): Reminder[] {
  const list: Reminder[] = [];
  const open = state.orders.filter((o) => o.status !== "completed" && o.status !== "archived");

  for (const o of open) {
    if (o.status === "pendingStock") {
      const badHooves = HOOF_IDS.filter((id) => o.hooves[id].check && !o.hooves[id].check!.pass);
      list.push({
        kind: "stock",
        level: "warn",
        title: `${o.horseId} 适配单 ${o.id} 卡在待备料`,
        detail:
          badHooves
            .map((id) => `${HOOF_META[id].short}：${o.hooves[id].check!.reasons.join("；")}`)
            .join("　") || "核验未通过",
        orderId: o.id,
      });
    }
    if (o.status === "issued" || o.status === "trial") {
      const need = 2 - o.confirmations.length;
      list.push({
        kind: "trial",
        level: "warn",
        title: `${o.horseId} 试装待确认（还需 ${Math.max(need, 0)} 次）`,
        detail: `确认人须为开单人 ${o.farrier} 之外的蹄铁师，连续两次步态稳定且无松动`,
        orderId: o.id,
      });
    }
    if (o.nextCheckDate && o.nextCheckDate <= todayISO && (o.status === "completed" || o.status === "trial" || o.status === "issued")) {
      list.push({
        kind: "recheck",
        level: o.nextCheckDate < todayISO ? "bad" : "info",
        title: `${o.horseId} 今日复查（${o.nextCheckDate}）`,
        detail: o.nextCheckDate < todayISO ? "已超过复查日期" : "复查日期为今天",
        orderId: o.id,
      });
    }
  }

  for (const s of state.shoes) {
    if (!s.active) continue;
    if (s.quantity === 0) {
      list.push({ kind: "open", level: "bad", title: `${s.name}（${s.id}）库存为 0`, detail: "适配单将停在待备料" });
    } else if (s.quantity <= 2) {
      list.push({ kind: "open", level: "info", title: `${s.name}（${s.id}）库存偏低：${s.quantity}`, detail: "建议补货" });
    }
  }

  // 超过 7 天仍未结束的测量中/待领用单
  for (const o of open) {
    if (o.status === "draft" || o.status === "ready") {
      const days = daysBetween(o.updatedAt.slice(0, 10), todayISO);
      if (days >= 7) {
        list.push({
          kind: "open",
          level: "info",
          title: `${o.horseId} 适配单 ${o.id} 已 ${days} 天未结束`,
          detail: STATUS_META[o.status].label,
          orderId: o.id,
        });
      }
    }
  }

  return list;
}

// ---------- 工具 ----------

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function fmtSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00").getTime();
  const b = new Date(bISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

export function nowStamp(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayISO(): string {
  return nowStamp().slice(0, 10);
}
