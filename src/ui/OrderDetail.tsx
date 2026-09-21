import { useMemo, useState } from "react";
import {
  Confirmation,
  FittingOrder,
  Farrier,
  GAIT_GRADE_OPTIONS,
  HOOF_KEYS,
  HOOF_LABELS,
  PATTERN_LABEL,
  Shoe,
} from "../domain/types";
import {
  blockingIssues,
  findMissingFields,
  isOpenStatus,
  nailCountWarnings,
  REQUIRED_PASSES,
  trailingPasses,
  validConfirmers,
  type OrderIssues,
} from "../domain/rules";
import { Badge, EmptyHint } from "./components";
import { HoofCard } from "./HoofCard";
import {
  formatDateTime,
  GAIT_TONE,
  reviewLabel,
  shoeBrief,
  STATUS_META,
} from "./format";
import { store } from "../state/store";

interface Props {
  order: FittingOrder;
  shoes: Shoe[];
  farriers: Farrier[];
  issues: OrderIssues;
  onClose: () => void;
  onToast: (msg: string, ok: boolean) => void;
  onOpenOrder: (id: string) => void;
}

export function OrderDetail({
  order,
  shoes,
  farriers,
  issues,
  onClose,
  onToast,
  onOpenOrder,
}: Props) {
  const farrier = farriers.find((f) => f.id === order.farrierId);
  const editable = isOpenStatus(order.status);
  const open = isOpenStatus(order.status);
  const missing = useMemo(
    () => (open ? findMissingFields(order) : []),
    [order, open]
  );
  const warnings = useMemo(() => nailCountWarnings(order), [order]);
  const allBlocking = useMemo(() => blockingIssues(issues), [issues]);
  const passes = trailingPasses(order.confirmations);
  const confirmers = validConfirmers(order, farriers);

  const [confirmerId, setConfirmerId] = useState(confirmers[0]?.id ?? "");
  const [gaitStable, setGaitStable] = useState(true);
  const [shoeSecure, setShoeSecure] = useState(true);
  const [reviseReason, setReviseReason] = useState("");
  const [showRevise, setShowRevise] = useState(false);

  const call = (fn: () => { ok: boolean; message?: string; orderId?: string }) => {
    const r = fn();
    onToast(r.message ?? (r.ok ? "操作成功" : "操作失败"), r.ok);
    return r;
  };

  const review = reviewLabel(order.nextReviewDate);
  const supersededOrder = order.supersedes
    ? { id: order.supersedes }
    : null;
  const successor = order.supersededBy
    ? { id: order.supersededBy }
    : null;

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="detail-head">
          <div>
            <p className="eyebrow">
              适配单 {order.id}
              {order.supersedes ? " · 修正重新适配单" : ""}
            </p>
            <h2>
              {order.horseCode}
              {order.horseName ? ` · ${order.horseName}` : ""}
            </h2>
            <div className="detail-badges">
              <Badge tone={`status-${STATUS_META[order.status].tone}`}>
                {STATUS_META[order.status].label}
              </Badge>
              {order.gaitGrade ? (
                <Badge tone={GAIT_TONE[order.gaitGrade]}>
                  {
                    GAIT_GRADE_OPTIONS.find((g) => g.value === order.gaitGrade)
                      ?.label
                  }
                </Badge>
              ) : (
                <Badge tone="gait-empty">步态未分级</Badge>
              )}
              {review ? <Badge tone={review.tone}>{review.text}</Badge> : null}
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="detail-body">
          {/* —— 头部字段 —— */}
          <section className="detail-section">
            <h3>基础信息</h3>
            <div className="meta-grid">
              <label>
                <span>马匹编号（每马仅一张未结束单）</span>
                <input
                  value={order.horseCode}
                  disabled={!editable}
                  onChange={(e) =>
                    call(() =>
                      store.updateOrderMeta(order.id, { horseCode: e.target.value })
                    )
                  }
                />
              </label>
              <label>
                <span>马名</span>
                <input
                  value={order.horseName}
                  disabled={!editable}
                  onChange={(e) =>
                    store.updateOrderMeta(order.id, { horseName: e.target.value })
                  }
                />
              </label>
              <label>
                <span>装蹄蹄铁师（主蹄铁师）</span>
                <select
                  value={order.farrierId}
                  disabled={!editable}
                  onChange={(e) =>
                    call(() =>
                      store.updateOrderMeta(order.id, { farrierId: e.target.value })
                    )
                  }
                >
                  <option value="">请选择</option>
                  {farriers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>步态分级（缺项不得启动）</span>
                <select
                  value={order.gaitGrade}
                  disabled={!editable}
                  onChange={(e) =>
                    call(() =>
                      store.updateOrderMeta(order.id, {
                        gaitGrade: e.target.value as FittingOrder["gaitGrade"],
                      })
                    )
                  }
                >
                  <option value="">请选择分级</option>
                  {GAIT_GRADE_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>下次复查日期</span>
                <input
                  type="date"
                  value={order.nextReviewDate}
                  disabled={!editable}
                  onChange={(e) =>
                    store.updateOrderMeta(order.id, {
                      nextReviewDate: e.target.value,
                    })
                  }
                />
              </label>
              <label className="span-2">
                <span>步态问题备注</span>
                <input
                  value={order.gaitNote}
                  disabled={!editable}
                  placeholder="记录跛行、磨耗、代偿等"
                  onChange={(e) =>
                    store.updateOrderMeta(order.id, { gaitNote: e.target.value })
                  }
                />
              </label>
              <label className="span-2">
                <span>照片备注</span>
                <input
                  value={order.photoNote}
                  disabled={!editable}
                  placeholder="如：试装俯拍 2 张已归档"
                  onChange={(e) =>
                    store.updateOrderMeta(order.id, { photoNote: e.target.value })
                  }
                />
              </label>
            </div>
          </section>

          {/* —— 四蹄测量与选配 —— */}
          <section className="detail-section">
            <div className="section-row">
              <h3>四蹄测量与蹄铁选配</h3>
              <span className="muted">
                任一蹄尺寸差 &gt; 2mm、钉孔模式不符或钉位落入蹄底敏感区，整单停在待备料
              </span>
            </div>

            {missing.length > 0 ? (
              <div className="missing-box">
                <b>缺项（不得启动校验，共 {missing.length} 项）：</b>
                <span>
                  {missing
                    .slice(0, 12)
                    .map((m) => `${m.scope}·${m.field}`)
                    .join("、")}
                  {missing.length > 12 ? " …" : ""}
                </span>
              </div>
            ) : null}

            {warnings.length > 0 ? (
              <div className="warn-box">
                {warnings.map((w) => (
                  <span key={w}>⚠️ {w}</span>
                ))}
              </div>
            ) : null}

            {allBlocking.length > 0 ? (
              <div className="blocking-summary">
                <b>整单受阻 · 库存不扣减（{allBlocking.length} 项）：</b>
                <ul>
                  {allBlocking.slice(0, 6).map((iss, i) => (
                    <li key={i}>{iss.message}</li>
                  ))}
                  {allBlocking.length > 6 ? (
                    <li>… 其余见各蹄卡片</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <div className="hoof-grid">
              {HOOF_KEYS.map((key) => {
                const carried = order.carriedDeductions.some(
                  (d) => d.hoofKey === key
                );
                return (
                  <HoofCard
                    key={key}
                    hoofKey={key}
                    hoof={order.hooves[key]}
                    shoes={shoes}
                    issues={issues[key] ?? []}
                    editable={editable}
                    carried={carried}
                    onMeasurement={(patch) =>
                      call(() =>
                        store.updateHoofMeasurement(
                          order.id,
                          key,
                          patch,
                          farrier?.id
                        )
                      )
                    }
                    onPattern={(pattern) =>
                      call(() => store.changePattern(order.id, key, pattern))
                    }
                    onNail={(nailId, patch) =>
                      call(() =>
                        store.updateNail(
                          order.id,
                          key,
                          nailId,
                          patch,
                          farrier?.id
                        )
                      )
                    }
                    onSelectShoe={(shoeId) =>
                      call(() =>
                        store.selectShoe(order.id, key, shoeId, farrier?.id)
                      )
                    }
                  />
                );
              })}
            </div>

            {/* 四蹄对比表 */}
            <div className="compare-wrap">
              <h4>左右前后蹄对比</h4>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>项目</th>
                    {HOOF_KEYS.map((k) => (
                      <th key={k}>{HOOF_LABELS[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>蹄长 / 蹄宽 (mm)</td>
                    {HOOF_KEYS.map((k) => (
                      <td key={k}>
                        {fmt(order.hooves[k].lengthMm)} /{" "}
                        {fmt(order.hooves[k].widthMm)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>钉孔距 / 模式</td>
                    {HOOF_KEYS.map((k) => (
                      <td key={k}>
                        {fmt(order.hooves[k].nailSpacingMm)} ·{" "}
                        {PATTERN_LABEL[order.hooves[k].pattern]}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>选配蹄铁</td>
                    {HOOF_KEYS.map((k) => (
                      <td key={k}>
                        {shoeBrief(shoes.find((s) => s.id === order.hooves[k].shoeId))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>校验</td>
                    {HOOF_KEYS.map((k) => (
                      <td key={k}>
                        {(issues[k] ?? []).length > 0 ? (
                          <Badge tone="status-pending">
                            {(issues[k] ?? []).length} 项问题
                          </Badge>
                        ) : order.hooves[k].shoeId ? (
                          <Badge tone="status-done">通过</Badge>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* —— 阶段动作 —— */}
          <section className="detail-section">
            <h3>流程动作</h3>

            {order.status === "draft" ? (
              <div className="action-row">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const r = call(() =>
                      store.startOrder(order.id, farrier?.id)
                    );
                    if (!r.ok) return;
                  }}
                >
                  提交测量并启动适配校验
                </button>
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => {
                    if (confirm("确定删除这张测量草稿？")) {
                      const r = call(() => store.deleteDraft(order.id));
                      if (r.ok) onClose();
                    }
                  }}
                >
                  删除草稿
                </button>
                <span className="muted">
                  四蹄长宽、钉孔距、全部钉位与步态分级填齐后才能启动
                </span>
              </div>
            ) : null}

            {order.status === "pending_material" ? (
              <div className="action-row">
                <button
                  type="button"
                  className="primary"
                  onClick={() => call(() => store.startOrder(order.id, farrier?.id))}
                >
                  重新校验并备料
                </button>
                <span className="muted">
                  修正测量或改配合规蹄铁后，四蹄全部通过才扣库进入试装
                </span>
              </div>
            ) : null}

            {order.status === "awaiting_trial" ? (
              <div className="trial-zone">
                <div className="trial-step">
                  <Badge tone={order.trialFittedAt ? "status-done" : "status-trial"}>
                    1. 试装
                  </Badge>
                  {order.trialFittedAt ? (
                    <span>
                      已于 {formatDateTime(order.trialFittedAt)} 完成试装
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => call(() => store.markTrial(order.id, farrier?.id))}
                    >
                      标记试装完成
                    </button>
                  )}
                </div>

                <div className="trial-step">
                  <Badge tone={passes >= REQUIRED_PASSES ? "status-done" : "status-trial"}>
                    2. 另一名蹄铁师连续 {REQUIRED_PASSES} 次确认
                  </Badge>
                  <div className="confirm-dots">
                    {Array.from({ length: REQUIRED_PASSES }).map((_, i) => (
                      <span
                        key={i}
                        className={`confirm-dot ${i < passes ? "on" : ""}`}
                      >
                        第 {i + 1} 次
                      </span>
                    ))}
                  </div>
                </div>

                <div className="confirm-form">
                  <label>
                    <span>复核蹄铁师（须与装蹄人不同）</span>
                    <select
                      value={confirmerId}
                      onChange={(e) => setConfirmerId(e.target.value)}
                    >
                      {confirmers.length === 0 ? (
                        <option value="">无可用蹄铁师</option>
                      ) : null}
                      {confirmers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={gaitStable}
                      onChange={(e) => setGaitStable(e.target.checked)}
                    />
                    <span>步态稳定</span>
                  </label>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={shoeSecure}
                      onChange={(e) => setShoeSecure(e.target.checked)}
                    />
                    <span>蹄铁无松动</span>
                  </label>
                  <button
                    type="button"
                    className="primary"
                    disabled={!order.trialFittedAt}
                    onClick={() =>
                      call(() =>
                        store.submitConfirmation(
                          order.id,
                          confirmerId,
                          gaitStable,
                          shoeSecure
                        )
                      )
                    }
                  >
                    提交确认
                  </button>
                </div>
                <p className="muted">
                  任一项不通过即判定失败，连续通过计数清零；修正测量或换蹄铁也会使结论失效。
                </p>
              </div>
            ) : null}

            {order.status === "completed" ? (
              <div className="action-row">
                {!showRevise ? (
                  <button
                    type="button"
                    onClick={() => setShowRevise(true)}
                  >
                    修正测量 / 换蹄铁后重新适配
                  </button>
                ) : (
                  <div className="revise-box">
                    <p>
                      本单将作为历史档案保留（只读），系统新建一张同马匹适配单；已领蹄铁沿用，
                      <b>库存不重复扣减</b>，需重新试装并由另一名蹄铁师连续两次确认。
                    </p>
                    <input
                      placeholder="修正原因（如：复查发现蹄长测量偏差）"
                      value={reviseReason}
                      onChange={(e) => setReviseReason(e.target.value)}
                    />
                    <div className="action-row">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          const r = call(() =>
                            store.reviseCompleted(
                              order.id,
                              farriers[0]?.id ?? "",
                              reviseReason
                            )
                          );
                          if (r.ok && r.orderId) {
                            setShowRevise(false);
                            onOpenOrder(r.orderId);
                          }
                        }}
                      >
                        确认修正并创建新单
                      </button>
                      <button type="button" onClick={() => setShowRevise(false)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
                <span className="muted">
                  完成于 {formatDateTime(order.completedAt)}
                </span>
              </div>
            ) : null}

            {order.status === "archived" ? (
              <div className="action-row">
                <Badge tone="status-archive">旧单留档只读</Badge>
                <span className="muted">
                  归档于 {formatDateTime(order.archivedAt)}
                  {successor ? "，已被新单取代" : ""}
                </span>
                {successor ? (
                  <button type="button" onClick={() => onOpenOrder(successor.id)}>
                    查看取代它的新适配单
                  </button>
                ) : null}
              </div>
            ) : null}

            {supersededOrder ? (
              <div className="reuse-note">
                本单沿用旧单（{supersededOrder.id}）已领{" "}
                {order.carriedDeductions.length} 只蹄铁，来源标记为 reused，
                <b>不重复扣库</b>。
                <button type="button" onClick={() => onOpenOrder(supersededOrder.id)}>
                  查看旧单档案
                </button>
              </div>
            ) : null}
          </section>

          {/* —— 领用与确认记录 —— */}
          <section className="detail-section two-col">
            <div>
              <h3>蹄铁领用台账</h3>
              <LedgerTable order={order} shoes={shoes} />
            </div>
            <div>
              <h3>复核确认记录</h3>
              {order.confirmations.length === 0 ? (
                <EmptyHint>暂无复核记录</EmptyHint>
              ) : (
                <ul className="confirm-list">
                  {order.confirmations.map((c: Confirmation) => {
                    const name =
                      farriers.find((f) => f.id === c.confirmerId)?.name ??
                      c.confirmerId;
                    const pass = c.gaitStable && c.shoeSecure;
                    return (
                      <li key={c.id} className={pass ? "pass" : "fail"}>
                        <div>
                          <b>{name}</b>
                          <span className="muted">{formatDateTime(c.at)}</span>
                        </div>
                        <span>
                          步态{c.gaitStable ? "稳定" : "不稳"} · 蹄铁
                          {c.shoeSecure ? "无松动" : "有松动"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* —— 时间线（蹄铁更换历史） —— */}
          <section className="detail-section">
            <h3>操作时间线 · 蹄铁更换历史</h3>
            <ol className="timeline">
              {[...order.events].reverse().map((ev, i) => (
                <li key={i} className={`ev ev-${ev.type}`}>
                  <span className="ev-time">{formatDateTime(ev.at)}</span>
                  <span className="ev-text">{ev.text}</span>
                  {ev.by ? (
                    <span className="ev-by">
                      {farriers.find((f) => f.id === ev.by)?.name ?? ev.by}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function fmt(v: number | ""): string {
  return v === "" ? "—" : String(v);
}

function LedgerTable({ order, shoes }: { order: FittingOrder; shoes: Shoe[] }) {
  const rows = [
    ...order.carriedDeductions.map((d) => ({ ...d, carried: true })),
    ...order.deductions.map((d) => ({ ...d, carried: false })),
  ];
  if (rows.length === 0)
    return <EmptyHint>尚未领用蹄铁（待备料阶段库存不扣减）</EmptyHint>;
  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th>蹄位</th>
          <th>蹄铁</th>
          <th>来源</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const shoe = shoes.find((s) => s.id === d.shoeId);
          return (
            <tr key={d.id}>
              <td>{HOOF_LABELS[d.hoofKey]}</td>
              <td>{shoe ? `${shoe.sku} · ${shoe.name}` : d.shoeId}</td>
              <td>
                {d.carried || d.source === "reused" ? (
                  <Badge tone="tag-reuse">reused 沿用·未扣库</Badge>
                ) : (
                  <Badge tone="tag-issued">issued 已扣库</Badge>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
