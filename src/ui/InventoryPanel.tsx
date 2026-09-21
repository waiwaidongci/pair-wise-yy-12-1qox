import { useState } from "react";
import { HOLE_PATTERNS, PositionKind, Shoe } from "../domain/types";
import { NumInput, Panel } from "./components";
import { PATTERN_LABEL } from "../domain/types";
import { store } from "../state/store";

export function InventoryPanel({
  shoes,
  onToast,
}: {
  shoes: Shoe[];
  onToast: (msg: string, ok: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    kind: "front" as PositionKind,
    lengthMm: 140 as number | "",
    widthMm: 132 as number | "",
    holeSpacingMm: 24 as number | "",
    pattern: "P6" as Shoe["pattern"],
    qty: 1 as number | "",
  });

  const reset = () =>
    setForm({
      sku: "",
      name: "",
      kind: "front",
      lengthMm: 140,
      widthMm: 132,
      holeSpacingMm: 24,
      pattern: "P6",
      qty: 1,
    });

  return (
    <Panel
      title="蹄铁库存"
      subtitle="备料通过才扣库；停用库存会使进行中适配单退回待备料"
      extra={
        <button type="button" className="primary" onClick={() => setAdding((v) => !v)}>
          {adding ? "收起" : "新增蹄铁"}
        </button>
      }
    >
      {adding ? (
        <div className="new-shoe">
          <input
            placeholder="蹄铁编号 SKU（如 AL-F142-P6）"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
          <input
            placeholder="名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label>
            <span>适用蹄位</span>
            <select
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value as PositionKind })
              }
            >
              <option value="front">前蹄</option>
              <option value="hind">后蹄</option>
              <option value="universal">通用</option>
            </select>
          </label>
          <label>
            <span>蹄铁长</span>
            <NumInput
              value={form.lengthMm}
              suffix="mm"
              onChange={(v) => setForm({ ...form, lengthMm: v })}
            />
          </label>
          <label>
            <span>蹄铁宽</span>
            <NumInput
              value={form.widthMm}
              suffix="mm"
              onChange={(v) => setForm({ ...form, widthMm: v })}
            />
          </label>
          <label>
            <span>钉孔距</span>
            <NumInput
              value={form.holeSpacingMm}
              suffix="mm"
              onChange={(v) => setForm({ ...form, holeSpacingMm: v })}
            />
          </label>
          <label>
            <span>钉孔模式</span>
            <select
              value={form.pattern}
              onChange={(e) =>
                setForm({ ...form, pattern: e.target.value as Shoe["pattern"] })
              }
            >
              {HOLE_PATTERNS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>初始库存</span>
            <NumInput
              value={form.qty}
              suffix="只"
              onChange={(v) => setForm({ ...form, qty: v })}
            />
          </label>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (
                !form.sku.trim() ||
                !form.name.trim() ||
                form.lengthMm === "" ||
                form.widthMm === "" ||
                form.holeSpacingMm === "" ||
                form.qty === ""
              ) {
                onToast("请填齐蹄铁编号、名称与尺寸", false);
                return;
              }
              const r = store.addShoe({
                sku: form.sku,
                name: form.name,
                kind: form.kind,
                side: "universal",
                lengthMm: Number(form.lengthMm),
                widthMm: Number(form.widthMm),
                holeSpacingMm: Number(form.holeSpacingMm),
                pattern: form.pattern,
                qty: Number(form.qty),
                active: true,
              });
              onToast(r.message ?? (r.ok ? "已新增蹄铁" : "新增失败"), r.ok);
              if (r.ok) {
                reset();
                setAdding(false);
              }
            }}
          >
            保存蹄铁
          </button>
        </div>
      ) : null}

      <div className="shoe-table-wrap">
        <table className="shoe-table">
          <thead>
            <tr>
              <th>编号 / 名称</th>
              <th>蹄位</th>
              <th>长×宽 (mm)</th>
              <th>钉孔距</th>
              <th>模式</th>
              <th>库存</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {shoes.map((s) => (
              <tr key={s.id} className={s.active ? "" : "inactive"}>
                <td>
                  <b>{s.sku}</b>
                  <span className="muted"> · {s.name}</span>
                </td>
                <td>{s.kind === "front" ? "前蹄" : s.kind === "hind" ? "后蹄" : "通用"}</td>
                <td>
                  {s.lengthMm}×{s.widthMm}
                </td>
                <td>{s.holeSpacingMm}mm</td>
                <td>{PATTERN_LABEL[s.pattern]}</td>
                <td>
                  <span className={s.qty <= 2 ? "qty-low" : ""}>{s.qty} 只</span>
                </td>
                <td>{s.active ? "在用" : "已停用"}</td>
                <td className="shoe-actions">
                  <RestockControl
                    onRestock={(qty) => {
                      const r = store.restockShoe(s.id, qty);
                      onToast(r.ok ? `已入库 ${qty} 只` : "入库失败", r.ok);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (s.active && !confirm(`停用 ${s.sku}？使用它的进行中适配单将退回待备料。`))
                        return;
                      const r = store.setShoeActive(s.id, !s.active);
                      onToast(r.message ?? "操作完成", r.ok);
                    }}
                  >
                    {s.active ? "停用库存" : "重新启用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RestockControl({ onRestock }: { onRestock: (qty: number) => void }) {
  const [qty, setQty] = useState<number | "">(2);
  return (
    <span className="restock">
      <NumInput value={qty} suffix="只" onChange={setQty} />
      <button type="button" onClick={() => qty !== "" && onRestock(Number(qty))}>
        入库
      </button>
    </span>
  );
}
