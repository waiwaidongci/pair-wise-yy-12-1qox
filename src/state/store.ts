import { useSyncExternalStore } from "react";
import type {
  AppState,
  FittingOrder,
  GaitGrade,
  HoofAssignment,
  HoofId,
  LedgerEntry,
  NailSpot,
  ShoeSku,
} from "../domain/types";
import {
  applyConfirmation,
  buildNailPlan,
  CONCLUDED_STATUSES,
  emptyHoof,
  evaluateOrder,
  HOOF_IDS,
  nowStamp,
  orderMissing,
  statusAfterCheck,
} from "../domain/rules";
import { buildSeedState, clearState, loadState, saveState } from "../data/storage";

let state: AppState = loadState();
const listeners = new Set<() => void>();

function emit() {
  saveState(state);
  listeners.forEach((l) => l());
}

function setState(next: AppState) {
  state = next;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key !== "farrier-fitting-state-v1") return;
    state = loadState();
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getState(): AppState {
  return state;
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---------- 工具 ----------

function nextId(prefix: string): string {
  const seq = state.seq + 1;
  state = { ...state, seq };
  return `${prefix}-${seq}`;
}

function patchOrder(id: string, fn: (o: FittingOrder) => FittingOrder): void {
  const stamp = nowStamp();
  setState({
    ...state,
    orders: state.orders.map((o) =>
      o.id === id
        ? (() => {
            const next = fn(o);
            return { ...next, updatedAt: stamp };
          })()
        : o,
    ),
  });
}

function findOrder(id: string): FittingOrder {
  const o = state.orders.find((x) => x.id === id);
  if (!o) throw new Error(`适配单不存在：${id}`);
  return o;
}

function logEvent(o: FittingOrder, type: string, text: string) {
  return [...o.events, { at: nowStamp(), type, text }];
}

function mapHoof(o: FittingOrder, hoofId: HoofId, fn: (a: HoofAssignment) => HoofAssignment): FittingOrder {
  return { ...o, hooves: { ...o.hooves, [hoofId]: fn(o.hooves[hoofId]) } };
}

/** 结论失效：测量/蹄铁/钉位变更后清空已有核验结论 */
function invalidate(a: HoofAssignment): HoofAssignment {
  return { ...a, check: null };
}

/** 未领用单发生修改：待领用/待备料结论一并失效，退回测量中重新核验 */
function reopen(o: FittingOrder): FittingOrder {
  if (o.status === "ready" || o.status === "pendingStock") {
    return {
      ...o,
      status: "draft",
      events: [...o.events, { at: nowStamp(), type: "invalidate", text: "测量/蹄铁/钉位已修改，原核验结论失效，需重新核验" }],
    };
  }
  return o;
}

// ---------- 适配单动作 ----------

export const actions = {
  createOrder(input: {
    horseId: string;
    horseName: string;
    farrier: string;
    nextCheckDate: string | null;
  }): { ok: boolean; error?: string; id?: string } {
    const horseId = input.horseId.trim().toUpperCase();
    if (!horseId) return { ok: false, error: "请填写马匹编号" };
    if (!input.farrier.trim()) return { ok: false, error: "请选择开单蹄铁师" };

    // 每匹马仅一张未结束适配单
    const exists = state.orders.find(
      (o) =>
        o.horseId.toUpperCase() === horseId &&
        o.status !== "completed" &&
        o.status !== "archived",
    );
    if (exists) {
      return {
        ok: false,
        error: `${horseId} 已有未结束适配单 ${exists.id}（${exists.status}），不可重复开单`,
      };
    }

    const id = `O-${state.seq + 1}`;
    state = { ...state, seq: state.seq + 1 };
    const stamp = nowStamp();
    const order: FittingOrder = {
      id,
      horseId,
      horseName: input.horseName.trim() || horseId,
      farrier: input.farrier.trim(),
      status: "draft",
      hooves: {
        LF: emptyHoof(),
        RF: emptyHoof(),
        LH: emptyHoof(),
        RH: emptyHoof(),
      },
      createdAt: stamp,
      updatedAt: stamp,
      issuedAt: null,
      completedAt: null,
      nextCheckDate: input.nextCheckDate,
      confirmations: [],
      revisionOf: null,
      archiveReason: null,
      events: [{ at: stamp, type: "create", text: `开单，开单蹄铁师：${input.farrier.trim()}` }],
    };
    setState({ ...state, orders: [order, ...state.orders] });
    return { ok: true, id };
  },

  setMeasurement(
    orderId: string,
    hoofId: HoofId,
    field: "lengthMm" | "widthMm" | "nailSpacingMm",
    raw: string,
  ): void {
    const o = findOrder(orderId);
    if (CONCLUDED_STATUSES.includes(o.status) || o.status === "archived") {
      window.alert("该单结论已产生：请使用「修正测量/换蹄铁」开修正单，旧单留档。");
      return;
    }
    const value = raw === "" ? null : Number(raw);
    patchOrder(orderId, (prev) => {
      let next = reopen(prev);
      next = mapHoof(next, hoofId, (a) =>
        invalidate({
          ...a,
          measurement: { ...a.measurement, [field]: value === null || Number.isNaN(value) ? null : value },
        }),
      );
      next = {
        ...next,
        events: logEvent(next, "edit", `修正 ${hoofLabel(hoofId)} ${fieldLabel(field)}测量（结论失效待重核）`),
      };
      return next;
    });
  },

  setGait(orderId: string, hoofId: HoofId, grade: GaitGrade): void {
    const o = findOrder(orderId);
    if (CONCLUDED_STATUSES.includes(o.status) || o.status === "archived") {
      window.alert("该单结论已产生：请使用「修正测量/换蹄铁」开修正单。");
      return;
    }
    patchOrder(orderId, (prev) => {
      const reopened = reopen(prev);
      return mapHoof(reopened, hoofId, (a) =>
        invalidate({ ...a, measurement: { ...a.measurement, gaitGrade: grade } }),
      );
    });
  },

  pickShoe(orderId: string, hoofId: HoofId, shoeId: string): void {
    const o = findOrder(orderId);
    if (CONCLUDED_STATUSES.includes(o.status) || o.status === "archived") {
      window.alert("该单结论已产生：请使用「修正测量/换蹄铁」开修正单。");
      return;
    }
    const sku = state.shoes.find((s) => s.id === shoeId);
    patchOrder(orderId, (prev) => {
      const reopened = reopen(prev);
      return mapHoof(reopened, hoofId, (a) =>
        invalidate({
          ...a,
          shoeId: sku ? sku.id : null,
          nails: sku ? buildNailPlan(sku) : [],
          carryOver: false,
        }),
      );
    });
  },

  /** 单蹄沿用旧蹄铁（仅修正单可用）：不扣库 */
  toggleCarry(orderId: string, hoofId: HoofId, carry: boolean): void {
    const o = findOrder(orderId);
    if (!o.revisionOf) return;
    patchOrder(orderId, (prev) => {
      const reopened = reopen(prev);
      return mapHoof(reopened, hoofId, (a) => invalidate({ ...a, carryOver: carry }));
    });
  },

  updateNail(orderId: string, hoofId: HoofId, nailId: string, field: keyof NailSpot, raw: string): void {
    const o = findOrder(orderId);
    if (CONCLUDED_STATUSES.includes(o.status) || o.status === "archived") {
      window.alert("该单结论已产生：请使用「修正测量/换蹄铁」开修正单。");
      return;
    }
    const num = Number(raw);
    patchOrder(orderId, (prev) => {
      const reopened = reopen(prev);
      return mapHoof(reopened, hoofId, (a) =>
        invalidate({
          ...a,
          nails: a.nails.map((n) =>
            n.id === nailId ? { ...n, [field]: Number.isNaN(num) ? n[field] : num } : n,
          ),
        }),
      );
    });
  },

  /** 启动核验：缺项拒绝；任一蹄不过 → 待备料，库存不扣减 */
  runCheck(orderId: string): { ok: boolean; errors: string[] } {
    const o = findOrder(orderId);
    const missing = orderMissing(o);
    if (missing.length) {
      return {
        ok: false,
        errors: missing.map(
          ({ hoofId, items }) => `${hoofLabel(hoofId)} 缺项：${items.join("、")}`,
        ),
      };
    }
    const result = evaluateOrder(o, state.shoes);
    const hooves = { ...o.hooves };
    for (const id of HOOF_IDS) hooves[id] = { ...hooves[id], check: result.hoofReports[id] };

    const nextStatus = statusAfterCheck(result.pass);
    const reasonText = result.pass
      ? "四蹄核验通过，状态置为待领用（尚未扣库）"
      : [
          "核验未过，整单停在待备料，库存不扣减：",
          ...HOOF_IDS.filter((id) => !result.hoofReports[id].pass).flatMap((id) =>
            result.hoofReports[id].reasons.map((r) => `${hoofLabel(id)} ${r}`),
          ),
          ...result.shortage.map((s) => `库存不足：${s}`),
        ].join("　");

    patchOrder(orderId, (prev) => ({
      ...prev,
      hooves,
      status: nextStatus,
      events: logEvent(prev, "check", reasonText),
    }));
    return {
      ok: result.pass,
      errors: result.pass ? [] : [...HOOF_IDS.flatMap((id) => result.hoofReports[id].reasons), ...result.shortage],
    };
  },

  /** 领用扣库：仅待领用可执行，按蹄扣减并写台账 */
  issueOrder(orderId: string): void {
    const o = findOrder(orderId);
    if (o.status !== "ready") {
      window.alert("仅「待领用」状态可以领用蹄铁。");
      return;
    }
    const result = evaluateOrder(o, state.shoes);
    if (!result.pass) {
      window.alert("最新核验已失效，请重新核验。");
      return;
    }

    const stamp = nowStamp();
    const shoes = state.shoes.map((s) => ({ ...s }));
    const byId = new Map(shoes.map((s) => [s.id, s]));
    const ledger: LedgerEntry[] = [];
    const summary: string[] = [];
    let seq = state.seq;

    for (const id of HOOF_IDS) {
      const a = o.hooves[id];
      if (a.carryOver || !a.shoeId) continue;
      const sku = byId.get(a.shoeId)!;
      sku.quantity -= 1;
      seq += 1;
      ledger.push({
        id: `L-${seq}`,
        at: stamp,
        shoeId: sku.id,
        delta: -1,
        reason: "issue",
        orderId,
        hoofId: id,
        note: `${o.horseId} ${hoofLabel(id)}领用`,
      });
      summary.push(`${sku.id} -1`);
    }

    setState({
      ...state,
      seq,
      shoes,
      ledger: [...ledger.reverse(), ...state.ledger],
      orders: state.orders.map((x) =>
        x.id === orderId
          ? {
              ...x,
              status: "issued",
              issuedAt: stamp,
              updatedAt: stamp,
              events: [
                ...x.events,
                { at: stamp, type: "issue", text: `领用扣库：${summary.join("、")}` },
                { at: stamp, type: "issue", text: "进入试装，等待另一名蹄铁师连续两次确认" },
              ],
            }
          : x,
      ),
    });
  },

  /** 试装确认：另一名蹄铁师；连续两次步态稳定且无松动才完成 */
  confirmTrial(
    orderId: string,
    confirmer: string,
    gaitStable: boolean,
    shoeSecure: boolean,
    note: string,
  ): string | null {
    const o = findOrder(orderId);
    const res = applyConfirmation(o, confirmer, gaitStable, shoeSecure);
    if (!res.ok) return res.error ?? "无法确认";

    const stamp = nowStamp();
    let confirmations = res.confirmations;
    const events = [...o.events];
    if (gaitStable && shoeSecure) {
      const idx = confirmations.length;
      confirmations = confirmations.map((c, i) =>
        i === idx - 1 ? { ...c, note: note.trim() } : c,
      );
      events.push({
        at: stamp,
        type: "confirm",
        text: `${confirmer.trim()} 第 ${confirmations.length} 次确认：步态稳定、蹄铁无松动`,
      });
    } else {
      events.push({
        at: stamp,
        type: "confirm",
        text: `${confirmer.trim()} 确认未通过（步态${gaitStable ? "稳定" : "不稳"}、蹄铁${shoeSecure ? "无松动" : "有松动"}），连续确认计数清零`,
      });
    }

    const completed = res.nextStatus === "completed";
    if (completed) {
      events.push({ at: stamp, type: "complete", text: "连续两次确认通过，适配完成" });
    }

    setState({
      ...state,
      orders: state.orders.map((x) =>
        x.id === orderId
          ? {
              ...x,
              confirmations,
              status: res.nextStatus,
              completedAt: completed ? stamp : x.completedAt,
              updatedAt: stamp,
              events,
            }
          : x,
      ),
    });
    return null;
  },

  setNextCheck(orderId: string, date: string | null): void {
    patchOrder(orderId, (prev) => ({ ...prev, nextCheckDate: date }));
  },

  /**
   * 修正测量/换蹄铁：结论失效，旧单留档，开出修正单。
   * 沿用旧蹄铁的蹄不重复扣库；新选蹄铁在领用环节扣库。
   */
  reviseOrder(orderId: string, reason: string): { ok: boolean; error?: string; id?: string } {
    const o = findOrder(orderId);
    if (!CONCLUDED_STATUSES.includes(o.status)) {
      return { ok: false, error: "仅已领用/试装/已完成的适配单需要开修正单" };
    }
    const stamp = nowStamp();
    const newId = `O-${state.seq + 1}`;
    state = { ...state, seq: state.seq + 1 };

    const archiveText = `修正${reason ? `（${reason}）` : ""}：测量/蹄铁结论失效，旧单留档，沿用蹄铁不重复扣库 → ${newId}`;
    const archived: FittingOrder = {
      ...o,
      status: "archived",
      archiveReason: archiveText,
      updatedAt: stamp,
      events: [...o.events, { at: stamp, type: "archive", text: archiveText }],
    };

    const revision: FittingOrder = {
      ...o,
      id: newId,
      status: "draft",
      revisionOf: o.id,
      issuedAt: null,
      completedAt: null,
      confirmations: [],
      archiveReason: null,
      createdAt: stamp,
      updatedAt: stamp,
      nextCheckDate: o.nextCheckDate,
      hooves: HOOF_IDS.reduce(
        (acc, id) => {
          const src = o.hooves[id];
          acc[id] = {
            ...src,
            check: null,
            carryOver: true, // 默认沿用旧蹄铁；改选其他蹄铁时自动取消沿用
          };
          return acc;
        },
        {} as FittingOrder["hooves"],
      ),
      events: [
        { at: stamp, type: "create", text: `修正单，来源 ${o.id}；默认沿用旧蹄铁（不扣库），换蹄铁的蹄领用时再扣库` },
      ],
    };

    setState({
      ...state,
      orders: state.orders.map((x) => (x.id === o.id ? archived : x)).concat(revision),
    });
    return { ok: true, id: newId };
  },

  // ---------- 库存动作 ----------

  /** 停用库存：使结论失效——引用该蹄铁的已领用/试装单留档并开修正单 */
  deactivateShoe(shoeId: string): void {
    const sku = state.shoes.find((s) => s.id === shoeId);
    if (!sku || !sku.active) return;
    const stamp = nowStamp();
    let shoes = state.shoes.map((s) => (s.id === shoeId ? { ...s, active: false } : s));
    let orders = state.orders.map((o) => ({ ...o, hooves: { ...o.hooves } }));
    const ledger = [...state.ledger];
    let seq = state.seq;
    const newOrders: FittingOrder[] = [];

    for (const original of orders) {
      if (original.status === "completed" || original.status === "archived") continue;
      const hitHooves = HOOF_IDS.filter((id) => original.hooves[id].shoeId === shoeId);
      if (!hitHooves.length) continue;

      if (original.status === "issued" || original.status === "trial") {
        // 结论失效：留档 + 修正单，受影响蹄默认沿用（不重复扣库）
        seq += 1;
        const newId = `O-${seq}`;
        const archiveText = `蹄铁 ${shoeId} 停用，结论失效，旧单留档；受影响蹄沿用库存不扣减 → ${newId}`;
        const archived: FittingOrder = {
          ...original,
          hooves: { ...original.hooves },
          status: "archived",
          archiveReason: archiveText,
          updatedAt: stamp,
          events: [...original.events, { at: stamp, type: "archive", text: archiveText }],
        };
        const revision: FittingOrder = {
          ...original,
          hooves: HOOF_IDS.reduce(
            (acc, id) => {
              const src = original.hooves[id];
              acc[id] = {
                ...src,
                check: null,
                carryOver: src.shoeId === shoeId ? true : src.carryOver,
              };
              return acc;
            },
            {} as FittingOrder["hooves"],
          ),
          id: newId,
          status: "draft",
          revisionOf: original.id,
          issuedAt: null,
          completedAt: null,
          confirmations: [],
          archiveReason: null,
          createdAt: stamp,
          updatedAt: stamp,
          events: [
            { at: stamp, type: "create", text: `蹄铁 ${shoeId} 停用自动开修正单，来源 ${original.id}；受影响蹄默认沿用旧蹄铁` },
          ],
        };
        orders = orders.map((x) => (x.id === original.id ? archived : x));
        newOrders.push(revision);
      } else {
        // 测量中/待备料/待领用：清结论待重核
        for (const id of hitHooves) {
          original.hooves[id] = { ...original.hooves[id], check: null };
        }
        original.status = "draft";
        original.updatedAt = stamp;
        original.events = [
          ...original.events,
          { at: stamp, type: "stock", text: `蹄铁 ${shoeId} 已停用：相关蹄核验结论失效，请重配蹄铁` },
        ];
      }
    }

    ledger.unshift({
      id: `L-${seq + 1}`,
      at: stamp,
      shoeId,
      delta: 0,
      reason: "adjust",
      orderId: null,
      hoofId: null,
      note: `${sku.name} 停用，库存冻结（数量保留 ${sku.quantity}）`,
    });

    setState({ ...state, shoes, seq, orders: [...orders, ...newOrders], ledger });
  },

  activateShoe(shoeId: string): void {
    setState({
      ...state,
      shoes: state.shoes.map((s) => (s.id === shoeId ? { ...s, active: true } : s)),
    });
  },

  restock(shoeId: string, amount: number): void {
    if (amount <= 0) return;
    const sku = state.shoes.find((s) => s.id === shoeId);
    if (!sku) return;
    const stamp = nowStamp();
    const seq = state.seq + 1;
    setState({
      ...state,
      seq,
      shoes: state.shoes.map((s) => (s.id === shoeId ? { ...s, quantity: s.quantity + amount } : s)),
      ledger: [
        {
          id: `L-${seq}`,
          at: stamp,
          shoeId,
          delta: amount,
          reason: "restock",
          orderId: null,
          hoofId: null,
          note: `${sku.name} 补货 ${amount}`,
        },
        ...state.ledger,
      ],
    });
  },

  addShoe(input: Omit<ShoeSku, "id"> & { id: string }): { ok: boolean; error?: string } {
    const id = input.id.trim().toUpperCase();
    if (!id) return { ok: false, error: "请填写蹄铁编号" };
    if (state.shoes.some((s) => s.id === id)) return { ok: false, error: "编号已存在" };
    setState({ ...state, shoes: [...state.shoes, { ...input, id }] });
    return { ok: true };
  },

  resetDemo(): void {
    clearState();
    setState(buildSeedState());
  },
};

function hoofLabel(id: HoofId): string {
  return { LF: "左前蹄", RF: "右前蹄", LH: "左后蹄", RH: "右后蹄" }[id];
}

function fieldLabel(f: "lengthMm" | "widthMm" | "nailSpacingMm"): string {
  return { lengthMm: "长度", widthMm: "宽度", nailSpacingMm: "钉孔距" }[f];
}
