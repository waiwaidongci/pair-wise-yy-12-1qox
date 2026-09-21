import type { AppState, FittingOrder, HoofAssignment, HoofId, HoofMeasurement, ShoeSku } from "../domain/types";
import { buildNailPlan, evaluateHoof } from "../domain/rules";

function m(lengthMm: number, widthMm: number, nailSpacingMm: number, gaitGrade: HoofMeasurement["gaitGrade"]): HoofMeasurement {
  return { lengthMm, widthMm, nailSpacingMm, gaitGrade };
}

export const SEED_SHOES: ShoeSku[] = [
  { id: "AL-F130", name: "铝合金前蹄铁 130", shape: "front", material: "铝合金", lengthMm: 130, widthMm: 118, holeCount: 6, nailSpacingMm: 21, quantity: 8, active: true, note: "运动马前蹄常用" },
  { id: "AL-F135", name: "铝合金前蹄铁 135", shape: "front", material: "铝合金", lengthMm: 135, widthMm: 122, holeCount: 6, nailSpacingMm: 22, quantity: 6, active: true, note: "大马前蹄" },
  { id: "ST-F128", name: "钢质前蹄铁 128", shape: "front", material: "钢", lengthMm: 128, widthMm: 116, holeCount: 8, nailSpacingMm: 18, quantity: 12, active: true, note: "耐磨，调教马" },
  { id: "AL-H124", name: "铝合金后蹄铁 124", shape: "hind", material: "铝合金", lengthMm: 124, widthMm: 110, holeCount: 6, nailSpacingMm: 20, quantity: 2, active: true, note: "库存偏低" },
  { id: "ST-H128", name: "钢质后蹄铁 128", shape: "hind", material: "钢", lengthMm: 128, widthMm: 112, holeCount: 8, nailSpacingMm: 17, quantity: 5, active: true, note: "后蹄标准款" },
  { id: "PAD-H120", name: "加护蹄垫后蹄铁 120", shape: "hind", material: "钢+蹄垫", lengthMm: 120, widthMm: 106, holeCount: 6, nailSpacingMm: 19, quantity: 4, active: true, note: "裂纹/敏感蹄用" },
  { id: "UN-115", name: "通用训练蹄铁 115", shape: "universal", material: "钢", lengthMm: 115, widthMm: 104, holeCount: 6, nailSpacingMm: 19, quantity: 0, active: true, note: "缺货" },
  { id: "AL-H130", name: "铝合金后蹄铁 130", shape: "hind", material: "铝合金", lengthMm: 130, widthMm: 116, holeCount: 6, nailSpacingMm: 21, quantity: 3, active: true, note: "大型运动马后蹄" },
  { id: "OLD-F130", name: "旧式前蹄铁 130（淘汰）", shape: "front", material: "铁", lengthMm: 130, widthMm: 118, holeCount: 8, nailSpacingMm: 16, quantity: 7, active: false, note: "孔距过密，停用待退库" },
];

function assign(
  measurement: HoofMeasurement,
  shoe: ShoeSku,
  carryOver = false,
): HoofAssignment {
  const nails = buildNailPlan(shoe);
  const a: HoofAssignment = { measurement, shoeId: shoe.id, nails, carryOver, check: null };
  return { ...a, check: evaluateHoof(a, shoe) };
}

function assignManual(
  measurement: HoofMeasurement,
  shoe: ShoeSku,
  mutate: (nails: HoofAssignment["nails"]) => void,
): HoofAssignment {
  const a = assign(measurement, shoe);
  mutate(a.nails);
  a.check = evaluateHoof(a, shoe);
  return a;
}

function baseOrder(partial: Partial<FittingOrder> & Pick<FittingOrder, "id" | "horseId" | "horseName" | "farrier" | "status" | "createdAt">): FittingOrder {
  const hooves = { LF: null, RF: null, LH: null, RH: null } as unknown as Record<HoofId, HoofAssignment>;
  return {
    hooves,
    updatedAt: partial.createdAt,
    issuedAt: null,
    completedAt: null,
    nextCheckDate: null,
    confirmations: [],
    revisionOf: null,
    archiveReason: null,
    events: [],
    ...partial,
  };
}

function ev(at: string, type: string, text: string) {
  return { at, type, text };
}

export function buildSeedState(): AppState {
  const shoes = SEED_SHOES.map((s) => ({ ...s }));
  const byId = new Map(shoes.map((s) => [s.id, s]));

  // O-1001 已领用待试装：HORSE-18，需要另一名蹄铁师两次确认
  const o1001 = baseOrder({
    id: "O-1001",
    horseId: "HORSE-18",
    horseName: "疾风",
    farrier: "王铁山",
    status: "issued",
    createdAt: "2026-09-18 09:12",
    issuedAt: "2026-09-18 10:05",
    nextCheckDate: "2026-10-02",
    events: [
      ev("2026-09-18 09:12", "create", "开单，开单蹄铁师：王铁山"),
      ev("2026-09-18 09:40", "check", "四蹄核验通过，状态置为待领用"),
      ev("2026-09-18 10:05", "issue", "领用 AL-F130×2、AL-H124×2，库存已扣减"),
      ev("2026-09-18 10:05", "issue", "进入试装，等待另一名蹄铁师连续两次确认"),
    ],
  });
  o1001.hooves.LF = assign(m(130, 118, 21, "mild"), byId.get("AL-F130")!);
  o1001.hooves.RF = assign(m(131, 119, 21.5, "mild"), byId.get("AL-F130")!);
  o1001.hooves.LH = assign(m(124, 110, 20, "stable"), byId.get("AL-H124")!);
  o1001.hooves.RH = assign(m(123, 111, 20.5, "stable"), byId.get("AL-H124")!);
  o1001.updatedAt = "2026-09-18 10:05";

  // O-1002 待备料：HORSE-27 后蹄裂纹；后蹄误配孔距 17（测量 21，模式不符），且 UN-115 缺货
  const o1002 = baseOrder({
    id: "O-1002",
    horseId: "HORSE-27",
    horseName: "青石",
    farrier: "王铁山",
    status: "pendingStock",
    createdAt: "2026-09-19 14:20",
    events: [
      ev("2026-09-19 14:20", "create", "开单，开单蹄铁师：王铁山"),
      ev("2026-09-19 15:02", "check", "核验未过：后蹄钉孔模式不符 + 通用蹄铁缺货，停在待备料（库存不扣减）"),
    ],
  });
  o1002.hooves.LF = assign(m(128, 116, 18, "stable"), byId.get("ST-F128")!);
  o1002.hooves.RF = assign(m(129, 117, 18, "stable"), byId.get("ST-F128")!);
  o1002.hooves.LH = assign(m(121, 107, 21, "moderate"), byId.get("ST-H128")!);
  o1002.hooves.RH = assign(m(120, 105, 19, "moderate"), byId.get("UN-115")!);
  o1002.updatedAt = "2026-09-19 15:02";

  // O-1003 待备料：HORSE-06 右前尺寸超 2mm + 一钉过深落入敏感区
  const o1003 = baseOrder({
    id: "O-1003",
    horseId: "HORSE-06",
    horseName: "云岫",
    farrier: "陈牧",
    status: "pendingStock",
    createdAt: "2026-09-20 08:40",
    events: [
      ev("2026-09-20 08:40", "create", "开单，开单蹄铁师：陈牧"),
      ev("2026-09-20 09:05", "check", "核验未过：右前宽度差 +4mm、钉位 n4 入敏感区，停在待备料"),
    ],
  });
  o1003.hooves.LF = assign(m(135, 122, 22, "stable"), byId.get("AL-F135")!);
  o1003.hooves.RF = assignManual(m(135, 126, 22, "stable"), byId.get("AL-F135")!, (nails) => {
    nails[3].insetMm = 22; // n4 过深，落入敏感区
  });
  o1003.hooves.LH = assign(m(128, 112, 17, "stable"), byId.get("ST-H128")!);
  o1003.hooves.RH = assign(m(128, 113, 17, "stable"), byId.get("ST-H128")!);
  o1003.updatedAt = "2026-09-20 09:05";

  // O-1004 测量中：HORSE-31，缺后蹄数据，不得启动
  const o1004 = baseOrder({
    id: "O-1004",
    horseId: "HORSE-31",
    horseName: "琥珀",
    farrier: "李钊",
    status: "draft",
    createdAt: "2026-09-20 10:30",
    events: [ev("2026-09-20 10:30", "create", "开单，开单蹄铁师：李钊；四蹄数据未齐")],
  });
  const empty: HoofAssignment = {
    measurement: { lengthMm: null, widthMm: null, nailSpacingMm: null, gaitGrade: "" },
    shoeId: null,
    nails: [],
    carryOver: false,
    check: null,
  };
  o1004.hooves.LF = {
    ...empty,
    measurement: m(127, 115, 18, "mild"),
    shoeId: "ST-F128",
    nails: buildNailPlan(byId.get("ST-F128")!),
  };
  o1004.hooves.LF.check = evaluateHoof(o1004.hooves.LF, byId.get("ST-F128")!);
  o1004.hooves.RF = { ...empty, measurement: { ...empty.measurement } };
  o1004.hooves.LH = { ...empty, measurement: { ...empty.measurement } };
  o1004.hooves.RH = { ...empty, measurement: { ...empty.measurement } };

  // O-1005 已完成：HORSE-42，复查日期已过
  const o1005 = baseOrder({
    id: "O-1005",
    horseId: "HORSE-42",
    horseName: "长河",
    farrier: "陈牧",
    status: "completed",
    createdAt: "2026-09-05 09:00",
    issuedAt: "2026-09-05 10:20",
    completedAt: "2026-09-05 11:10",
    nextCheckDate: "2026-09-19",
    confirmations: [
      { at: "2026-09-05 10:45", confirmer: "李钊", gaitStable: true, shoeSecure: true, note: "第一次确认良好" },
      { at: "2026-09-05 11:10", confirmer: "李钊", gaitStable: true, shoeSecure: true, note: "第二次确认，完成" },
    ],
    events: [
      ev("2026-09-05 09:00", "create", "开单，开单蹄铁师：陈牧"),
      ev("2026-09-05 09:36", "check", "四蹄核验通过"),
      ev("2026-09-05 10:20", "issue", "领用 AL-F135×2、AL-H130×2"),
      ev("2026-09-05 10:45", "confirm", "李钊 第 1 次确认：步态稳定、蹄铁无松动"),
      ev("2026-09-05 11:10", "confirm", "李钊 第 2 次确认：步态稳定、蹄铁无松动，适配完成"),
    ],
  });
  o1005.hooves.LF = assign(m(134, 121, 22, "stable"), byId.get("AL-F135")!);
  o1005.hooves.RF = assign(m(135, 122, 22, "stable"), byId.get("AL-F135")!);
  o1005.hooves.LH = assign(m(129, 115, 21, "stable"), byId.get("AL-H130")!);
  o1005.hooves.RH = assign(m(130, 116, 21, "stable"), byId.get("AL-H130")!);
  o1005.updatedAt = "2026-09-05 11:10";

  // O-1006 待领用：HORSE-09 核验全过
  const o1006 = baseOrder({
    id: "O-1006",
    horseId: "HORSE-09",
    horseName: "踏雪",
    farrier: "李钊",
    status: "ready",
    createdAt: "2026-09-20 09:50",
    events: [
      ev("2026-09-20 09:50", "create", "开单，开单蹄铁师：李钊"),
      ev("2026-09-20 10:14", "check", "四蹄核验通过，待领用"),
    ],
  });
  o1006.hooves.LF = assign(m(128, 116, 18, "stable"), byId.get("ST-F128")!);
  o1006.hooves.RF = assign(m(127, 115, 18, "stable"), byId.get("ST-F128")!);
  o1006.hooves.LH = assign(m(128, 112, 17, "stable"), byId.get("ST-H128")!);
  o1006.hooves.RH = assign(m(127, 113, 17.5, "stable"), byId.get("ST-H128")!);
  o1006.updatedAt = "2026-09-20 10:14";

  // O-1000 已留档：HORSE-42 上一轮适配（O-1005 的旧单，展示不重复扣库）
  const o1000 = baseOrder({
    id: "O-1000",
    horseId: "HORSE-42",
    horseName: "长河",
    farrier: "陈牧",
    status: "archived",
    createdAt: "2026-08-22 09:00",
    issuedAt: "2026-08-22 10:00",
    completedAt: "2026-08-22 10:50",
    nextCheckDate: null,
    revisionOf: null,
    archiveReason: "重新测量后修正适配，结论失效，旧单留档；新单 O-1005 沿用/重领已在台账单独记录",
    events: [
      ev("2026-08-22 09:00", "create", "开单"),
      ev("2026-08-22 10:00", "issue", "领用 ST-F128×2、ST-H128×2"),
      ev("2026-08-22 10:50", "complete", "当轮适配完成"),
      ev("2026-09-05 08:55", "archive", "修正测量，结论失效，旧单留档，不重复扣库"),
    ],
  });
  o1000.hooves.LF = assign(m(128, 116, 18, "stable"), byId.get("ST-F128")!, true);
  o1000.hooves.RF = assign(m(128, 116, 18, "stable"), byId.get("ST-F128")!, true);
  o1000.hooves.LH = assign(m(128, 112, 17, "stable"), byId.get("ST-H128")!, true);
  o1000.hooves.RH = assign(m(128, 112, 17, "stable"), byId.get("ST-H128")!, true);
  o1000.updatedAt = "2026-09-05 08:55";

  const orders: FittingOrder[] = [o1001, o1002, o1003, o1004, o1005, o1006, o1000];

  const ledger = [
    { id: "L-001", at: "2026-08-22 10:00", shoeId: "ST-F128", delta: -2, reason: "issue" as const, orderId: "O-1000", hoofId: null, note: "长河 前蹄领用" },
    { id: "L-002", at: "2026-08-22 10:00", shoeId: "ST-H128", delta: -2, reason: "issue" as const, orderId: "O-1000", hoofId: null, note: "长河 后蹄领用" },
    { id: "L-003", at: "2026-09-05 10:20", shoeId: "AL-F135", delta: -2, reason: "issue" as const, orderId: "O-1005", hoofId: null, note: "长河 修正适配，前蹄重领" },
    { id: "L-004", at: "2026-09-05 10:20", shoeId: "AL-H130", delta: -2, reason: "issue" as const, orderId: "O-1005", hoofId: null, note: "长河 修正适配，后蹄重领" },
    { id: "L-005", at: "2026-09-18 10:05", shoeId: "AL-F130", delta: -2, reason: "issue" as const, orderId: "O-1001", hoofId: null, note: "疾风 前蹄领用" },
    { id: "L-006", at: "2026-09-18 10:05", shoeId: "AL-H124", delta: -2, reason: "issue" as const, orderId: "O-1001", hoofId: null, note: "疾风 后蹄领用" },
    { id: "L-007", at: "2026-09-16 09:00", shoeId: "ST-F128", delta: 6, reason: "restock" as const, orderId: null, hoofId: null, note: "月初补货" },
  ];

  return {
    version: 1,
    seq: 1006,
    shoes,
    orders,
    ledger,
    farriers: ["王铁山", "陈牧", "李钊"],
  };
}

export function validateState(raw: unknown): raw is AppState {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as AppState;
  return Array.isArray(s.shoes) && Array.isArray(s.orders) && Array.isArray(s.ledger) && typeof s.seq === "number";
}

export const STORAGE_KEY = "farrier-fitting-state-v1";

export function loadState(): AppState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) {
      const raw = JSON.parse(text);
      if (validateState(raw)) return raw;
    }
  } catch {
    // 损坏数据回退到种子
  }
  return buildSeedState();
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅保留内存态
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
