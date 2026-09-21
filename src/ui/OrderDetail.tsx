import { useState } from "react";
import type { AppState, FittingOrder } from "../domain/types";
import {
  GAIT_LABEL,
  HOOF_IDS,
  orderMissing,
  STATUS_META,
} from "../domain/rules";
import { actions } from "../state/store";
import { Badge, EmptyHint } from "./widgets";
import { HoofCard } from "./HoofCard";

export function OrderDetail({
  order,
  state,
  onSelectOrder,
}: {
  order: FittingOrder | null;
  state: AppState;
  onSelectOrder: (id: string) => void;
}) {
  if (!order) {
    return (
      <div className="panel detail-empty">
        <EmptyHint>从左侧选择一张适配单，或新建适配单</EmptyHint>
      </div>
    );
  }

  const linked = order.revisionOf
    ? state.orders.find((x) => x.id === order.revisionOf)
    : state.orders.find((x) => x.revisionOf === order.id);

  return (
    <div className="detail">
      <section className="panel detail-head">
        <div className="heading">
          <div>
            <p>四蹄测量适配单</p>
            <h2>
              {order.horseId} · {order.horseName}
              <span className="order-id">{order.id}</span>
            </h2>
          </div>
          <Badge tone={STATUS_META[order.status].tone}>{STATUS_META[order.status].label}</Badge>
        </div>

        <div className="meta-grid">
          <div><small>开单蹄铁师</small><b>{order.farrier}</b></div>
          <div><small>开单时间</small><b>{order.createdAt}</b></div>
          <div><small>领用时间</small><b>{order.issuedAt ?? "—"}</b></div>
          <div>
            <small>下次复查</small>
            <input
              type="date"
              value={order.nextCheckDate ?? ""}
              onChange={(e) => actions.setNextCheck(order.id, e.target.value || null)}
            />
          </div>
          <div>
            <small>来源 / 修正去向</small>
            <b>
              {linked ? (
                <button className="link-btn" onClick={() => onSelectOrder(linked.id)}>
                  {order.revisionOf ? `修正自 ${order.revisionOf}（旧单留档）` : `已修正为 ${linked.id}`}
                </button>
              ) : (
                "—"
              )}
            </b>
          </div>
        </div>

        {order.archiveReason && <p className="archive-reason">留档原因：{order.archiveReason}</p>}
        <p className="status-desc">{STATUS_META[order.status].desc}</p>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>四蹄测量</p>
            <h2>长宽 · 钉孔距 · 步态分级 · 钉位</h2>
          </div>
        </div>
        <MissingBanner order={order} />
        <div className="hoof-grid">
          {HOOF_IDS.map((id) => (
            <HoofCard key={id} order={order} hoofId={id} shoes={state.shoes} />
          ))}
        </div>
      </section>

      <ActionBar order={order} state={state} onSelectOrder={onSelectOrder} />
      <EventLog order={order} />
    </div>
  );
}

function MissingBanner({ order }: { order: FittingOrder }) {
  const missing = orderMissing(order);
  if (!missing.length) {
    return <p className="banner-ok">四蹄长宽、钉孔距与步态分级已齐，可启动核验。</p>;
  }
  return (
    <div className="banner-bad">
      <b>缺项不得启动：</b>
      {missing.map((x) => (
        <span key={x.hoofId}>{x.hoofId === "LF" ? "左前" : x.hoofId === "RF" ? "右前" : x.hoofId === "LH" ? "左后" : "右后"}：{x.items.join("、")}；</span>
      ))}
    </div>
  );
}

function ActionBar({
  order,
  state,
  onSelectOrder,
}: {
  order: FittingOrder;
  state: AppState;
  onSelectOrder: (id: string) => void;
}) {
  const [reviseReason, setReviseReason] = useState("");

  const runCheck = () => {
    const res = actions.runCheck(order.id);
    if (!res.ok && res.errors.length) {
      window.alert("缺项不得启动：\n" + res.errors.join("\n"));
    }
  };

  const revise = () => {
    const res = actions.reviseOrder(order.id, reviseReason.trim());
    if (!res.ok) window.alert(res.error ?? "无法修正");
    else if (res.id) {
      setReviseReason("");
      onSelectOrder(res.id);
    }
  };

  const counts = new Map<string, { name: string; n: number }>();
  for (const id of HOOF_IDS) {
    const a = order.hooves[id];
    if (!a.shoeId || a.carryOver) continue;
    const sku = state.shoes.find((s) => s.id === a.shoeId);
    if (!sku) continue;
    counts.set(sku.id, { name: sku.name, n: (counts.get(sku.id)?.n ?? 0) + 1 });
  }

  return (
    <section className="panel action-bar">
      <div className="actions">
        {(order.status === "draft" || order.status === "pendingStock" || order.status === "ready") && (
          <button className="primary" onClick={runCheck}>
            启动核验（四蹄全过才待领用）
          </button>
        )}
        {order.status === "ready" && (
          <button className="primary strong" onClick={() => actions.issueOrder(order.id)}>
            领用蹄铁并扣库
          </button>
        )}
        {(order.status === "issued" || order.status === "trial" || order.status === "completed") && (
          <div className="revise-row">
            <input
              placeholder="修正原因，如：右前重测 / 换蹄铁 / 蹄铁停用"
              value={reviseReason}
              onChange={(e) => setReviseReason(e.target.value)}
            />
            <button onClick={revise}>修正测量 / 换蹄铁（旧单留档，不重复扣库）</button>
          </div>
        )}
      </div>

      {order.status === "ready" && counts.size > 0 && (
        <p className="issue-preview">
          领用将扣减：
          {[...counts].map(([id, v]) => (
            <span key={id} className="deduct-chip">{id} ×{v.n}</span>
          ))}
          {HOOF_IDS.every((id) => order.hooves[id].carryOver) && <span>四蹄全部沿用，无需扣库</span>}
        </p>
      )}

      {(order.status === "issued" || order.status === "trial") && (
        <TrialPanel order={order} farriers={state.farriers} />
      )}
    </section>
  );
}

function TrialPanel({ order, farriers }: { order: FittingOrder; farriers: string[] }) {
  const [confirmer, setConfirmer] = useState("");
  const [gait, setGait] = useState(true);
  const [secure, setSecure] = useState(true);
  const [note, setNote] = useState("");

  const submit = () => {
    if (!confirmer.trim()) {
      window.alert("请选择/填写确认蹄铁师");
      return;
    }
    const err = actions.confirmTrial(order.id, confirmer, gait, secure, note);
    if (err) window.alert(err);
    else setNote("");
  };

  return (
    <div className="trial-panel">
      <h3>试装确认（须另一名蹄铁师，连续两次）</h3>
      <div className="confirm-progress">
        {[0, 1].map((i) => (
          <span key={i} className={order.confirmations[i] ? "dot-on" : "dot"}>
            第{i + 1}次{order.confirmations[i] ? `：${order.confirmations[i].confirmer}` : "待确认"}
          </span>
        ))}
      </div>
      {order.confirmations.length > 0 && (
        <ul className="confirm-history">
          {order.confirmations.map((c, i) => (
            <li key={i}>
              {c.at} · {c.confirmer} · 步态{c.gaitStable ? "稳定" : "不稳"} · 蹄铁{c.shoeSecure ? "无松动" : "松动"}
              {c.note ? ` · ${c.note}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="confirm-form">
        <label>
          <span>确认蹄铁师（不可为 {order.farrier}）</span>
          <input list="farrier-list" value={confirmer} onChange={(e) => setConfirmer(e.target.value)} placeholder="选择或输入姓名" />
          <datalist id="farrier-list">
            {farriers.filter((f) => f !== order.farrier).map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label className="check-line">
          <input type="checkbox" checked={gait} onChange={(e) => setGait(e.target.checked)} />
          <span>步态稳定（慢步/快步直线与转弯）</span>
        </label>
        <label className="check-line">
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
          <span>蹄铁无松动、钉位无异常</span>
        </label>
        <label className="note-line">
          <span>备注</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
        </label>
        <button className="primary" onClick={submit}>
          提交确认
        </button>
        <p className="rule-hint">任一项不勾选即判定不通过，连续计数清零，需重新连续两次。</p>
      </div>
    </div>
  );
}

function EventLog({ order }: { order: FittingOrder }) {
  const gaitSummary = HOOF_IDS.map((id) => `${id === "LF" ? "左前" : id === "RF" ? "右前" : id === "LH" ? "左后" : "右后"}${GAIT_LABEL[order.hooves[id].measurement.gaitGrade] === "未评定" ? "未评" : GAIT_LABEL[order.hooves[id].measurement.gaitGrade]}`).join(" · ");
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>流转留痕</p>
          <h2>操作记录</h2>
        </div>
        <span className="gait-summary">{gaitSummary}</span>
      </div>
      <ol className="event-log">
        {order.events.map((e, i) => (
          <li key={i}>
            <time>{e.at}</time>
            <span className={`evt evt-${e.type}`}>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
