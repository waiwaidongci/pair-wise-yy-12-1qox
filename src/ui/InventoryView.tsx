import { useMemo, useState } from "react";
import type { AppState } from "../domain/types";
import { actions } from "../state/store";
import { Badge } from "./widgets";

const SHAPE_LABEL = { front: "前蹄", hind: "后蹄", universal: "通用" } as const;

export function InventoryView({ state }: { state: AppState }) {
  const [restockId, setRestockId] = useState<string | null>(null);
  const [amount, setAmount] = useState("4");
  const [showAdd, setShowAdd] = useState(false);

  // 待领占用：待领用单（核验已过尚未扣库）将在领用时扣减的数量
  const reserved = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of state.orders) {
      if (o.status !== "ready") continue;
      for (const h of Object.values(o.hooves)) {
        if (h.shoeId && !h.carryOver) {
          map.set(h.shoeId, (map.get(h.shoeId) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [state]);

  return (
    <div className="inventory">
      <section className="panel">
        <div className="heading">
          <div>
            <p>蹄铁库存</p>
            <h2>领用台库存台账</h2>
          </div>
          <div className="head-actions">
            <button onClick={() => setShowAdd((v) => !v)}>{showAdd ? "收起新增" : "新增蹄铁规格"}</button>
            <button className="danger" onClick={() => {
              if (window.confirm("恢复演示数据？当前本地修改将被清除。")) actions.resetDemo();
            }}>
              重置演示数据
            </button>
          </div>
        </div>
        <p className="rule-hint">
          只有待领用单执行「领用」时才扣减库存；卡在待备料的单不扣库。停用蹄铁会使引用它的已领用/试装单结论失效并自动开修正单，旧单留档。
        </p>

        {showAdd && <AddShoeForm onDone={() => setShowAdd(false)} />}

        <div className="table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>名称 / 材质</th>
                <th>蹄形</th>
                <th>长×宽 mm</th>
                <th>孔数/孔距</th>
                <th>库存</th>
                <th>待领占用</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {state.shoes.map((s) => (
                <tr key={s.id} className={s.active ? "" : "row-inactive"}>
                  <td><b>{s.id}</b></td>
                  <td>{s.name}<small className="cell-note">{s.material} · {s.note}</small></td>
                  <td>{SHAPE_LABEL[s.shape]}</td>
                  <td>{s.lengthMm} × {s.widthMm}</td>
                  <td>{s.holeCount} 孔 / {s.nailSpacingMm}mm</td>
                  <td>
                    <span className={s.quantity === 0 ? "qty-zero" : s.quantity <= 2 ? "qty-low" : ""}>{s.quantity}</span>
                  </td>
                  <td>{reserved.get(s.id) ?? 0}</td>
                  <td>{s.active ? <Badge tone="ok">在用</Badge> : <Badge tone="lock">已停用</Badge>}</td>
                  <td className="cell-actions">
                    {restockId === s.id ? (
                      <span className="restock-inline">
                        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 70 }} />
                        <button className="primary" onClick={() => {
                          actions.restock(s.id, Math.max(0, Number(amount) || 0));
                          setRestockId(null);
                        }}>确认</button>
                        <button onClick={() => setRestockId(null)}>取消</button>
                      </span>
                    ) : (
                      <>
                        <button disabled={!s.active} onClick={() => setRestockId(s.id)}>补货</button>
                        {s.active ? (
                          <button
                            className="danger"
                            onClick={() => {
                              if (window.confirm(`停用 ${s.id}？引用它的已领用/试装单将结论失效、留档并开修正单（不重复扣库）。`)) {
                                actions.deactivateShoe(s.id);
                              }
                            }}
                          >
                            停用
                          </button>
                        ) : (
                          <button onClick={() => actions.activateShoe(s.id)}>重新启用</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>出入库记录</p>
            <h2>扣库 / 补货 / 调整台账</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="inv-table ledger-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>蹄铁</th>
                <th>变动</th>
                <th>类型</th>
                <th>关联适配单</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {state.ledger.map((l) => (
                <tr key={l.id}>
                  <td>{l.at}</td>
                  <td>{l.shoeId}</td>
                  <td className={l.delta < 0 ? "delta-out" : l.delta > 0 ? "delta-in" : ""}>
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td>{l.reason === "issue" ? "领用" : l.reason === "restock" ? "补货" : l.reason === "carry" ? "沿用" : "调整"}</td>
                  <td>{l.orderId ?? "—"}{l.hoofId ? `（${l.hoofId}）` : ""}</td>
                  <td>{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AddShoeForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    id: "",
    name: "",
    shape: "front" as "front" | "hind" | "universal",
    material: "钢",
    lengthMm: 130,
    widthMm: 118,
    holeCount: 6,
    nailSpacingMm: 20,
    quantity: 4,
    note: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="add-shoe-form">
      <div className="field-grid">
        <label><span>编号 *</span><input value={form.id} onChange={(e) => set("id", e.target.value.toUpperCase())} placeholder="如 ST-F132" /></label>
        <label><span>名称</span><input value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span>材质</span><input value={form.material} onChange={(e) => set("material", e.target.value)} /></label>
        <label>
          <span>蹄形</span>
          <select value={form.shape} onChange={(e) => set("shape", e.target.value as typeof form.shape)}>
            <option value="front">前蹄</option>
            <option value="hind">后蹄</option>
            <option value="universal">通用</option>
          </select>
        </label>
        <label><span>长 mm</span><input type="number" value={form.lengthMm} onChange={(e) => set("lengthMm", Number(e.target.value))} /></label>
        <label><span>宽 mm</span><input type="number" value={form.widthMm} onChange={(e) => set("widthMm", Number(e.target.value))} /></label>
        <label><span>孔数</span><input type="number" value={form.holeCount} onChange={(e) => set("holeCount", Number(e.target.value))} /></label>
        <label><span>孔距 mm</span><input type="number" step={0.5} value={form.nailSpacingMm} onChange={(e) => set("nailSpacingMm", Number(e.target.value))} /></label>
        <label><span>初始库存</span><input type="number" value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></label>
        <label><span>备注</span><input value={form.note} onChange={(e) => set("note", e.target.value)} /></label>
      </div>
      <button
        className="primary"
        onClick={() => {
          const res = actions.addShoe({ ...form, active: true });
          if (!res.ok) window.alert(res.error);
          else onDone();
        }}
      >
        保存蹄铁规格
      </button>
    </div>
  );
}
