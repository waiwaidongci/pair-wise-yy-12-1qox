import { useMemo, useState } from "react";
import type { FittingOrder, OrderStatus } from "../domain/types";
import { HOOF_META, orderMissing, STATUS_META } from "../domain/rules";
import { Badge } from "./widgets";

const FILTERS: { key: string; label: string; match: (s: OrderStatus) => boolean }[] = [
  { key: "open", label: "未结束", match: (s) => s !== "completed" && s !== "archived" },
  { key: "draft", label: "测量中", match: (s) => s === "draft" },
  { key: "pendingStock", label: "待备料", match: (s) => s === "pendingStock" },
  { key: "ready", label: "待领用", match: (s) => s === "ready" },
  { key: "trial", label: "试装中", match: (s) => s === "issued" || s === "trial" },
  { key: "completed", label: "已完成", match: (s) => s === "completed" },
  { key: "archived", label: "已留档", match: (s) => s === "archived" },
];

export function OrderList({
  orders,
  selectedId,
  onSelect,
}: {
  orders: FittingOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const kw = q.trim().toUpperCase();
    return orders.filter(
      (o) =>
        f.match(o.status) &&
        (!kw || o.horseId.toUpperCase().includes(kw) || o.horseName.includes(q.trim()) || o.id.toUpperCase().includes(kw)),
    );
  }, [orders, filter, q]);

  return (
    <div className="order-list">
      <div className="list-toolbar">
        <input placeholder="搜马匹编号 / 名称 / 单号" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips chips-scroll">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? "chip-on" : ""}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <em>{orders.filter((o) => f.match(o.status)).length}</em>
          </button>
        ))}
      </div>
      <div className="list-rows">
        {filtered.length === 0 && <p className="empty-hint">没有符合条件的适配单</p>}
        {filtered.map((o) => {
          const missing = orderMissing(o);
          const meta = STATUS_META[o.status];
          return (
            <button
              key={o.id}
              className={`list-row ${selectedId === o.id ? "row-on" : ""}`}
              onClick={() => onSelect(o.id)}
            >
              <div className="row-main">
                <b>{o.horseId}</b>
                <span>{o.horseName} · {o.id}</span>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <div className="row-meta">
                <span>开单：{o.farrier}</span>
                {o.status === "issued" || o.status === "trial" ? (
                  <span>确认 {o.confirmations.length}/2</span>
                ) : missing.length > 0 ? (
                  <span className="missing">
                    缺：
                    {missing.map((x) => HOOF_META[x.hoofId].short + x.items.join("/")).join("，")}
                  </span>
                ) : (
                  <span>{o.updatedAt.slice(5)}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
