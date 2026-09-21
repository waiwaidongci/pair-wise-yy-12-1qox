// 临时自检：验证四蹄适配核心规则，不属于交付界面
const alerts: string[] = [];
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
(globalThis as any).window = {
  alert: (msg: string) => {
    alerts.push(msg);
    console.log("    [alert]", msg);
  },
  confirm: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

import { actions } from "../src/state/store";
import { buildSeedState } from "../src/data/storage";
import { evaluateHoof, buildNailPlan } from "../src/domain/rules";
import type { AppState, FittingOrder, HoofAssignment } from "../src/domain/types";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

actions.resetDemo();
let state = (): AppState => {
  // store 没有导出 getState；通过 localStorage 取最新快照
  return JSON.parse(mem.get("farrier-fitting-state-v1")!) as AppState;
};

// ---------- 1. 缺项不得启动 ----------
console.log("1) 四蹄缺项不得启动");
{
  const r = actions.createOrder({ horseId: "HORSE-T1", horseName: "测试马", farrier: "王铁山", nextCheckDate: null });
  assert(r.ok && r.id, "新建适配单成功");
  const res = actions.runCheck(r.id!);
  assert(!res.ok && res.errors.some((e) => e.includes("缺项")), "四蹄全缺时启动核验被拒绝");
}

// ---------- 2. 每匹马一张未结束单 ----------
console.log("2) 每匹马仅一张未结束适配单");
{
  const r = actions.createOrder({ horseId: "horse-t1", horseName: "", farrier: "王铁山", nextCheckDate: null });
  assert(!r.ok && !!r.error?.includes("未结束"), "同马匹重复开单被拒绝（大小写归一）");
}

// ---------- 3. 尺寸差超 2mm → 待备料且不扣库 ----------
console.log("3) 尺寸超差停在待备料，库存不扣减");
{
  const before = state().shoes.find((s) => s.id === "AL-F130")!.quantity;
  // HORSE-06 种子单 O-1003：右前宽 126 vs 122（+4），且 n4 入敏感区
  const res = actions.runCheck("O-1003");
  assert(!res.ok, "O-1003 核验不过");
  const o = state().orders.find((x) => x.id === "O-1003")!;
  assert(o.status === "pendingStock", "状态为待备料");
  assert(o.hooves.RF.check!.reasons.some((r) => r.includes("宽度差")), "右前报告宽度差");
  assert(o.hooves.RF.check!.reasons.some((r) => r.includes("敏感区")), "右前报告钉位入敏感区");
  const after = state().shoes.find((s) => s.id === "AL-F130")!.quantity;
  assert(before === after, "库存未扣减");
}

// ---------- 4. 钉孔模式不符（种子 O-1002 LH 测量21 vs 蹄铁17，且孔数 6 vs 8） ----------
console.log("4) 钉孔模式不符停在待备料");
{
  actions.runCheck("O-1002");
  const o = state().orders.find((x) => x.id === "O-1002")!;
  assert(o.status === "pendingStock", "O-1002 待备料");
  assert(o.hooves.LH.check!.reasons.some((r) => r.includes("钉孔距差")), "左后孔距超差");
  assert(o.hooves.RH.check!.reasons.length > 0, "右后（缺货 UN-115）有不过原因");
}

// ---------- 5. 全过 → 待领用 → 领用扣库 → 两人规则 ----------
console.log("5) 全过领用扣库；另一名蹄铁师连续两次确认");
{
  // 种子 O-1006 已 ready；先确认数量
  const s = state();
  const f128 = s.shoes.find((x) => x.id === "ST-F128")!.quantity;
  const h128 = s.shoes.find((x) => x.id === "ST-H128")!.quantity;
  actions.issueOrder("O-1006");
  const s2 = state();
  assert(s2.orders.find((x) => x.id === "O-1006")!.status === "issued", "领用后状态 issued");
  assert(s2.shoes.find((x) => x.id === "ST-F128")!.quantity === f128 - 2, "ST-F128 扣 2");
  assert(s2.shoes.find((x) => x.id === "ST-H128")!.quantity === h128 - 2, "ST-H128 扣 2");
  assert(s2.ledger.filter((l) => l.orderId === "O-1006").length === 4, "台账新增 4 条");

  // 开单人自己确认 → 拒绝
  const err1 = actions.confirmTrial("O-1006", "李钊", true, true, "");
  assert(!!err1 && err1.includes("另一名"), "开单人不可确认");

  // 第一次他人确认
  const err2 = actions.confirmTrial("O-1006", "王铁山", true, true, "");
  assert(err2 === null, "另一名蹄铁师第一次确认成功");
  assert(state().orders.find((x) => x.id === "O-1006")!.status === "trial", "进入试装确认中");

  // 中间一次不通过 → 清零
  actions.confirmTrial("O-1006", "王铁山", false, true, "");
  assert(state().orders.find((x) => x.id === "O-1006")!.confirmations.length === 0, "不通过后连续计数清零");
  assert(state().orders.find((x) => x.id === "O-1006")!.status === "trial", "仍停留试装中");

  // 再连续两次
  actions.confirmTrial("O-1006", "陈牧", true, true, "");
  actions.confirmTrial("O-1006", "陈牧", true, true, "");
  const o = state().orders.find((x) => x.id === "O-1006")!;
  assert(o.status === "completed" && o.confirmations.length === 2 && !!o.completedAt, "连续两次通过后完成");
}

// ---------- 6. 修正单：旧单留档、沿用不重复扣库 ----------
console.log("6) 修正测量/换蹄铁：旧单留档，不重复扣库");
{
  actions.resetDemo();
  // O-1001 已 issued：AL-F130×2、AL-H124×2
  const before = state().shoes.find((x) => x.id === "AL-F130")!.quantity;
  const r = actions.reviseOrder("O-1001", "右前重测");
  assert(r.ok && !!r.id, "开出修正单");
  const s = state();
  const old = s.orders.find((x) => x.id === "O-1001")!;
  const neu = s.orders.find((x) => x.id === r.id)!;
  assert(old.status === "archived" && !!old.archiveReason, "旧单留档");
  assert(neu.revisionOf === "O-1001" && neu.status === "draft", "新单为修正单、测量中");
  assert(["LF", "RF", "LH", "RH"].every((id) => neu.hooves[id as "LF"].carryOver), "四蹄默认沿用旧蹄铁");

  // 全部沿用核验+领用：库存不变
  actions.runCheck(neu.id);
  const afterCheck = state().orders.find((x) => x.id === neu.id)!;
  assert(afterCheck.status === "ready", "沿用蹄铁核验通过（停用不影响沿用判定）→ 待领用");
  actions.issueOrder(neu.id);
  const after = state().shoes.find((x) => x.id === "AL-F130")!.quantity;
  assert(before === after, "全沿用领用不重复扣库");
  const carryLedger = state().ledger.filter((l) => l.orderId === neu.id).length;
  assert(carryLedger === 0, "沿用未新增扣库台账");
}

// ---------- 7. 换蹄铁的蹄才扣库 ----------
console.log("7) 修正单中换蹄铁的蹄按新蹄铁扣库");
{
  actions.resetDemo();
  const r = actions.reviseOrder("O-1001", "换前蹄铁");
  const id = r.id!;
  // 左前换为 AL-F135（测量 130/118 与 135/122 差 5/4，会失败——先验证超差拦截）
  actions.pickShoe(id, "LF", "AL-F135");
  const neu = state().orders.find((x) => x.id === id)!;
  assert(!neu.hooves.LF.carryOver && neu.hooves.RF.carryOver, "换蹄铁自动取消沿用，其他保持沿用");
  const blocked = actions.runCheck(id);
  assert(!blocked.ok && state().orders.find((x) => x.id === id)!.status === "pendingStock", "尺寸差超 2mm 时修正单也停在待备料");

  // 左前改配 ST-F128（128×116/8孔18mm）：同步修正测量为 128/116/18
  actions.pickShoe(id, "LF", "ST-F128");
  actions.setMeasurement(id, "LF", "lengthMm", "128");
  actions.setMeasurement(id, "LF", "widthMm", "116");
  actions.setMeasurement(id, "LF", "nailSpacingMm", "18");
  const stBefore = state().shoes.find((x) => x.id === "ST-F128")!.quantity;
  const alBefore = state().shoes.find((x) => x.id === "AL-F130")!.quantity;
  const run = actions.runCheck(id);
  const checked = state().orders.find((x) => x.id === id)!;
  assert(run.ok && checked.status === "ready", "换蹄铁并修正测量后核验通过 → 待领用");
  actions.issueOrder(id);
  const s = state();
  assert(s.shoes.find((x) => x.id === "ST-F128")!.quantity === stBefore - 1, "仅换蹄的左前扣 1 只 ST-F128");
  assert(s.shoes.find((x) => x.id === "AL-F130")!.quantity === alBefore, "AL-F130 沿用不扣");
}

// ---------- 8. 停用库存致结论失效 ----------
console.log("8) 停用蹄铁：已领用单留档+自动修正，库存数量保留");
{
  actions.resetDemo();
  const qtyBefore = state().shoes.find((x) => x.id === "AL-F130")!.quantity;
  actions.deactivateShoe("AL-F130");
  const s = state();
  assert(s.shoes.find((x) => x.id === "AL-F130")!.active === false, "蹄铁已停用");
  assert(s.shoes.find((x) => x.id === "AL-F130")!.quantity === qtyBefore, "停用不扣减数量");
  const old = s.orders.find((x) => x.id === "O-1001")!;
  assert(old.status === "archived", "引用它的已领用单留档");
  const rev = s.orders.find((x) => x.revisionOf === "O-1001")!;
  assert(!!rev && rev.status === "draft", "自动开修正单");
  assert(rev.hooves.LF.carryOver && rev.hooves.RF.carryOver && !rev.hooves.LH.carryOver, "受影响前蹄默认沿用，后蹄保持原样");

  // HORSE-18 仍只有一张未结束单（自动修正单），不能再开
  const dup = actions.createOrder({ horseId: "HORSE-18", horseName: "", farrier: "陈牧", nextCheckDate: null });
  assert(!dup.ok, "留档旧单不算未结束，自动修正单占名额");
}

// ---------- 9. 钉位敏感区几何判定 ----------
console.log("9) 钉位敏感区判定");
{
  const sku = buildSeedState().shoes.find((x) => x.id === "AL-F135")!;
  const shoes = buildNailPlan(sku);
  const a: HoofAssignment = {
    measurement: { lengthMm: 135, widthMm: 122, nailSpacingMm: 22, gaitGrade: "stable" },
    shoeId: sku.id,
    nails: shoes,
    carryOver: false,
    check: null,
  };
  assert(evaluateHoof(a, sku).pass, "默认钉位全部安全");
  a.nails[3].insetMm = 22;
  const rep = evaluateHoof(a, sku);
  assert(!rep.pass && rep.sensitiveHits.includes(a.nails[3].id), "过深钉位判入敏感区");
}

// ---------- 9b. 待领用单修改后结论失效退回测量中 ----------
console.log("9b) 待领用后修改测量：结论失效、退回测量中、不扣库");
{
  actions.resetDemo();
  const qty = state().shoes.find((x) => x.id === "ST-H128")!.quantity;
  actions.setMeasurement("O-1006", "LF", "lengthMm", "129");
  const o = state().orders.find((x) => x.id === "O-1006")!;
  assert(o.status === "draft", "修改后退回测量中");
  assert(o.hooves.LF.check === null, "被修改的左前结论清空");
  assert(o.hooves.RH.check?.pass === true, "未修改蹄保留上次核验明细（重新核验时一并复核）");
  assert(state().shoes.find((x) => x.id === "ST-H128")!.quantity === qty, "未领用不扣库");
  // 重新核验仍通过 → 可再次领用
  actions.runCheck("O-1006");
  assert(state().orders.find((x) => x.id === "O-1006")!.status === "ready", "重核通过回到待领用");
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail > 0) process.exit(1);
