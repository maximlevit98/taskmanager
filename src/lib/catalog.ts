export const platforms = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "telegram", label: "Telegram" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
  { id: "vk", label: "VK" },
  { id: "linkedin", label: "LinkedIn" },
] as const;

export const contentTypes = [
  { id: "reels", label: "Reels", platform: "instagram" },
  { id: "ig-post", label: "публикация Instagram", platform: "instagram" },
  { id: "ig-story", label: "сторис Instagram", platform: "instagram" },
  { id: "shorts", label: "Shorts", platform: "youtube" },
  { id: "yt-video", label: "ролик YouTube", platform: "youtube" },
  { id: "tt-video", label: "ролик TikTok", platform: "tiktok" },
  { id: "tg-post", label: "пост Telegram", platform: "telegram" },
  { id: "vk-post", label: "пост VK", platform: "vk" },
  { id: "vk-carousel", label: "карусель VK", platform: "vk" },
  { id: "fb-post", label: "пост Facebook", platform: "facebook" },
  { id: "li-post", label: "пост LinkedIn", platform: "linkedin" },
  { id: "x-post", label: "пост X", platform: "x" },
] as const;

export const tones = [
  { id: "sand", label: "песочный", swatch: "#f3ecdf" },
  { id: "mint", label: "зелёный", swatch: "#dceee4" },
  { id: "blue", label: "голубой", swatch: "#d9e6f6" },
  { id: "pink", label: "розовый", swatch: "#f6e0dc" },
  { id: "peach", label: "тёплый", swatch: "#f6e7d4" },
  { id: "brown", label: "картинка", swatch: "#3c2e28" },
] as const;

export type ToneId = (typeof tones)[number]["id"];
export type PlatformId = (typeof platforms)[number]["id"];
export type ContentTypeId = (typeof contentTypes)[number]["id"];

export function platformLabel(id: string | null | undefined) {
  return platforms.find((item) => item.id === id)?.label ?? id ?? "";
}

export function typeLabel(id: string | null | undefined) {
  return contentTypes.find((item) => item.id === id)?.label ?? id ?? "";
}

export function toneLabel(id: string | null | undefined) {
  const tone = tones.find((item) => item.id === id);
  return tone ? `фон ${tone.label}` : "";
}

export function isPlatform(value: string): value is PlatformId {
  return platforms.some((item) => item.id === value);
}

export function isContentType(value: string): value is ContentTypeId {
  return contentTypes.some((item) => item.id === value);
}

export function isTone(value: string): value is ToneId {
  return tones.some((item) => item.id === value);
}

export function personColor(name: string) {
  const colors = ["#e07a3d", "#3b82c4", "#7c5cbf", "#2f9e6b", "#d15b6a", "#c48a2a"];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

export function initial(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

export type Chip = { label: string; kind: "yes" | "work" | "fix" | "fail" | "wait" | "out" };

export function chipFor(unit: {
  outcome: string | null;
  status: string;
  gate: string;
}): Chip {
  if (unit.outcome === "failed" || unit.status === "failed") return { label: "не вышло", kind: "fail" };
  if (unit.outcome === "out" || unit.status === "out") return { label: "вышло", kind: "out" };
  if (unit.status === "fixes" || unit.gate === "returned") return { label: "правки", kind: "fix" };
  if (unit.gate === "yes") return { label: "Да", kind: "yes" };
  if (unit.gate === "pending") return { label: "без да", kind: "wait" };
  if (unit.status === "idea") return { label: "идея", kind: "wait" };
  return { label: "в работе", kind: "work" };
}
