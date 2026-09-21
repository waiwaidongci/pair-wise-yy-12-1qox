import { useMemo, useState } from "react";
import "./styles.css";
import { useStore } from "./state/store";
import { buildReminders, todayISO } from "./domain/rules";
import { OrderList } from "./ui/OrderList";
import { OrderDetail } from "./ui/OrderDetail";
import { InventoryView } from "./ui/InventoryView";
import { RemindersView } from "./ui/RemindersView";
import { NewOrderForm } from "./ui/NewOrderForm";

type Tab = "orders" | "inventory" | "reminders";

function App() {
  const state = useStore();
  const [tab, setTab] = useState<Tab>("orders");
  const [selectedId, setSelectedId] = useState<string | null>(state.orders[0]?.id ?? null);
  const [showNew, setShowNew] = useState(false);

  const selected = state.orders.find((o) => o.id === selectedId) ?? null;

  const metrics = useMemo(() => {
    const open = state.orders.filter((o) => o.status !== "completed" && o.status !== "archived");
    return [
      { key: "pendingStock", label: "待备料", value: open.filter((o) => o.status === "pendingStock").length, tone: "warn" },
      { key: "trial", label: "试装待确认", value: open.filter((o) => o.status === "issued" || o.status === "trial").length, tone: "neutral" },
      {
        key: "recheck",
        label: "复查到期",
        value: buildReminders(state, todayISO()).filter((r) => r.kind === "recheck").length,
        tone: "bad",
      },
      { key: "open", label: "未结束适配单", value: open.length, tone: "ok" },
    ] as const;
  }, [state]);

  const goOrder = (id: string) => {
    setSelectedId(id);
    setTab("orders");
  };

  return (
    <main className="app">
      <section className="hero compact">
        <div>
          <p>hxyfront-62011 · 四蹄测量适配与蹄铁领用台</p>
          <h1>马术蹄铁适配工作台</h1>
          <span>
            四蹄长宽 / 钉孔距 / 步态分级缺项不得启动；尺寸差超 2mm、钉孔模式不符或钉位入蹄底敏感区，整单停在待备料且不扣库；
            试装须另一名蹄铁师连续两次确认；修正测量、换蹄铁或停用库存致结论失效时旧单留档、不重复扣库。
          </span>
        </div>
        <button className="primary hero-btn" onClick={() => setShowNew(true)}>＋ 新建适配单</button>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <button
            key={m.key}
            className={`metric metric-${m.tone}`}
            onClick={() => setTab(m.key === "recheck" || m.key === "trial" ? "reminders" : "orders")}
          >
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </button>
        ))}
      </section>

      <nav className="tabs">
        <button className={tab === "orders" ? "tab-on" : ""} onClick={() => setTab("orders")}>适配单</button>
        <button className={tab === "inventory" ? "tab-on" : ""} onClick={() => setTab("inventory")}>库存与台账</button>
        <button className={tab === "reminders" ? "tab-on" : ""} onClick={() => setTab("reminders")}>
          提醒
          {metrics[2].value > 0 && <em className="tab-dot">{metrics[2].value}</em>}
        </button>
      </nav>

      {tab === "orders" && (
        <section className="workspace orders-layout">
          <aside className="panel list-panel">
            <OrderList orders={state.orders} selectedId={selectedId} onSelect={setSelectedId} />
          </aside>
          <OrderDetail order={selected} state={state} onSelectOrder={goOrder} />
        </section>
      )}
      {tab === "inventory" && <InventoryView state={state} />}
      {tab === "reminders" && <RemindersView state={state} onSelectOrder={goOrder} />}

      {showNew && (
        <NewOrderForm
          farriers={state.farriers}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            goOrder(id);
          }}
        />
      )}
    </main>
  );
}

export default App;
