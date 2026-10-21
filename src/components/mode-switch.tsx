"use client";

export type MatchMode = "ai" | "offline";

export interface Availability {
  aiAvailable: boolean;
  model: string | null;
}

const OPTIONS: { value: MatchMode; label: string }[] = [
  { value: "ai", label: "ใช้ AI" },
  { value: "offline", label: "ไม่ใช้ AI" },
];

/** Header switch between model-backed and rule-based matching. Native radios, styled as a segmented control. */
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
      <fieldset className="inline-flex rounded-lg bg-slate-200/70 p-1">
        <legend className="sr-only">โหมดจับคู่สินค้า</legend>
        {OPTIONS.map((o) => {
          const disabled = o.value === "ai" && aiOff;
          return (
            <label
              key={o.value}
              className={`relative min-h-9 rounded-md px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                value === o.value
                  ? "bg-white text-navy shadow-[0_1px_3px_rgb(15_27_45/0.15)]"
                  : disabled
                    ? "cursor-not-allowed text-slate-500"
                    : "cursor-pointer text-slate-700 hover:text-navy"
              }`}
              title={disabled ? "ตั้งค่า AI_GATEWAY_API_KEY หรือ deploy บน Vercel เพื่อเปิดใช้" : undefined}
            >
              <input
                type="radio"
                name="match-mode"
                value={o.value}
                checked={value === o.value}
                disabled={disabled}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </fieldset>
      <p className="max-w-80 text-xs text-slate-600 sm:text-right" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
