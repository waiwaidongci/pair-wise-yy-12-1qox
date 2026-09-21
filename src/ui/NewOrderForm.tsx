import { useState } from "react";
import { actions } from "../state/store";
import { todayISO } from "../domain/rules";

export function NewOrderForm({
  farriers,
  onClose,
  onCreated,
}: {
  farriers: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [horseId, setHorseId] = useState("");
  const [horseName, setHorseName] = useState("");
  const [farrier, setFarrier] = useState(farriers[0] ?? "");
  const [nextCheckDate, setNextCheckDate] = useState("");

  const submit = () => {
    const res = actions.createOrder({
      horseId,
      horseName,
      farrier,
      nextCheckDate: nextCheckDate || null,
    });
    if (!res.ok) {
      window.alert(res.error);
      return;
    }
    onCreated(res.id!);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>新建</p>
            <h2>四蹄适配单</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>
        <p className="rule-hint">
          每匹马仅允许一张未结束适配单。开单后须补齐四蹄长宽、钉孔距与步态分级才能启动核验。
        </p>
        <div className="modal-form">
          <label>
            <span>马匹编号 *</span>
            <input autoFocus placeholder="如 HORSE-52" value={horseId} onChange={(e) => setHorseId(e.target.value)} />
          </label>
          <label>
            <span>马匹名称</span>
            <input placeholder="可选" value={horseName} onChange={(e) => setHorseName(e.target.value)} />
          </label>
          <label>
            <span>开单蹄铁师 *</span>
            <select value={farrier} onChange={(e) => setFarrier(e.target.value)}>
              {farriers.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            <span>计划复查日期</span>
            <input type="date" min={todayISO()} value={nextCheckDate} onChange={(e) => setNextCheckDate(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={submit}>创建适配单</button>
        </div>
      </div>
    </div>
  );
}
