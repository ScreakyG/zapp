/** 24-hour "20:45", as written everywhere in the UI. */
export function formatTime(time: number | Date): string {
  const d = new Date(time);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
