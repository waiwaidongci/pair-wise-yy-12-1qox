import { useMemo, useState } from "react";
import {
  FittingOrder,
  Farrier,
  GAIT_GRADE_OPTIONS,
} from "../domain/types";
import {
  blockingIssues,
  isOpenStatus,
  trailingPasses,
  type OrderIssues,
} from "../domain/rules";
import { Badge, Panel } from "./components";
import {
  GAIT_TONE,
  reviewLabel,
  STATUS_META,
} from "./format";
import { store } from "../state/store";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "open", label: "未结束" },
  { key: "draft", label: "测量中" },
  { key: "pending_material", label: "待备料" },
  { key: "awaiting_trial", label: "待试装复核" },
  { key: "completed", label: "已完成" },
  { key: "archived", label: "已归档" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function OrdersPanel({
  orders,
  farriers,
  issuesMap,
  onOpenOrder,
  onToast,
}: {
  orders: FittingOrder[];
  farriers: Farrier[];
  issuesMap: Map<string, OrderIssues>;
  onOpenOrder: (id: string) => void;
  onToast: (msg: string, ok: boolean) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [keyword, setKeyword] = useState("");
  const [horseCode, setHorseCode] = useState("");
  const [horseName, setHorseName] = useState("");
  const [farrierId, setFarrierId] = useState(farriers[0]?.id ?? "");

  const filtered = useMemo(() => {
    const kw = keyword.trim();
    return orders.filter((o) => {
      if (filter === "open" && !isOpenStatus(o.status)) return false;
      if (filter !== "all" && filter !== "open" && o.status !== filter)
        return false;
      if (
        kw &&
        !`${o.horseCode} ${o.horseName} ${o.gaitNote}`.includes(kw)
      )
        return false;
      return true;
    });
  }, [orders, filter, keyword]);

  return (
    <Panel
      title="四蹄测量适配单"
      subtitle="每匹马仅一张未结束单"
      extra={
        <input
          className="search-input"
          placeholder="搜索马匹编号 / 名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      }
    >
      <div className="new-order">
        <input
          placeholder="马匹编号（如 HORSE-66）"
          value={horseCode}
          onChange={(e) => setHorseCode(e.target.value)}
        />
        <input
          placeholder="马名（可选）"
          value={horseName}
          onChange={(e) => setHorseName(e.target.value)}
        />
        <select value={farrierId} onChange={(e) => setFarrierId(e.target.value)}>
          {farriers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const r = store.createOrder(horseCode, horseName, farrierId);
            onToast(r.message ?? (r.ok ? "已创建测量草稿" : "创建失败"), r.ok);
            if (r.ok && r.orderId) {
              setHorseCode("");
              setHorseName("");
              onOpenOrder(r.orderId);
            }
          }}
        >
          新建测量适配单
        </button>
      </div>

      <div className="chips filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "chip-on" : ""}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="order-list">
        {filtered.length === 0 ? (
          <p className="empty-hint">没有符合条件的适配单</p>
        ) : (
          filtered.map((o) => {
            const review = reviewLabel(o.nextReviewDate);
            const issues = blockingIssues(issuesMap.get(o.id) ?? {});
            const passes = trailingPasses(o.confirmations);
            const farrierName =
              farriers.find((f) => f.id === o.farrierId)?.name ?? "未指派";
            return (
              <article
                key={o.id}
                className="order-row"
                onClick={() => onOpenOrder(o.id)}
              >
                <div className="order-row-main">
                  <h3>
                    {o.horseCode}
                    {o.horseName ? <span className="muted"> · {o.horseName}</span> : null}
                  </h3>
                  <p className="order-row-meta">
                    装蹄：{farrierName}
                    {o.gaitGrade ? (
                      <Badge tone={GAIT_TONE[o.gaitGrade]}>
                        {GAIT_GRADE_OPTIONS.find((g) => g.value === o.gaitGrade)
                          ?.label}
                      </Badge>
                    ) : null}
                    {o.supersedes ? <Badge tone="tag-reuse">沿用旧铁</Badge> : null}
                  </p>
                </div>
                <div className="order-row-side">
                  <Badge tone={`status-${STATUS_META[o.status].tone}`}>
                    {STATUS_META[o.status].label}
                  </Badge>
                  {o.status === "pending_material" && issues.length > 0 ? (
                    <span className="row-issue">{issues[0].message}</span>
                  ) : null}
                  {o.status === "awaiting_trial" ? (
                    <span className="muted">
                      {o.trialFittedAt
                        ? `连续确认 ${passes}/2`
                        : "待标记试装"}
                    </span>
                  ) : null}
                  {review ? <Badge tone={review.tone}>{review.text}</Badge> : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </Panel>
  );
}
