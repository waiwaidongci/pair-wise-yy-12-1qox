// 状态层：界面调用本层 action；action 调用 domain 规则计算结果，
// 再统一写回持久化。库存的任何增减都必须经本文件落账。

import { useSyncExternalStore } from "react";
import { createPersistence, Persistence } from "../persistence/repository";
import {
  Confirmation,
  FittingOrder,
  HOOF_KEYS,
  HOOF_LABELS,
  HoofKey,
  HoofInput,
  NailPosition,
  Shoe,
} from "../domain/types";
import {
  blockingIssues,
  canSubmitConfirmation,
  emptyHoof,
  evaluateOrder,
  findMissingFields,
  isOpenStatus,
  makeEvent,
  nailsForPattern,
  nowISO,
  openOrderForHorse,
  planIssue,
  REQUIRED_PASSES,
  trailingPasses,
  uid,
} from "../domain/rules";

export interface ActionResult {
  ok: boolean;
  message?: string;
  orderId?: string;
}

interface ReevalResult {
  order: FittingOrder;
  shoes: Shoe[];
}

class FittingStore {
  private persistence: Persistence;
  private data: ReturnType<Persistence["load"]>;

  constructor() {
    this.persistence = createPersistence();
    this.data = this.persistence.load();
    if (typeof window !== "undefined") {
      // 其他标签页（或本地广播）写入后重新装载，保证列表/库存/提醒刷新一致
      this.persistence.subscribe(() => {
        this.data = this.persistence.load();
        this.emit();
      });
    }
  }

  // ---------- React 订阅 ----------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private listeners = new Set<() => void>();
  getSnapshot = () => this.data;

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private commit(next: typeof this.data) {
    this.data = next;
    this.persistence.save(next);
    this.emit();
  }

  // ---------- 内部工具 ----------

  private touch(order: FittingOrder): FittingOrder {
    return { ...order, updatedAt: nowISO() };
  }

  private addEvent(order: FittingOrder, event: FittingOrder["events"][number]): FittingOrder {
    return {
      ...order,
      events: [...order.events, event],
      updatedAt: nowISO(),
    };
  }

  private getOrder(id: string): FittingOrder | undefined {
    return this.data.orders.find((o) => o.id === id);
  }

  // 对待试装/待备料单重新执行“校验 + 备料计划”，并把库存变化一并算出
  private reevaluate(
    order: FittingOrder,
    shoes: Shoe[]
  ): ReevalResult {
    const plan = planIssue(order, shoes, order.carriedDeductions);

    // 移除被换蹄铁对应的旧领用，再挂上本次新领用
    const swappedKeys = new Set(plan.deductions.map((d) => d.hoofKey));
    const keptDeductions = order.deductions.filter((d) => !swappedKeys.has(d.hoofKey));
    let next: FittingOrder = {
      ...order,
      deductions: [...keptDeductions, ...plan.deductions],
      status: plan.ok ? "awaiting_trial" : "pending_material",
    };

    let nextShoes = shoes;
    if (plan.movements.length > 0) {
      nextShoes = shoes.map((s) => {
        const delta = plan.movements
          .filter((m) => m.shoeId === s.id)
          .reduce((sum, m) => sum + m.delta, 0);
        return delta !== 0 ? { ...s, qty: s.qty + delta } : s;
      });
    }
    return { order: next, shoes: nextShoes };
  }

  // ---------- 适配单：创建 / 删除 ----------

  createOrder(horseCode: string, horseName: string, farrierId: string): ActionResult {
    const code = horseCode.trim();
    if (!code) return { ok: false, message: "请填写马匹编号" };
    if (openOrderForHorse(this.data.orders, code)) {
      return {
        ok: false,
        message: `${code} 已存在一张未结束适配单，每匹马仅允许一张`,
      };
    }
    const order: FittingOrder = {
      id: uid("ord-"),
      horseCode: code,
      horseName: horseName.trim(),
      status: "draft",
      farrierId,
      gaitGrade: "",
      gaitNote: "",
      photoNote: "",
      nextReviewDate: "",
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
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.commit({ ...this.data, orders: [order, ...this.data.orders] });
    return { ok: true, orderId: order.id };
  }

  deleteDraft(id: string): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (order.status !== "draft") {
      return { ok: false, message: "仅测量草稿可以删除" };
    }
    this.commit({
      ...this.data,
      orders: this.data.orders.filter((o) => o.id !== id),
    });
    return { ok: true };
  }

  // ---------- 头部字段 ----------

  updateOrderMeta(
    id: string,
    patch: Partial<
      Pick<
        FittingOrder,
        | "horseCode"
        | "horseName"
        | "farrierId"
        | "gaitGrade"
        | "gaitNote"
        | "photoNote"
        | "nextReviewDate"
      >
    >
  ): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (!isOpenStatus(order.status))
      return { ok: false, message: "已结束的适配单不能直接修改" };

    if (
      patch.horseCode &&
      patch.horseCode.trim() !== order.horseCode &&
      openOrderForHorse(this.data.orders, patch.horseCode.trim(), order.id)
    ) {
      return {
        ok: false,
        message: `${patch.horseCode} 已存在一张未结束适配单`,
      };
    }
    const next: typeof this.data = {
      ...this.data,
      orders: this.data.orders.map((o) =>
        o.id === id ? this.touch({ ...o, ...patch }) : o
      ),
    };
    this.commit(next);
    return { ok: true };
  }

  // ---------- 单蹄修改：测量 / 钉位 / 选配蹄铁 ----------

  updateHoofMeasurement(
    id: string,
    key: HoofKey,
    patch: Partial<Pick<HoofInput, "lengthMm" | "widthMm" | "nailSpacingMm" | "pattern">>,
    byFarrier?: string
  ): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (!isOpenStatus(order.status))
      return { ok: false, message: "已结束的适配单请使用“修正后重新适配”" };
    const nextHoof: HoofInput = { ...order.hooves[key], ...patch };
    return this.applyHoofChange(id, key, nextHoof, "corrected", byFarrier);
  }

  changePattern(
    id: string,
    key: HoofKey,
    pattern: HoofInput["pattern"]
  ): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (!isOpenStatus(order.status))
      return { ok: false, message: "当前状态不能调整钉孔模式" };
    const nextHoof: HoofInput = {
      ...order.hooves[key],
      pattern,
      nails: nailsForPattern(pattern),
    };
    return this.applyHoofChange(id, key, nextHoof, "corrected", undefined);
  }

  updateNail(
    id: string,
    key: HoofKey,
    nailId: string,
    patch: Partial<NailPosition>,
    byFarrier?: string
  ): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    const nextHoof: HoofInput = {
      ...order.hooves[key],
      nails: order.hooves[key].nails.map((n) =>
        n.id === nailId ? { ...n, ...patch } : n
      ),
    };
    return this.applyHoofChange(id, key, nextHoof, "corrected", byFarrier);
  }

  // 选择/更换蹄铁（待试装阶段更换 => 旧铁退回、新铁扣库，结论失效）
  selectShoe(
    id: string,
    key: HoofKey,
    shoeId: string | null,
    byFarrier?: string
  ): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (!isOpenStatus(order.status))
      return { ok: false, message: "已结束的适配单请使用“修正后重新适配”" };
    const nextHoof: HoofInput = { ...order.hooves[key], shoeId };
    return this.applyHoofChange(id, key, nextHoof, "swapped", byFarrier);
  }

  private applyHoofChange(
    id: string,
    key: HoofKey,
    nextHoof: HoofInput,
    eventKind: "corrected" | "swapped",
    byFarrier?: string
  ): ActionResult {
    const order = this.getOrder(id)!;
    let next: FittingOrder = {
      ...order,
      hooves: { ...order.hooves, [key]: nextHoof },
    };

    if (order.status === "awaiting_trial") {
      // 修正测量 / 换蹄铁 => 试装与连续确认结论失效，重新校验备料
      next = { ...next, trialFittedAt: null, confirmations: [] };
      next = this.addEvent(
        next,
        makeEvent(
          eventKind,
          eventKind === "swapped"
            ? `${HOOF_LABELS[key]}更换蹄铁：旧蹄铁退回库存、新蹄铁重新扣库，原复核结论失效`
            : `${HOOF_LABELS[key]}测量/钉位被修正，原试装与复核结论失效`,
          byFarrier
        )
      );
      const result = this.reevaluate(next, this.data.shoes);
      next = result.order;
      if (next.status === "awaiting_trial") {
        next = this.addEvent(
          next,
          makeEvent(
            eventKind === "swapped" ? "issued" : "started",
            eventKind === "swapped"
              ? "换铁备料完成（旧铁退一、新铁扣一），等待再次试装"
              : "重新校验通过，沿用已备蹄铁，等待再次试装",
            byFarrier
          )
        );
      }
      this.commit({
        ...this.data,
        shoes: result.shoes,
        orders: this.data.orders.map((o) =>
          o.id === id ? this.touch(next) : o
        ),
      });
      return { ok: true };
    }

    if (order.status === "pending_material") {
      // 待备料阶段改动实时重新校验；只有全部通过才扣库
      const result = this.reevaluate(next, this.data.shoes);
      next = result.order;
      if (next.status === "awaiting_trial") {
        next = this.addEvent(
          next,
          makeEvent("issued", "四蹄校验全部通过，蹄铁领用扣库完成", byFarrier)
        );
      }
      this.commit({
        ...this.data,
        shoes: result.shoes,
        orders: this.data.orders.map((o) =>
          o.id === id ? this.touch(next) : o
        ),
      });
      return { ok: true };
    }

    // draft：仅保存
    this.commit({
      ...this.data,
      orders: this.data.orders.map((o) =>
        o.id === id ? this.touch(next) : o
      ),
    });
    return { ok: true };
  }

  // ---------- 启动校验（草稿/待备料 -> 备料扣库 or 停待备料） ----------

  startOrder(id: string, byFarrier?: string): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (order.status !== "draft" && order.status !== "pending_material") {
      return { ok: false, message: "当前状态不能启动校验" };
    }

    const missing = findMissingFields(order);
    if (missing.length > 0) {
      const first = missing
        .slice(0, 5)
        .map((m) => `${m.scope}·${m.field}`)
        .join("、");
      return {
        ok: false,
        message: `缺项不得启动：${first}${missing.length > 5 ? ` 等 ${missing.length} 项` : ""}`,
      };
    }

    const started: FittingOrder = this.addEvent(
      order,
      makeEvent("started", "提交四蹄测量，开始适配校验", byFarrier)
    );
    const result = this.reevaluate(started, this.data.shoes);
    let next = result.order;

    if (next.status === "awaiting_trial") {
      next = this.addEvent(
        next,
        makeEvent(
          "issued",
          "四蹄校验全部通过（尺寸≤2mm、钉孔模式一致、钉位避开敏感区），蹄铁领用扣库",
          byFarrier
        )
      );
    } else {
      const issues = blockingIssues(evaluateOrder(next, result.shoes));
      next = this.addEvent(
        next,
        makeEvent(
          "blocked",
          `整单停在待备料、库存不扣减：${issues[0]?.message ?? "存在不合规项"}`,
          byFarrier
        )
      );
    }

    this.commit({
      ...this.data,
      shoes: result.shoes,
      orders: this.data.orders.map((o) =>
        o.id === id ? this.touch(next) : o
      ),
    });
    return next.status === "awaiting_trial"
      ? { ok: true, message: "校验通过，蹄铁已备料", orderId: id }
      : { ok: false, message: "存在不合规项，整单停在待备料（库存未扣减）", orderId: id };
  }

  // ---------- 试装 ----------

  markTrial(id: string, byFarrier?: string): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (order.status !== "awaiting_trial")
      return { ok: false, message: "备料完成后才能标记试装" };
    if (order.trialFittedAt)
      return { ok: false, message: "已标记试装，等待复核确认" };
    const next: typeof this.data = {
      ...this.data,
      orders: this.data.orders.map((o) =>
        o.id === id
          ? this.addEvent(
              { ...o, trialFittedAt: nowISO() },
              makeEvent("trial", "完成试装，等待另一名蹄铁师连续两次确认", byFarrier)
            )
          : o
      ),
    };
    this.commit(next);
    return { ok: true };
  }

  // ---------- 双确认（另一名蹄铁师、连续两次） ----------

  submitConfirmation(
    id: string,
    confirmerId: string,
    gaitStable: boolean,
    shoeSecure: boolean
  ): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    const guard = canSubmitConfirmation(order, confirmerId);
    if (guard) return { ok: false, message: guard };

    const confirmerName =
      this.data.farriers.find((f) => f.id === confirmerId)?.name ?? confirmerId;
    const confirmation: Confirmation = {
      id: uid("c-"),
      confirmerId,
      gaitStable,
      shoeSecure,
      at: nowISO(),
    };
    let next: FittingOrder = {
      ...order,
      confirmations: [...order.confirmations, confirmation],
    };

    const pass = gaitStable && shoeSecure;
    const passCount = pass ? trailingPasses(next.confirmations) : 0;

    if (!pass) {
      next = this.addEvent(
        next,
        makeEvent(
          "confirm_fail",
          `${confirmerName}确认未通过（步态${gaitStable ? "稳定" : "不稳"}／蹄铁${
            shoeSecure ? "无松动" : "有松动"
          }），连续确认计数清零`,
          confirmerId
        )
      );
    } else if (passCount >= REQUIRED_PASSES) {
      next = { ...next, status: "completed", completedAt: nowISO() };
      next = this.addEvent(
        next,
        makeEvent(
          "confirm_pass",
          `${confirmerName}第 ${passCount} 次确认通过`,
          confirmerId
        )
      );
      next = this.addEvent(
        next,
        makeEvent(
          "completed",
          "另一名蹄铁师连续两次确认步态稳定且蹄铁无松动，适配完成",
          confirmerId
        )
      );
    } else {
      next = this.addEvent(
        next,
        makeEvent(
          "confirm_pass",
          `${confirmerName}第 ${passCount} 次确认通过，还需 ${
            REQUIRED_PASSES - passCount
          } 次`,
          confirmerId
        )
      );
    }

    this.commit({
      ...this.data,
      orders: this.data.orders.map((o) => (o.id === id ? next : o)),
    });
    return {
      ok: pass,
      message: pass
        ? passCount >= REQUIRED_PASSES
          ? "连续两次确认完成，适配单结束"
          : `已记录第 ${passCount} 次确认`
        : "确认未通过，连续计数已清零",
    };
  }

  // ---------- 已完成单修正：旧单留档 + 新单沿用蹄铁（不重复扣库） ----------

  reviseCompleted(id: string, byFarrier: string, reason: string): ActionResult {
    const order = this.getOrder(id);
    if (!order) return { ok: false, message: "适配单不存在" };
    if (order.status !== "completed")
      return { ok: false, message: "仅已完成的适配单可以修正后重新适配" };
    if (openOrderForHorse(this.data.orders, order.horseCode)) {
      return { ok: false, message: `${order.horseCode} 已存在未结束适配单` };
    }

    const now = nowISO();
    const successorId = uid("ord-");
    const successor: FittingOrder = {
      id: successorId,
      horseCode: order.horseCode,
      horseName: order.horseName,
      status: "awaiting_trial",
      farrierId: byFarrier,
      gaitGrade: order.gaitGrade,
      gaitNote: order.gaitNote,
      photoNote: order.photoNote,
      nextReviewDate: order.nextReviewDate,
      hooves: structuredClone(order.hooves),
      trialFittedAt: now,
      completedAt: null,
      archivedAt: null,
      confirmations: [],
      deductions: [],
      carriedDeductions: [...order.deductions],
      supersedes: order.id,
      supersededBy: null,
      events: [
        makeEvent(
          "created",
          `修正测量／蹄铁后重新适配（原因：${reason || "未填写"}）`,
          byFarrier
        ),
        makeEvent(
          "issued",
          `沿用旧单已领 ${order.deductions.length} 只蹄铁（reused），库存不重复扣减`,
          byFarrier
        ),
        makeEvent("trial", "完成试装，等待另一名蹄铁师连续两次确认", byFarrier),
      ],
      createdAt: now,
      updatedAt: now,
    };

    const archived = this.addEvent(
      {
        ...order,
        status: "archived",
        archivedAt: now,
        supersededBy: successorId,
      },
      makeEvent(
        "archived",
        `结论失效（修正后重新适配），旧单留档；已领蹄铁移交新单 ${successorId}，不重复扣库`,
        byFarrier
      )
    );

    this.commit({
      ...this.data,
      orders: [
        successor,
        ...this.data.orders.map((o) => (o.id === order.id ? archived : o)),
      ],
    });
    return {
      ok: true,
      orderId: successorId,
      message: "旧单已归档，新单沿用已领蹄铁，库存不重复扣减",
    };
  }

  // ---------- 库存管理 ----------

  addShoe(input: Omit<Shoe, "id">): ActionResult {
    if (!input.sku.trim()) return { ok: false, message: "请填写蹄铁编号" };
    if (this.data.shoes.some((s) => s.sku === input.sku.trim()))
      return { ok: false, message: "蹄铁编号已存在" };
    const shoe: Shoe = { ...input, sku: input.sku.trim(), id: uid("shoe-") };
    this.commit({ ...this.data, shoes: [...this.data.shoes, shoe] });
    return { ok: true };
  }

  restockShoe(id: string, qty: number): ActionResult {
    if (!Number.isFinite(qty) || qty <= 0)
      return { ok: false, message: "入库数量需大于 0" };
    this.commit({
      ...this.data,
      shoes: this.data.shoes.map((s) =>
        s.id === id ? { ...s, qty: s.qty + qty, active: true } : s
      ),
    });
    return { ok: true };
  }

  setShoeActive(id: string, active: boolean, byFarrier?: string): ActionResult {
    const shoe = this.data.shoes.find((s) => s.id === id);
    if (!shoe) return { ok: false, message: "蹄铁不存在" };

    // 停用库存 => 使用该蹄铁的进行中适配单结论失效，退回待备料（库存数量不变）
    const affectedIds = new Set(
      !active
        ? this.data.orders
            .filter(
              (o) =>
                isOpenStatus(o.status) &&
                HOOF_KEYS.some((k) => o.hooves[k].shoeId === id)
            )
            .map((o) => o.id)
        : []
    );

    const orders = this.data.orders.map((o) => {
      if (!affectedIds.has(o.id)) return o;
      const invalidated: FittingOrder = {
        ...o,
        status: "pending_material",
        trialFittedAt: null,
        confirmations: [],
      };
      return this.addEvent(
        invalidated,
        makeEvent(
          "blocked",
          `库存蹄铁 ${shoe.sku} 被停用，相关选配与复核结论失效，整单退回待备料重新选配（库存数量不变）`,
          byFarrier
        )
      );
    });

    this.commit({
      ...this.data,
      orders,
      shoes: this.data.shoes.map((s) => (s.id === id ? { ...s, active } : s)),
    });
    return {
      ok: true,
      message: active
        ? "蹄铁已启用"
        : affectedIds.size > 0
        ? `已停用，${affectedIds.size} 张进行中适配单退回待备料`
        : "蹄铁已停用",
    };
  }

  // 读模型：某单的实时校验结果（列表、详情、提醒共用一份 data）
  issuesForOrder(id: string) {
    const order = this.data.orders.find((o) => o.id === id);
    if (!order) return {};
    return evaluateOrder(order, this.data.shoes);
  }

  resetDemo() {
    const seeded = this.persistence.reset();
    this.data = seeded;
    this.emit();
  }
}

export const store = new FittingStore();

export function useData() {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
}
