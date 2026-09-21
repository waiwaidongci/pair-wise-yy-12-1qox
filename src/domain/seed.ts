// 演示种子数据：仅在本地没有存档时生成。

import {
  AppData,
  Confirmation,
  Deduction,
  FittingOrder,
  HoofInput,
  HoofKey,
  NailPosition,
  Shoe,
} from "./types";
import { emptyHoof, makeEvent, nowISO, plusDaysISO, uid } from "./rules";

function nails(
  pattern: HoofInput["pattern"],
  override?: Partial<Record<"medial" | "lateral", number[]>>
): NailPosition[] {
  const result: NailPosition[] = [];
  const medialDef =
    pattern === "P6" ? [30, 44, 58] : pattern === "P7" ? [26, 38, 50, 62] : [28, 40, 52, 64];
  const lateralDef =
    pattern === "P6" ? [30, 44, 58] : pattern === "P7" ? [32, 46, 60] : [28, 40, 52, 64];
  const medial = override?.medial ?? medialDef;
  const lateral = override?.lateral ?? lateralDef;
  medial.forEach((v) =>
    result.push({ id: uid("n-"), side: "medial", fromHeelMm: v })
  );
  lateral.forEach((v) =>
    result.push({ id: uid("n-"), side: "lateral", fromHeelMm: v })
  );
  return result;
}

function hoof(
  lengthMm: number,
  widthMm: number,
  nailSpacingMm: number,
  pattern: HoofInput["pattern"],
  shoeId: string | null,
  nailOverride?: Partial<Record<"medial" | "lateral", number[]>>
): HoofInput {
  return {
    lengthMm,
    widthMm,
    nailSpacingMm,
    pattern,
    nails: nails(pattern, nailOverride),
    shoeId,
  };
}

function deduction(shoeId: string, hoofKey: HoofKey, at: string): Deduction {
  return { id: uid("d-"), shoeId, hoofKey, source: "issued", at };
}

function confirmation(
  confirmerId: string,
  at: string,
  gaitStable = true,
  shoeSecure = true
): Confirmation {
  return { id: uid("c-"), confirmerId, gaitStable, shoeSecure, at };
}

export function createSeedData(): AppData {
  const farriers = [
    { id: "f-chen", name: "陈师傅" },
    { id: "f-lin", name: "林师傅" },
    { id: "f-zhao", name: "赵师傅" },
  ];

  // 库存数量为“当前余量”，已领用的数量已在各单 deductions 中体现
  const shoes: Shoe[] = [
    {
      id: "shoe-al-front-140",
      sku: "AL-F140-P6",
      name: "铝合金轻量前蹄铁",
      kind: "front",
      side: "universal",
      lengthMm: 140,
      widthMm: 132,
      holeSpacingMm: 24,
      pattern: "P6",
      qty: 6,
      active: true,
    },
    {
      id: "shoe-steel-front-138",
      sku: "ST-F138-P6",
      name: "钢制常规前蹄铁",
      kind: "front",
      side: "universal",
      lengthMm: 138,
      widthMm: 130,
      holeSpacingMm: 24,
      pattern: "P6",
      qty: 4,
      active: true,
    },
    {
      id: "shoe-al-hind-132",
      sku: "AL-H132-P6",
      name: "铝合金后蹄铁",
      kind: "hind",
      side: "universal",
      lengthMm: 132,
      widthMm: 118,
      holeSpacingMm: 22,
      pattern: "P6",
      qty: 4,
      active: true,
    },
    {
      id: "shoe-steel-hind-130",
      sku: "ST-H130-P7",
      name: "钢制后蹄铁（7孔补强）",
      kind: "hind",
      side: "universal",
      lengthMm: 130,
      widthMm: 116,
      holeSpacingMm: 22,
      pattern: "P7",
      qty: 3,
      active: true,
    },
    {
      id: "shoe-univ-136",
      sku: "UN-136-P8",
      name: "通用调教蹄铁（8孔）",
      kind: "universal",
      side: "universal",
      lengthMm: 136,
      widthMm: 124,
      holeSpacingMm: 24,
      pattern: "P8",
      qty: 2,
      active: true,
    },
    {
      id: "shoe-retired-front",
      sku: "OLD-F145-P6",
      name: "旧款宽前蹄铁（已停产）",
      kind: "front",
      side: "universal",
      lengthMm: 145,
      widthMm: 138,
      holeSpacingMm: 26,
      pattern: "P6",
      qty: 5,
      active: false,
    },
  ];

  const now = nowISO();
  const today = new Date().toISOString();

  // —— 单1：HORSE-18 待试装，已通过第 1 次复核 ——
  const order1Deductions: Deduction[] = [
    deduction("shoe-al-front-140", "LF", today),
    deduction("shoe-al-front-140", "RF", today),
    deduction("shoe-al-hind-132", "LH", today),
    deduction("shoe-al-hind-132", "RH", today),
  ];
  const order1: FittingOrder = {
    id: "ord-horse18",
    horseCode: "HORSE-18",
    horseName: "赤兔",
    status: "awaiting_trial",
    farrierId: "f-chen",
    gaitGrade: "mild",
    gaitNote: "右前蹄外侧磨耗，试装后直线步态稳定，转弯轻微代偿",
    photoNote: "试装俯拍 2 张已归档",
    nextReviewDate: plusDaysISO(2),
    hooves: {
      LF: hoof(140, 132, 24, "P6", "shoe-al-front-140"),
      RF: hoof(140, 132, 24, "P6", "shoe-al-front-140"),
      LH: hoof(132, 118, 22, "P6", "shoe-al-hind-132"),
      RH: hoof(132, 118, 22, "P6", "shoe-al-hind-132"),
    },
    trialFittedAt: now,
    completedAt: null,
    archivedAt: null,
    confirmations: [confirmation("f-lin", now)],
    deductions: order1Deductions,
    carriedDeductions: [],
    supersedes: null,
    supersededBy: null,
    events: [
      makeEvent("created", "创建适配单", "f-chen"),
      makeEvent("started", "四蹄测量完成，校验通过，备料扣库 4 只蹄铁", "f-chen"),
      makeEvent("trial", "完成试装", "f-chen"),
      makeEvent("confirm_pass", "林师傅第 1 次确认：步态稳定、蹄铁无松动", "f-lin"),
    ],
    createdAt: now,
    updatedAt: now,
  };

  // —— 单2：HORSE-27 待备料（尺寸超差 + 敏感区 + 模式不符）——
  const order2: FittingOrder = {
    id: "ord-horse27",
    horseCode: "HORSE-27",
    horseName: "的卢",
    status: "pending_material",
    farrierId: "f-lin",
    gaitGrade: "moderate",
    gaitNote: "后蹄裂纹，落地期蹄跟着地偏重",
    photoNote: "裂纹特写待补",
    nextReviewDate: plusDaysISO(5),
    hooves: {
      // 蹄长 145 vs 蹄铁 140，差 5mm > 2mm
      LF: hoof(145, 132, 24, "P6", "shoe-al-front-140"),
      // 尺寸合格，但内侧第一钉距蹄踵 15mm，落入敏感区
      RF: hoof(138, 130, 24, "P6", "shoe-steel-front-138", {
        medial: [15, 42, 56],
      }),
      // 蹄为 7孔补强，蹄铁为 6孔，模式不符
      LH: hoof(132, 118, 22, "P7", "shoe-al-hind-132"),
      RH: hoof(132, 118, 22, "P6", "shoe-al-hind-132"),
    },
    trialFittedAt: null,
    completedAt: null,
    archivedAt: null,
    confirmations: [],
    deductions: [],
    carriedDeductions: [],
    supersedes: null,
    supersededBy: null,
    events: [
      makeEvent("created", "创建适配单", "f-lin"),
      makeEvent(
        "blocked",
        "校验未通过（尺寸超差/敏感区/钉孔模式不符），整单停在待备料，库存不扣减",
        "f-lin"
      ),
    ],
    createdAt: now,
    updatedAt: now,
  };

  // —— 单3：HORSE-31 已完成，复查已逾期 ——
  const order3: FittingOrder = {
    id: "ord-horse31",
    horseCode: "HORSE-31",
    horseName: "乌骓",
    status: "completed",
    farrierId: "f-lin",
    gaitGrade: "normal",
    gaitNote: "步态恢复正常",
    photoNote: "完工照 4 张",
    nextReviewDate: plusDaysISO(-5),
    hooves: {
      LF: hoof(138, 130, 24, "P6", "shoe-steel-front-138"),
      RF: hoof(138, 130, 24, "P6", "shoe-steel-front-138"),
      LH: hoof(130, 116, 22, "P7", "shoe-steel-hind-130"),
      RH: hoof(130, 116, 22, "P7", "shoe-steel-hind-130"),
    },
    trialFittedAt: plusDaysISO(-2),
    completedAt: plusDaysISO(-2),
    archivedAt: null,
    confirmations: [
      confirmation("f-chen", plusDaysISO(-2)),
      confirmation("f-zhao", plusDaysISO(-2)),
    ],
    deductions: [
      deduction("shoe-steel-front-138", "LF", plusDaysISO(-2)),
      deduction("shoe-steel-front-138", "RF", plusDaysISO(-2)),
      deduction("shoe-steel-hind-130", "LH", plusDaysISO(-2)),
      deduction("shoe-steel-hind-130", "RH", plusDaysISO(-2)),
    ],
    carriedDeductions: [],
    supersedes: null,
    supersededBy: null,
    events: [
      makeEvent("created", "创建适配单", "f-lin"),
      makeEvent("started", "校验通过，备料扣库 4 只蹄铁", "f-lin"),
      makeEvent("trial", "完成试装", "f-lin"),
      makeEvent("confirm_pass", "陈师傅第 1 次确认通过", "f-chen"),
      makeEvent("confirm_pass", "赵师傅第 2 次确认通过，连续两次确认完成", "f-zhao"),
      makeEvent("completed", "适配完成", "f-lin"),
    ],
    createdAt: plusDaysISO(-3),
    updatedAt: plusDaysISO(-2),
  };

  // —— 单4：HORSE-42 测量草稿（缺项，无法启动）——
  const order4: FittingOrder = {
    id: "ord-horse42",
    horseCode: "HORSE-42",
    horseName: "绝影",
    status: "draft",
    farrierId: "",
    gaitGrade: "",
    gaitNote: "",
    photoNote: "",
    nextReviewDate: plusDaysISO(7),
    hooves: {
      LF: emptyHoof(),
      RF: emptyHoof(),
      LH: emptyHoof(),
      RH: emptyHoof(),
    },
    trialFittedAt: null,
    completedAt: null,
    archivedAt: null,
    confirmations: [],
    deductions: [],
    carriedDeductions: [],
    supersedes: null,
    supersededBy: null,
    events: [makeEvent("created", "创建测量草稿")],
    createdAt: now,
    updatedAt: now,
  };

  // —— 单5：HORSE-55 旧单已归档（被修正单取代），单6 沿用其已领蹄铁不重复扣库 ——
  const oldDeductions: Deduction[] = [
    deduction("shoe-steel-front-138", "LF", "2026-08-20T09:00:00.000Z"),
    deduction("shoe-steel-front-138", "RF", "2026-08-20T09:00:00.000Z"),
    deduction("shoe-al-hind-132", "LH", "2026-08-20T09:00:00.000Z"),
    deduction("shoe-al-hind-132", "RH", "2026-08-20T09:00:00.000Z"),
  ];
  const order5: FittingOrder = {
    id: "ord-horse55-old",
    horseCode: "HORSE-55",
    horseName: "惊帆",
    status: "archived",
    farrierId: "f-chen",
    gaitGrade: "mild",
    gaitNote: "首轮适配：轻度步幅不均",
    photoNote: "首轮完工照",
    nextReviewDate: plusDaysISO(-11),
    hooves: {
      LF: hoof(138, 130, 24, "P6", "shoe-steel-front-138"),
      RF: hoof(138, 130, 24, "P6", "shoe-steel-front-138"),
      LH: hoof(132, 118, 22, "P6", "shoe-al-hind-132"),
      RH: hoof(132, 118, 22, "P6", "shoe-al-hind-132"),
    },
    trialFittedAt: "2026-08-20T09:00:00.000Z",
    completedAt: "2026-08-20T10:00:00.000Z",
    archivedAt: "2026-09-10T08:00:00.000Z",
    confirmations: [
      confirmation("f-lin", "2026-08-20T09:30:00.000Z"),
      confirmation("f-zhao", "2026-08-20T09:45:00.000Z"),
    ],
    deductions: oldDeductions,
    carriedDeductions: [],
    supersedes: null,
    supersededBy: "ord-horse55-rev",
    events: [
      makeEvent("created", "创建适配单（首轮）", "f-chen"),
      makeEvent("started", "校验通过，备料扣库 4 只蹄铁", "f-chen"),
      makeEvent("trial", "完成试装", "f-chen"),
      makeEvent("completed", "首轮适配完成", "f-chen"),
      makeEvent(
        "archived",
        "复查时修正测量后重新适配，旧结论失效，旧单留档；已领 4 只蹄铁由新单沿用，不重复扣库",
        "f-zhao"
      ),
    ],
    createdAt: "2026-08-19T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
  };

  const order6: FittingOrder = {
    id: "ord-horse55-rev",
    horseCode: "HORSE-55",
    horseName: "惊帆",
    status: "awaiting_trial",
    farrierId: "f-zhao",
    gaitGrade: "normal",
    gaitNote: "修正测量后复检：步态稳定",
    photoNote: "二轮试装照",
    nextReviewDate: plusDaysISO(1),
    hooves: {
      LF: hoof(138, 130, 24, "P6", "shoe-steel-front-138"),
      RF: hoof(138, 130, 24, "P6", "shoe-steel-front-138"),
      LH: hoof(132, 118, 22, "P6", "shoe-al-hind-132"),
      RH: hoof(132, 118, 22, "P6", "shoe-al-hind-132"),
    },
    trialFittedAt: now,
    completedAt: null,
    archivedAt: null,
    confirmations: [],
    deductions: [],
    carriedDeductions: oldDeductions,
    supersedes: "ord-horse55-old",
    supersededBy: null,
    events: [
      makeEvent("created", "基于复查修正测量创建新适配单", "f-zhao"),
      makeEvent(
        "issued",
        "校验通过；沿用旧单已领 4 只蹄铁（reused），库存不重复扣减",
        "f-zhao"
      ),
      makeEvent("trial", "完成试装，等待另一名蹄铁师连续两次确认", "f-zhao"),
    ],
    createdAt: now,
    updatedAt: now,
  };

  return {
    version: 1,
    farriers,
    shoes,
    orders: [order1, order2, order3, order4, order5, order6],
  };
}
