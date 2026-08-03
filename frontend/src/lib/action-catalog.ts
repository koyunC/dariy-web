export const checkInActions = [
  { id: "miss_you", icon: "💌", label: "想你" },
  { id: "early_up", icon: "☀️", label: "早起" },
  { id: "early_sleep", icon: "🌙", label: "早睡" },
  { id: "exercise", icon: "💪", label: "運動" },
  { id: "study", icon: "📚", label: "認真" },
  { id: "cook", icon: "🍳", label: "煮飯" },
  { id: "weight", icon: "⚖️", label: "體重" },
  { id: "snap", icon: "💤", label: "小休" },
  { id: "snack", icon: "🍜", label: "宵夜" },
] as const;

export type CheckInActionId = (typeof checkInActions)[number]["id"];
