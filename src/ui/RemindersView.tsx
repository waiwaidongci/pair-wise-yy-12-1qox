import type { AppState } from "../domain/types";
import { buildReminders, todayISO, type Reminder } from "../domain/rules";
import { Badge } from "./widgets";

const KIND_META: Record<Reminder["kind"], { label: string; icon: string }> = {
  stock: { label: "待备料", icon: "🧲" },
  trial: { label: "试装确认", icon: "🐎" },
  recheck: { label: "复查", icon: "📅" },
  open: { label: "库存/停滞", icon: "📦" },
};

export function RemindersView({
  state,
  onSelectOrder,
}: {
  state: AppState;
  onSelectOrder: (id: string) => void;
}) {
  const reminders = buildReminders(state, todayISO());
  const groups: Reminder["kind"][] = ["stock", "trial", "recheck", "open"];

  return (
    <div className="reminders">
      <section className="panel">
        <div className="heading">
          <div>
            <p>工作台提醒</p>
            <h2>备料 · 试装 · 复查 · 库存</h2>
          </div>
          <Badge tone={reminders.length ? "warn" : "ok"}>{reminders.length} 条提醒</Badge>
        </div>
        {reminders.length === 0 && <p className="empty-hint">全部适配单流转正常，暂无提醒。</p>}
        <div className="reminder-groups">
          {groups.map((kind) => {
            const items = reminders.filter((r) => r.kind === kind);
            if (!items.length) return null;
            return (
              <div key={kind} className="reminder-group">
                <h3>{KIND_META[kind].icon} {KIND_META[kind].label}（{items.length}）</h3>
                {items.map((r, i) => (
                  <article key={i} className={`reminder-item level-${r.level}`}>
                    <div>
                      <b>{r.title}</b>
                      <p>{r.detail}</p>
                    </div>
                    {r.orderId && (
                      <button onClick={() => onSelectOrder(r.orderId!)}>打开适配单</button>
                    )}
                  </article>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
