// 纯展示辅助：状态徽标、日期格式化等。业务判断不放在这里。

import { FittingOrder, GaitGrade, OrderStatus, Shoe } from "../domain/types";
import { daysUntil } from "../domain/rules";

export const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: "draft" | "pending" | "trial" | "done" | "archive" }
> = {
  draft: { label: "测量中", tone: "draft" },
  pending_material: { label: "待备料", tone: "pending" },
  awaiting_trial: { label: "待试装复核", tone: "trial" },
  completed: { label: "已完成", tone: "done" },
  archived: { label: "已归档", tone: "archive" },
};

export const GAIT_TONE: Record<Exclude<GaitGrade, "">, string> = {
  normal: "gait-normal",
  mild: "gait-mild",
  moderate: "gait-moderate",
  severe: "gait-severe",
};

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function reviewLabel(date: string): { text: string; tone: string } | null {
  const d = daysUntil(date);
  if (d === null) return null;
  if (d < 0) return { text: `复查逾期 ${-d} 天`, tone: "review-overdue" };
  if (d === 0) return { text: "今日复查", tone: "review-today" };
  if (d <= 3) return { text: `${d} 天后复查`, tone: "review-soon" };
  return { text: `${d} 天后复查`, tone: "review-ok" };
}

export function shoeBrief(shoe: Shoe | undefined): string {
  if (!shoe) return "未选配";
  const kind =
    shoe.kind === "front" ? "前蹄" : shoe.kind === "hind" ? "后蹄" : "通用";
  return `${shoe.sku} · ${shoe.name}（${kind} ${shoe.lengthMm}×${shoe.widthMm}mm）`;
}

export function orderTitle(order: FittingOrder): string {
  return order.horseName
    ? `${order.horseCode} · ${order.horseName}`
    : order.horseCode;
}
