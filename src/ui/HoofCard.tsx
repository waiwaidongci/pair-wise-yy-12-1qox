import { useMemo, useState } from "react";
import {
  HOOF_LABELS,
  HoofInput,
  HoofIssue,
  HoofKey,
  Shoe,
  HOLE_PATTERNS,
  PATTERN_LABEL,
  NAIL_SIDE_LABEL,
} from "../domain/types";
import {
  isFiniteNum,
  SENSITIVE_MARGIN_MM,
  SIZE_TOLERANCE_MM,
  suggestShoe,
} from "../domain/rules";
import { NumInput } from "./components";

interface Props {
  hoofKey: HoofKey;
  hoof: HoofInput;
  shoes: Shoe[];
  issues: HoofIssue[];
  editable: boolean;
  carried: boolean; // 当前蹄铁为旧单沿用（reused）
  onMeasurement: (
    patch: Partial<Pick<HoofInput, "lengthMm" | "widthMm" | "nailSpacingMm" | "pattern">>
  ) => void;
  onPattern: (pattern: HoofInput["pattern"]) => void;
  onNail: (nailId: string, patch: { fromHeelMm: number | "" }) => void;
  onSelectShoe: (shoeId: string | null) => void;
}

const ISSUE_TONE: Record<string, string> = {
  SHOE_MISSING: "issue-block",
  SHOE_INACTIVE: "issue-block",
  SHOE_EMPTY: "issue-block",
  POSITION_MISMATCH: "issue-block",
  LENGTH_DIFF: "issue-block",
  WIDTH_DIFF: "issue-block",
  SPACING_DIFF: "issue-block",
  PATTERN_MISMATCH: "issue-block",
  NAIL_SENSITIVE: "issue-danger",
};

export function HoofCard({
  hoofKey,
  hoof,
  shoes,
  issues,
  editable,
  carried,
  onMeasurement,
  onPattern,
  onNail,
  onSelectShoe,
}: Props) {
  const [picking, setPicking] = useState(false);
  const suggestion = useMemo(
    () => suggestShoe(hoofKey, hoof, shoes, carried ? hoof.shoeId ?? undefined : undefined),
    [hoofKey, hoof, shoes, carried]
  );

  const selectedShoe = shoes.find((s) => s.id === hoof.shoeId);

  const lengthDiff =
    selectedShoe && isFiniteNum(hoof.lengthMm)
      ? Math.abs(hoof.lengthMm - selectedShoe.lengthMm)
      : null;
  const widthDiff =
    selectedShoe && isFiniteNum(hoof.widthMm)
      ? Math.abs(hoof.widthMm - selectedShoe.widthMm)
      : null;
  const spacingDiff =
    selectedShoe && isFiniteNum(hoof.nailSpacingMm)
      ? Math.abs(hoof.nailSpacingMm - selectedShoe.holeSpacingMm)
      : null;

  return (
    <article
      className={`hoof-card ${issues.length > 0 ? "has-issue" : ""} ${
        carried ? "carried" : ""
      }`}
    >
      <header>
        <h3>{HOOF_LABELS[hoofKey]}</h3>
        <div className="hoof-card-tags">
          {carried ? <span className="tag tag-reuse">沿用已领·不重复扣库</span> : null}
          {issues.length > 0 ? (
            <span className="tag tag-bad">{issues.length} 项不合规</span>
          ) : hoof.shoeId ? (
            <span className="tag tag-ok">校验通过</span>
          ) : null}
        </div>
      </header>

      <div className="hoof-measures">
        <label>
          <span>
            蹄长
            {lengthDiff !== null && (
              <em className={lengthDiff > SIZE_TOLERANCE_MM ? "dim-bad" : "dim-ok"}>
                差 {lengthDiff.toFixed(1)}
              </em>
            )}
          </span>
          <NumInput
            value={hoof.lengthMm}
            disabled={!editable}
            placeholder="如 140"
            invalid={lengthDiff !== null && lengthDiff > SIZE_TOLERANCE_MM}
            onChange={(v) => onMeasurement({ lengthMm: v })}
          />
        </label>
        <label>
          <span>
            蹄宽
            {widthDiff !== null && (
              <em className={widthDiff > SIZE_TOLERANCE_MM ? "dim-bad" : "dim-ok"}>
                差 {widthDiff.toFixed(1)}
              </em>
            )}
          </span>
          <NumInput
            value={hoof.widthMm}
            disabled={!editable}
            placeholder="如 132"
            invalid={widthDiff !== null && widthDiff > SIZE_TOLERANCE_MM}
            onChange={(v) => onMeasurement({ widthMm: v })}
          />
        </label>
        <label>
          <span>
            钉孔距
            {spacingDiff !== null && (
              <em className={spacingDiff > SIZE_TOLERANCE_MM ? "dim-bad" : "dim-ok"}>
                差 {spacingDiff.toFixed(1)}
              </em>
            )}
          </span>
          <NumInput
            value={hoof.nailSpacingMm}
            disabled={!editable}
            placeholder="如 24"
            invalid={spacingDiff !== null && spacingDiff > SIZE_TOLERANCE_MM}
            onChange={(v) => onMeasurement({ nailSpacingMm: v })}
          />
        </label>
        <label>
          <span>钉孔模式</span>
          <select
            value={hoof.pattern}
            disabled={!editable}
            onChange={(e) => onPattern(e.target.value as HoofInput["pattern"])}
          >
            {HOLE_PATTERNS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="nail-editor">
        <div className="nail-editor-title">
          钉位（距蹄踵 mm，&lt;{SENSITIVE_MARGIN_MM}mm 落入蹄底敏感区）
        </div>
        <div className="nail-rows">
          {(["medial", "lateral"] as const).map((side) => (
            <div className="nail-row" key={side}>
              <span className="nail-side">{NAIL_SIDE_LABEL[side]}</span>
              <div className="nail-inputs">
                {hoof.nails
                  .filter((n) => n.side === side)
                  .map((n) => {
                    const sensitive =
                      isFiniteNum(n.fromHeelMm) &&
                      n.fromHeelMm < SENSITIVE_MARGIN_MM;
                    return (
                      <div
                        className={`nail-cell ${sensitive ? "sensitive" : ""}`}
                        key={n.id}
                        title={sensitive ? "落入蹄底敏感区" : undefined}
                      >
                        <NumInput
                          value={n.fromHeelMm}
                          disabled={!editable}
                          suffix=""
                          invalid={sensitive}
                          onChange={(v) => onNail(n.id, { fromHeelMm: v })}
                        />
                        {sensitive ? <span className="warn-dot" /> : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="shoe-pick">
        <div className="shoe-pick-head">
          <span>选配库存蹄铁</span>
          {editable ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => setPicking((v) => !v)}
            >
              {picking ? "收起" : "更换蹄铁"}
            </button>
          ) : null}
        </div>
        <div className="shoe-current">
          {selectedShoe ? (
            <>
              <b>{selectedShoe.sku}</b>
              <span>{selectedShoe.name}</span>
              <span className="muted">
                {selectedShoe.lengthMm}×{selectedShoe.widthMm}mm · 孔距
                {selectedShoe.holeSpacingMm}mm · {PATTERN_LABEL[selectedShoe.pattern]} ·
                库存{selectedShoe.active ? selectedShoe.qty : "已停用"}
              </span>
            </>
          ) : (
            <span className="muted">尚未选配</span>
          )}
        </div>

        {picking && editable ? (
          <div className="shoe-options">
            {suggestion ? (
              <button
                type="button"
                className="shoe-option suggest"
                onClick={() => {
                  onSelectShoe(suggestion.shoe.id);
                  setPicking(false);
                }}
              >
                <b>推荐：{suggestion.shoe.sku}</b>
                <span>
                  {suggestion.shoe.name}（库存 {suggestion.shoe.qty}）
                </span>
                <span className="muted">{suggestion.reasons.join(" · ")}</span>
              </button>
            ) : null}
            {shoes.map((s) => {
              const disabled =
                !s.active ||
                s.qty <= 0 ||
                (s.kind !== "universal" &&
                  s.kind !== (hoofKey.endsWith("F") ? "front" : "hind"));
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`shoe-option ${s.id === hoof.shoeId ? "selected" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    onSelectShoe(s.id);
                    setPicking(false);
                  }}
                  title={disabled ? "停用/无库存/蹄位不符" : undefined}
                >
                  <b>{s.sku}</b>
                  <span>
                    {s.name} · {s.lengthMm}×{s.widthMm}mm ·{" "}
                    {PATTERN_LABEL[s.pattern]}
                  </span>
                  <span className="muted">
                    {s.kind === "front" ? "前蹄" : s.kind === "hind" ? "后蹄" : "通用"} ·
                    库存 {s.qty} {s.active ? "" : "· 已停用"}
                  </span>
                </button>
              );
            })}
            {hoof.shoeId ? (
              <button
                type="button"
                className="shoe-option clear"
                onClick={() => {
                  onSelectShoe(null);
                  setPicking(false);
                }}
              >
                <b>清除选配</b>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {issues.length > 0 ? (
        <ul className="issue-list">
          {issues.map((iss) => (
            <li key={iss.code + iss.message} className={ISSUE_TONE[iss.code]}>
              {iss.message}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
