// 领域模型：四蹄测量适配与蹄铁领用

export type HoofId = "LF" | "RF" | "LH" | "RH";
export type GaitGrade = "" | "stable" | "mild" | "moderate" | "severe";
export type ShoeShape = "front" | "hind" | "universal";
export type OrderStatus =
  | "draft"
  | "pendingStock"
  | "ready"
  | "issued"
  | "trial"
  | "completed"
  | "archived";

/** 钉位：以蹄尖为 0°，外侧为正、内侧为负；insetMm 为自蹄壁向内的距离 */
export interface NailSpot {
  id: string;
  angleDeg: number;
  insetMm: number;
}

/** 单蹄测量：长、宽、钉孔距（mm）与步态分级，缺项不得启动 */
export interface HoofMeasurement {
  lengthMm: number | null;
  widthMm: number | null;
  nailSpacingMm: number | null;
  gaitGrade: GaitGrade;
}

export interface HoofCheck {
  pass: boolean;
  lengthDelta: number | null;
  widthDelta: number | null;
  spacingDelta: number | null;
  reasons: string[];
  sensitiveHits: string[];
}

export interface HoofAssignment {
  measurement: HoofMeasurement;
  shoeId: string | null;
  nails: NailSpot[];
  /** 修正单沿用旧蹄铁：领用时不重复扣库 */
  carryOver: boolean;
  check: HoofCheck | null;
}

export interface TrialConfirmation {
  at: string;
  confirmer: string;
  gaitStable: boolean;
  shoeSecure: boolean;
  note: string;
}

export interface OrderEvent {
  at: string;
  type: string;
  text: string;
}

export interface FittingOrder {
  id: string;
  horseId: string;
  horseName: string;
  farrier: string;
  status: OrderStatus;
  hooves: Record<HoofId, HoofAssignment>;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  completedAt: string | null;
  nextCheckDate: string | null;
  confirmations: TrialConfirmation[];
  revisionOf: string | null;
  archiveReason: string | null;
  events: OrderEvent[];
}

export interface ShoeSku {
  id: string;
  name: string;
  shape: ShoeShape;
  material: string;
  lengthMm: number;
  widthMm: number;
  holeCount: number;
  nailSpacingMm: number;
  quantity: number;
  active: boolean;
  note: string;
}

export type LedgerReason = "issue" | "carry" | "restock" | "adjust";

export interface LedgerEntry {
  id: string;
  at: string;
  shoeId: string;
  delta: number;
  reason: LedgerReason;
  orderId: string | null;
  hoofId: HoofId | null;
  note: string;
}

export interface AppState {
  version: number;
  seq: number;
  shoes: ShoeSku[];
  orders: FittingOrder[];
  ledger: LedgerEntry[];
  farriers: string[];
}
