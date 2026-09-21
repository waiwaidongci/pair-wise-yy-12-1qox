import { ReminderItem } from "../domain/types";
import { Panel } from "./components";

const KIND_META: Record<
  ReminderItem["kind"],
  { label: string; tone: string }
> = {
  overdue: { label: "复查逾期", tone: "rem-overdue" },
  review_today: { label: "今日复查", tone: "rem-today" },
  review_soon: { label: "即将复查", tone: "rem-soon" },
  gait: { label: "异常步态", tone: "rem-gait" },
  material: { label: "待备料", tone: "rem-material" },
  confirm: { label: "待复核", tone: "rem-confirm" },
  low_stock: { label: "库存不足", tone: "rem-stock" },
};

export function RemindersPanel({
  items,
  onOpenOrder,
}: {
  items: ReminderItem[];
  onOpenOrder: (id: string) => void;
}) {
  return (
    <Panel title="复查与工作台提醒" subtitle="同一数据源">
      {items.length === 0 ? (
        <p className="empty-hint">暂无提醒</p>
      ) : (
        <ul className="reminder-list">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            return (
              <li key={item.id}>
                <span className={`badge ${meta.tone}`}>{meta.label}</span>
                <button
                  type="button"
                  className="reminder-text"
                  disabled={!item.orderId}
                  onClick={() => item.orderId && onOpenOrder(item.orderId)}
                >
                  {item.title}
                  {item.date ? <em className="muted"> · {item.date}</em> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
