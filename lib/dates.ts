const DAY_IN_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "America/Sao_Paulo";

export function getLastSevenDayPeriod(now = new Date()) {
  return { periodStart: new Date(now.getTime() - 7 * DAY_IN_MS), periodEnd: now };
}
export function formatDateTime(date: Date | null | undefined) {
  if (!date) return "Ainda não sincronizado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(date);
}
export function formatDate(date: Date | null | undefined) {
  if (!date) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: TIME_ZONE }).format(date);
}
export function formatRelativeTime(date: Date | null | undefined, now = new Date()) {
  if (!date) return "ainda não sincronizado";
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}
