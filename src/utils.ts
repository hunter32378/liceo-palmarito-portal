/**
 * Utility functions for parsing due dates and calculating remaining time.
 */

export function parseDateString(str: string): Date | null {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  
  // 1. Try standard JS parsing first
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  
  // 2. Try matching DD/MM/YYYY or DD-MM-YYYY
  const dmYRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const matchDmy = s.match(dmYRegex);
  if (matchDmy) {
    const day = parseInt(matchDmy[1], 10);
    const month = parseInt(matchDmy[2], 10) - 1;
    const year = parseInt(matchDmy[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Try matching DD/MM or DD-MM
  const dmRegex = /^(\d{1,2})[\/\-](\d{1,2})$/;
  const matchDm = s.match(dmRegex);
  if (matchDm) {
    const day = parseInt(matchDm[1], 10);
    const month = parseInt(matchDm[2], 10) - 1;
    const year = new Date().getFullYear();
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. Try matching formats containing Spanish months like "5 de Junio" or "Lunes 5 de Junio" or "30 de mayo"
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const monthsAbbr = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  
  let day: number | null = null;
  let monthIndex: number | null = null;
  let year: number = 2026; // Align with current calendar year 2026 as per local time info

  // Capture days: look for 1 or 2 digits
  const dayMatch = s.match(/\b(\d{1,2})\b/);
  if (dayMatch) {
    day = parseInt(dayMatch[1], 10);
  }

  // Capture years: look for 4 digits starting with 20
  const yearMatch = s.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Find month index
  for (let i = 0; i < months.length; i++) {
    if (s.includes(months[i]) || s.includes(monthsAbbr[i])) {
      monthIndex = i;
      break;
    }
  }

  if (day !== null && monthIndex !== null) {
    const d = new Date(year, monthIndex, day);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

export interface CountdownInfo {
  days: number;
  text: string;
  badgeStyle: string;
}

export function getDaysUntil(dueDateString: string): CountdownInfo | null {
  if (!dueDateString) return null;
  const targetDate = parseDateString(dueDateString);
  if (!targetDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetMidnight = new Date(targetDate.getTime());
  targetMidnight.setHours(0, 0, 0, 0);

  const diffTime = targetMidnight.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Determine styling and display text
  if (diffDays < 0) {
    return {
      days: diffDays,
      text: `Vencida hace ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'día' : 'días'}`,
      badgeStyle: "bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-800"
    };
  } else if (diffDays === 0) {
    return {
      days: 0,
      text: "Vence hoy ⏳",
      badgeStyle: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400 border border-rose-500/20"
    };
  } else if (diffDays === 1) {
    return {
      days: 1,
      text: "Vence mañana ⏳",
      badgeStyle: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400 border border-rose-500/20"
    };
  } else if (diffDays <= 7) {
    return {
      days: diffDays,
      text: `Queda${diffDays === 1 ? '' : 'n'} ${diffDays} día${diffDays === 1 ? '' : 's'} ⏳`,
      badgeStyle: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400 border border-amber-500/20"
    };
  }

  return null;
}
