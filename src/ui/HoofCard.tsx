import type { FittingOrder, HoofId, ShoeSku } from "../domain/types";
import {
  fmtSigned,
  GAIT_GRADES,
  HOOF_META,
  SIZE_TOLERANCE_MM,
} from "../domain/rules";
import { actions } from "../state/store";
import { Badge, NumInput } from "./widgets";

const EDITABLE: FittingOrder["status"][] = ["draft", "pendingStock", "ready"];

function suggestedShoe(order: FittingOrder, hoofId: HoofId, shoes: ShoeSku[]): ShoeSku | null {
  const m = order.hooves[hoofId].measurement;
  if (m.lengthMm == null || m.widthMm == null) return null;
  const meta = HOOF_META[hoofId];
  let best: ShoeSku | null = null;
  let bestScore = Infinity;
  for (const s of shoes) {
    if (!s.active || s.quantity <= 0) continue;
    if (s.shape !== "universal" && s.shape !== meta.side) continue;
    const dl = s.lengthMm - m.lengthMm;
    const dw = s.widthMm - m.widthMm;
    const score = Math.abs(dl) + Math.abs(dw);
    if (Math.abs(dl) <= SIZE_TOLERANCE_MM && Math.abs(dw) <= SIZE_TOLERANCE_MM && score < bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

export function HoofCard({
  order,
  hoofId,
  shoes,
}: {
  order: FittingOrder;
  hoofId: HoofId;
  shoes: ShoeSku[];
}) {
  const a = order.hooves[hoofId];
  const m = a.measurement;
  const meta = HOOF_META[hoofId];
  const editable = EDITABLE.includes(order.status);
  const selected = shoes.find((s) => s.id === a.shoeId) ?? null;
  const suggestion = suggestedShoe(order, hoofId, shoes);
  const check = a.check;
  const isRevision = order.revisionOf != null;

  return (
    <article className={`hoof-card ${check ? (check.pass ? "pass" : "fail") : ""}`}>
      <header className="hoof-head">
        <div>
          <h4>{meta.label}</h4>
          <small>{meta.lr === "left" ? "左侧" : "右侧"} · {meta.side === "front" ? "前蹄形" : "后蹄形"}</small>
        </div>
        {check ? (
          check.pass ? <Badge tone="ok">核验通过</Badge> : <Badge tone="bad">核验不过</Badge>
        ) : (
          <Badge tone="neutral">未核验</Badge>
        )}
      </header>

      <div className="measure-grid">
        <label>
          <span>长（mm）</span>
          <NumInput value={m.lengthMm} disabled={!editable} onChange={(v) => actions.setMeasurement(order.id, hoofId, "lengthMm", v)} />
        </label>
        <label>
          <span>宽（mm）</span>
          <NumInput value={m.widthMm} disabled={!editable} onChange={(v) => actions.setMeasurement(order.id, hoofId, "widthMm", v)} />
        </label>
        <label>
          <span>钉孔距（mm）</span>
          <NumInput step={0.5} value={m.nailSpacingMm} disabled={!editable} onChange={(v) => actions.setMeasurement(order.id, hoofId, "nailSpacingMm", v)} />
        </label>
        <label>
          <span>步态分级</span>
          <select
            className={m.gaitGrade ? "" : "select-missing"}
            disabled={!editable}
            value={m.gaitGrade}
            onChange={(e) => actions.setGait(order.id, hoofId, e.target.value as typeof m.gaitGrade)}
          >
            <option value="">未评定（缺项）</option>
            {GAIT_GRADES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="shoe-pick">
        <span>
          选配库存蹄铁
          {suggestion && suggestion.id !== a.shoeId && (
            <button
              type="button"
              className="link-btn"
              disabled={!editable}
              onClick={() => actions.pickShoe(order.id, hoofId, suggestion.id)}
            >
              推荐：{suggestion.id}（{suggestion.lengthMm}×{suggestion.widthMm}）
            </button>
          )}
        </span>
        <select
          disabled={!editable}
          value={a.shoeId ?? ""}
          onChange={(e) => actions.pickShoe(order.id, hoofId, e.target.value)}
        >
          <option value="">未选配</option>
          {shoes.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.active && !a.carryOver}>
              {s.id} · {s.name}（{s.lengthMm}×{s.widthMm}，{s.holeCount}孔/距{s.nailSpacingMm}，库存{s.quantity}
              {s.active ? "" : "，已停用"}）
            </option>
          ))}
        </select>
      </label>

      {isRevision && (
        <label className="carry-row">
          <input
            type="checkbox"
            checked={a.carryOver}
            disabled={!editable}
            onChange={(e) => actions.toggleCarry(order.id, hoofId, e.target.checked)}
          />
          <span>
            沿用上一单蹄铁，领用不扣库
            {a.carryOver && selected ? <em>（沿用 {selected.id}）</em> : <em className="warn">（换蹄铁：领用时扣库）</em>}
          </span>
        </label>
      )}

      {selected && a.nails.length > 0 && (
        <div className="nail-table-wrap">
          <table className="nail-table">
            <thead>
              <tr>
                <th>钉位</th>
                <th>角度°</th>
                <th>入壁 mm</th>
                <th>敏感区</th>
              </tr>
            </thead>
            <tbody>
              {a.nails.map((n, i) => {
                const hit = check?.sensitiveHits.includes(n.id);
                return (
                  <tr key={n.id} className={hit ? "row-hit" : ""}>
                    <td>{i + 1}</td>
                    <td>
                      <NumInput
                        step={0.5}
                        value={n.angleDeg}
                        disabled={!editable}
                        onChange={(v) => actions.updateNail(order.id, hoofId, n.id, "angleDeg", v)}
                      />
                    </td>
                    <td>
                      <NumInput
                        step={0.5}
                        value={n.insetMm}
                        disabled={!editable}
                        invalid={!!hit}
                        onChange={(v) => actions.updateNail(order.id, hoofId, n.id, "insetMm", v)}
                      />
                    </td>
                    <td>{hit ? <Badge tone="bad">落入</Badge> : <Badge tone="ok">安全</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {check && !check.pass && (
        <ul className="reason-list">
          {check.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {check?.pass && check.lengthDelta != null && (
        <p className="deltas">
          尺寸差：长 {fmtSigned(check.lengthDelta)}mm · 宽 {fmtSigned(check.widthDelta ?? 0)}mm · 孔距 {fmtSigned(check.spacingDelta ?? 0)}mm（容差 {SIZE_TOLERANCE_MM}mm）
        </p>
      )}
    </article>
  );
}
