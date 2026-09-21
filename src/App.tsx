import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { store, useData } from "./state/store";
import {
  buildMetrics,
  buildReminders,
  evaluateOrder,
} from "./domain/rules";
import { OrdersPanel } from "./ui/OrdersPanel";
import { InventoryPanel } from "./ui/InventoryPanel";
import { RemindersPanel } from "./ui/RemindersPanel";
import { OrderDetail } from "./ui/OrderDetail";
import { Badge } from "./ui/components";

type Tab = "board" | "inventory" | "archive";

interface Toast {
  id: number;
  text: string;
  ok: boolean;
}

function App() {
  const data = useData();
  const [tab, setTab] = useState<Tab>("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (text: string, ok: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, ok }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3600);
  };

  // 列表 / 库存 / 提醒全部由同一份 data 推导，任意 action 提交后同步刷新
  const metrics = useMemo(
    () => buildMetrics(data.orders, data.shoes),
    [data.orders, data.shoes]
  );
  const reminders = useMemo(
    () => buildReminders(data.orders, data.shoes),
    [data.orders, data.shoes]
  );
  const issuesMap = useMemo(() => {
    const map = new Map();
    for (const o of data.orders) {
      map.set(o.id, evaluateOrder(o, data.shoes));
    }
    return map;
  }, [data.orders, data.shoes]);

  const openOrder = openId
    ? data.orders.find((o) => o.id === openId) ?? null
    : null;

  // 适配单被删除时关闭弹窗
  useEffect(() => {
    if (openId && !data.orders.some((o) => o.id === openId)) {
      setOpenId(null);
    }
  }, [data.orders, openId]);

  const archiveOrders = data.orders.filter(
    (o) => o.status === "completed" || o.status === "archived"
  );

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62011 · 四蹄测量适配与蹄铁领用台</p>
        <h1>马术蹄铁修整档案</h1>
        <span>
          每匹马仅一张未结束适配单；四蹄长宽、钉孔距、钉位与步态分级缺项不得启动。任一蹄尺寸差超过
          2 毫米、钉孔模式不符或钉位落入蹄底敏感区时，整单停在待备料且库存不扣减。试装后须由
          <b>另一名蹄铁师连续两次</b>确认步态稳定、蹄铁无松动才完成；修正测量、换蹄铁或停用库存会使结论失效，旧单留档且不重复扣库。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>未结束适配单</small>
          <strong>{metrics.openOrders}</strong>
        </article>
        <article>
          <small>待备料（未扣库）</small>
          <strong>{metrics.pendingMaterial}</strong>
        </article>
        <article>
          <small>待试装复核</small>
          <strong>{metrics.awaitingTrial}</strong>
        </article>
        <article>
          <small>异常步态 / 库存预警</small>
          <strong>
            {metrics.abnormalGait}
            <em> / {metrics.lowStock}</em>
          </strong>
        </article>
      </section>

      <nav className="tabs">
        <button
          type="button"
          className={tab === "board" ? "tab-on" : ""}
          onClick={() => setTab("board")}
        >
          适配工作台
        </button>
        <button
          type="button"
          className={tab === "inventory" ? "tab-on" : ""}
          onClick={() => setTab("inventory")}
        >
          蹄铁库存
        </button>
        <button
          type="button"
          className={tab === "archive" ? "tab-on" : ""}
          onClick={() => setTab("archive")}
        >
          完成与归档档案
        </button>
        <button
          type="button"
          className="reset-btn"
          onClick={() => {
            if (confirm("重置为演示数据？当前本地修改将被清除。")) {
              store.resetDemo();
              setOpenId(null);
              pushToast("已重置为演示数据", true);
            }
          }}
        >
          重置演示数据
        </button>
      </nav>

      {tab === "board" ? (
        <section className="board-grid">
          <div className="board-main">
            <OrdersPanel
              orders={data.orders}
              farriers={data.farriers}
              issuesMap={issuesMap}
              onOpenOrder={setOpenId}
              onToast={pushToast}
            />
          </div>
          <aside className="board-side">
            <RemindersPanel items={reminders} onOpenOrder={setOpenId} />
            <section className="panel rules-panel">
              <div className="heading">
                <div>
                  <p>规则速览</p>
                  <h2>红线规则</h2>
                </div>
              </div>
              <ol className="rules-list">
                <li>每匹马仅一张未结束适配单（测量中/待备料/待试装）。</li>
                <li>四蹄长宽、钉孔距、全部钉位、步态分级缺项不得启动。</li>
                <li>任一蹄尺寸差 &gt; 2mm、钉孔模式不符、钉位落入蹄底敏感区：整单待备料，库存不扣减。</li>
                <li>四蹄全部通过校验才备料扣库，进入试装。</li>
                <li>另一名蹄铁师连续两次确认步态稳定且蹄铁无松动才完成。</li>
                <li>修正测量 / 换蹄铁 / 停用库存使结论失效；旧单留档，已领蹄铁 reused 沿用、不重复扣库。</li>
              </ol>
            </section>
          </aside>
        </section>
      ) : null}

      {tab === "inventory" ? (
        <InventoryPanel shoes={data.shoes} onToast={pushToast} />
      ) : null}

      {tab === "archive" ? (
        <section className="panel">
          <div className="heading">
            <div>
              <p>历史档案</p>
              <h2>完成单与归档旧单（只读留档）</h2>
            </div>
          </div>
          {archiveOrders.length === 0 ? (
            <p className="empty-hint">暂无历史档案</p>
          ) : (
            <div className="order-list">
              {archiveOrders.map((o) => (
                <article
                  key={o.id}
                  className="order-row"
                  onClick={() => setOpenId(o.id)}
                >
                  <div className="order-row-main">
                    <h3>
                      {o.horseCode}
                      {o.horseName ? (
                        <span className="muted"> · {o.horseName}</span>
                      ) : null}
                    </h3>
                    <p className="order-row-meta">
                      适配单 {o.id}
                      {o.supersededBy ? (
                        <Badge tone="status-archive">已被新单取代</Badge>
                      ) : null}
                      {o.supersedes ? <Badge tone="tag-reuse">修正重适配</Badge> : null}
                    </p>
                  </div>
                  <div className="order-row-side">
                    <Badge
                      tone={
                        o.status === "archived"
                          ? "status-archive"
                          : "status-done"
                      }
                    >
                      {o.status === "archived" ? "已归档" : "已完成"}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {openOrder ? (
        <OrderDetail
          order={openOrder}
          shoes={data.shoes}
          farriers={data.farriers}
          issues={issuesMap.get(openOrder.id) ?? {}}
          onClose={() => setOpenId(null)}
          onToast={pushToast}
          onOpenOrder={setOpenId}
        />
      ) : null}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.ok ? "ok" : "fail"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
