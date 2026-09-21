// 领域类型：四蹄测量适配 + 蹄铁领用
// 本文件只定义数据结构，不包含任何规则逻辑。

export const HOOF_KEYS = ["LF", "RF", "LH", "RH"] as const;
export type HoofKey = (typeof HOOF_KEYS)[number];

export const HOOF_LABELS: Record<HoofKey, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export type HoofKind = "front" | "hind";
export type SideKind = "left" | "right";
export type PositionKind = HoofKind | "universal";
export type SideFitKind = SideKind | "universal";

// 钉孔模式
export type HolePattern = "P6" | "P7" | "P8";
export interface HolePatternDef {
  value: HolePattern;
  label: string;
  nailCount: number;
}
export const HOLE_PATTERNS: HolePatternDef[] = [
  { value: "P6", label: "6孔均布", nailCount: 6 },
  { value: "P7", label: "7孔补强", nailCount: 7 },
  { value: "P8", label: "8孔均布", nailCount: 8 },
];
export const PATTERN_LABEL: Record<HolePattern, string> = {
  P6: "6孔均布",
  P7: "7孔补强",
  P8: "8孔均布",
};

// 钉位：在内/外侧蹄壁上，距蹄踵(heel buttress)沿壁距离，毫米
export type NailSide = "medial" | "lateral";
export const NAIL_SIDE_LABEL: Record<NailSide, string> = {
  medial: "内侧",
  lateral: "外侧",
};
export interface NailPosition {
  id: string;
  side: NailSide;
  fromHeelMm: number | "";
}

// 单蹄测量与选配
export interface HoofInput {
  lengthMm: number | ""; // 蹄长
  widthMm: number | ""; // 蹄宽
  nailSpacingMm: number | ""; // 钉孔距
  pattern: HolePattern; // 钉孔模式（默认 P6，不允许空）
  nails: NailPosition[]; // 钉位
  shoeId: string | null; // 选配的库存蹄铁
}

// 步态分级
export type GaitGrade = "" | "normal" | "mild" | "moderate" | "severe";
export const GAIT_GRADE_OPTIONS: { value: Exclude<GaitGrade, "">; label: string }[] = [
  { value: "normal", label: "步态正常" },
  { value: "mild", label: "轻度异常" },
  { value: "moderate", label: "中度异常" },
  { value: "severe", label: "明显跛行" },
];
export const GAIT_LABEL: Record<Exclude<GaitGrade, "">, string> = {
  normal: "步态正常",
  mild: "轻度异常",
  moderate: "中度异常",
  severe: "明显跛行",
};

export type OrderStatus =
  | "draft" // 测量中（未启动）
  | "pending_material" // 待备料（校验未过，库存不扣减）
  | "awaiting_trial" // 待试装（已备料扣库，试装 + 双人双次复核）
  | "completed" // 已完成（已结束）
  | "archived"; // 已归档（结论失效后旧单留档）

export type IssueCode =
  | "SHOE_MISSING"
  | "SHOE_INACTIVE"
  | "SHOE_EMPTY"
  | "POSITION_MISMATCH"
  | "LENGTH_DIFF"
  | "WIDTH_DIFF"
  | "SPACING_DIFF"
  | "PATTERN_MISMATCH"
  | "NAIL_SENSITIVE";

export interface HoofIssue {
  code: IssueCode;
  message: string;
}

// 库存蹄铁
export interface Shoe {
  id: string;
  sku: string;
  name: string;
  kind: PositionKind; // 适用：前蹄/后蹄/通用
  side: SideFitKind; // 适用：左/右/通用
  lengthMm: number;
  widthMm: number;
  holeSpacingMm: number; // 钉孔距
  pattern: HolePattern; // 钉孔模式
  qty: number;
  active: boolean; // false = 停用库存
}

export interface Farrier {
  id: string;
  name: string;
}

// 试装后的复核确认
export interface Confirmation {
  id: string;
  confirmerId: string; // 必须不同于本单装蹄蹄铁师
  gaitStable: boolean; // 步态稳定
  shoeSecure: boolean; // 蹄铁无松动
  at: string;
}

// 扣库流水（挂在适配单上，保证一只蹄铁只扣一次）
export interface Deduction {
  id: string;
  shoeId: string;
  hoofKey: HoofKey;
  source: "issued" | "reused"; // issued=本次扣库；reused=沿用旧单已领，不重复扣库
  at: string;
}

export interface StockMovement {
  shoeId: string;
  delta: number; // 负=扣库，正=退库
  reason: "issue" | "swap_out" | "swap_in";
  hoofKey: HoofKey;
}

export type EventType =
  | "created"
  | "started"
  | "blocked"
  | "issued"
  | "trial"
  | "confirm_pass"
  | "confirm_fail"
  | "corrected"
  | "swapped"
  | "completed"
  | "archived"
  | "deleted";

export interface OrderEvent {
  at: string;
  type: EventType;
  text: string;
  by?: string;
}

export interface FittingOrder {
  id: string;
  horseCode: string;
  horseName: string;
  status: OrderStatus;
  farrierId: string; // 装蹄蹄铁师（主蹄铁师）
  gaitGrade: GaitGrade;
  gaitNote: string; // 步态问题备注
  photoNote: string; // 照片备注
  nextReviewDate: string; // yyyy-mm-dd 下次复查
  hooves: Record<HoofKey, HoofInput>;
  trialFittedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  confirmations: Confirmation[];
  deductions: Deduction[];
  carriedDeductions: Deduction[]; // 从被取代旧单沿用的已领蹄铁
  supersedes: string | null; // 本单取代的旧单
  supersededBy: string | null; // 取代本单的新单
  events: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

// 提醒（复查 / 异常步态 / 待备料 / 待复核 / 低库存）
export interface ReminderItem {
  id: string;
  kind:
    | "overdue"
    | "review_today"
    | "review_soon"
    | "gait"
    | "material"
    | "confirm"
    | "low_stock";
  title: string;
  orderId?: string;
  date?: string;
}

export interface AppData {
  version: number;
  orders: FittingOrder[];
  shoes: Shoe[];
  farriers: Farrier[];
}
