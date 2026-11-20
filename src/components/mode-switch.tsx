"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";

export type MatchMode = "ai" | "offline";

export interface Availability {
  aiAvailable: boolean;
  model: string | null;
}

/** Header switch between model-backed and rule-based matching. */
export function ModeSwitch({
  value,
  onChange,
  availability,
}: {
  value: MatchMode;
  onChange: (mode: MatchMode) => void;
  availability: Availability | null;
}) {
  const aiOff = availability !== null && !availability.aiAvailable;
  const hint =
    value === "ai"
      ? `AI อ่านข้อความแล้วเลือกจากรายการที่ค้นได้ · ${availability?.model ?? "…"} · ไม่ส่งราคาให้ AI`
      : aiOff
        ? "เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่า AI Gateway · จับคู่ด้วยกฎในระบบแทน"
        : "จับคู่ด้วยกฎ: ตัดคำไทย + ชื่อเรียกอื่น + เทียบตัวสะกดและขนาด · ไม่มีค่าใช้จ่าย";

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <SegmentedControl
        aria-label="โหมดจับคู่สินค้า"
        value={value}
        onValueChange={(next) => onChange(next as MatchMode)}
        options={[
          {
            value: "ai",
            label: "ใช้ AI",
            disabled: aiOff,
            title: aiOff ? "ตั้งค่า AI_GATEWAY_API_KEY หรือ deploy บน Vercel เพื่อเปิดใช้" : undefined,
          },
          { value: "offline", label: "ไม่ใช้ AI" },
        ]}
      />
      <p className="max-w-80 text-xs text-muted-foreground sm:text-right" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
