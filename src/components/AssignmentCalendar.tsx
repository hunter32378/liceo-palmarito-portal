/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from "react";
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, 
  Send, AlertCircle, FileText, ArrowRight, HelpCircle, Inbox
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { parseDateString, getDaysUntil } from "../utils";

interface Assignment {
  id: string;
  title: string;
  description: string;
  section: "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado" | "TODOS";
  createdAt: string;
  dueDate?: string;
  attachmentLink?: string;
  attachmentName?: string;
}

interface AssignmentCalendarProps {
  assignments: Assignment[];
  selectedGradeFilter: string;
  onSelectAssignmentForSubmit: (assignmentId: string, assignmentTitle: string, section: string) => void;
}

export default function AssignmentCalendar({
  assignments,
  selectedGradeFilter,
  onSelectAssignmentForSubmit
}: AssignmentCalendarProps) {
  // We align default date with May 2026 as per local time context
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const today = new Date();
    // Default to the current day in current year/month
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const monthsSpanish = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  // Build the monthly grid data safely using native Date operations
  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayDate = new Date(year, month, 1);
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const firstDayOfWeekRaw = firstDayDate.getDay();
    // Translate to Monday-first: Monday = 0, ..., Sunday = 6
    const mondayFirstDayOfWeek = firstDayOfWeekRaw === 0 ? 6 : firstDayOfWeekRaw - 1;

    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonthYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const totalDaysInPrevMonth = new Date(prevMonthYear, prevMonth + 1, 0).getDate();

    const cells = [];

    // Fill previous month padding days
    for (let i = mondayFirstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = totalDaysInPrevMonth - i;
      cells.push({
        day: dayNum,
        month: prevMonth,
        year: prevMonthYear,
        isCurrentMonth: false,
        date: new Date(prevMonthYear, prevMonth, dayNum)
      });
    }

    // Fill current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      cells.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }

    // Fill next month padding days to complete standard 6-week layout (42 cells)
    const remainingCount = 42 - cells.length;
    const nextMonthYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    for (let i = 1; i <= remainingCount; i++) {
      cells.push({
        day: i,
        month: nextMonth,
        year: nextMonthYear,
        isCurrentMonth: false,
        date: new Date(nextMonthYear, nextMonth, i)
      });
    }

    return cells;
  }, [currentMonth]);

  // Utility to filter assignments matching a date and selected grade
  const getAssignmentsForDate = (date: Date) => {
    return assignments.filter(asg => {
      if (!asg.dueDate) return false;
      
      // Filter by Grade matching:
      // An assignment section matches if user selected all, if it is assigned to "TODOS", 
      // or if it matches the current grade filter.
      const gradeMatches = 
        selectedGradeFilter === "TODOS" || 
        asg.section === "TODOS" || 
        asg.section === selectedGradeFilter;
        
      if (!gradeMatches) return false;

      const duedateObj = parseDateString(asg.dueDate);
      if (!duedateObj) return false;

      return (
        duedateObj.getFullYear() === date.getFullYear() &&
        duedateObj.getMonth() === date.getMonth() &&
        duedateObj.getDate() === date.getDate()
      );
    });
  };

  // Assignments due on the selected date
  const selectedDayAssignments = useMemo(() => {
    return getAssignmentsForDate(selectedDate);
  }, [selectedDate, assignments, selectedGradeFilter]);

  // Compute all upcoming assignments sorted by urgency
  const sortedUpcomingAssignments = useMemo(() => {
    return assignments
      .filter(asg => {
        const gradeMatches = 
          selectedGradeFilter === "TODOS" || 
          asg.section === "TODOS" || 
          asg.section === selectedGradeFilter;
        return gradeMatches && !!asg.dueDate && !!parseDateString(asg.dueDate);
      })
      .map(asg => {
        const dateObj = parseDateString(asg.dueDate!);
        return {
          ...asg,
          dateObj: dateObj!
        };
      })
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  }, [assignments, selectedGradeFilter]);

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in text-slate-800 dark:text-slate-100">
      
      {/* Calendar Controller Header */}
      <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/40 select-none">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-500 text-xs font-bold font-sans">📅</span>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
            {monthsSpanish[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleGoToToday}
            className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-brand-teal hover:bg-brand-teal/10 dark:text-teal-400 dark:hover:bg-teal-500/10 border border-brand-teal/20 dark:border-teal-400/20 rounded-lg transition active:scale-95 cursor-pointer"
            title="Ir al día de hoy"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition active:scale-90 cursor-pointer"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={16} className="stroke-[2.5]" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition active:scale-90 cursor-pointer"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={16} className="stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Weekday Labels Grid */}
      <div className="grid grid-cols-7 gap-1 text-center font-bold text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
        <span>Lu</span>
        <span>Ma</span>
        <span>Mi</span>
        <span>Ju</span>
        <span>Vi</span>
        <span className="text-yellow-600/70 dark:text-yellow-500/50">Sá</span>
        <span className="text-rose-600/70 dark:text-rose-500/50">Do</span>
      </div>

      {/* Monthly Days Matrix Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarCells.map((cell, idx) => {
          const formattedDate = cell.date;
          const dayAssignments = getAssignmentsForDate(formattedDate);
          const hasAssignments = dayAssignments.length > 0;
          const today = isToday(formattedDate);
          const selected = isSelected(formattedDate);

          return (
            <button
              key={`${formattedDate.toISOString()}-${idx}`}
              type="button"
              onClick={() => setSelectedDate(formattedDate)}
              className={`
                aspect-square rounded-xl relative flex flex-col items-center justify-center text-[11px] font-bold transition duration-150 active:scale-95 cursor-pointer select-none
                ${!cell.isCurrentMonth ? "text-slate-350 dark:text-slate-650 opacity-40 hover:opacity-70" : "text-slate-700 dark:text-slate-200"}
                ${selected 
                  ? "bg-brand-teal text-white dark:bg-teal-600 dark:text-white shadow-md shadow-brand-teal/10 scale-[1.03]" 
                  : today
                    ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/30"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }
              `}
            >
              {/* Day Number Label */}
              <span className={`z-10 ${selected ? "font-black scale-105" : ""}`}>{cell.day}</span>

              {/* Assignment visual highlights */}
              {hasAssignments && (
                <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full z-15 ${
                  selected 
                    ? "bg-amber-400 border border-brand-teal" 
                    : today 
                      ? "bg-rose-500" 
                      : "bg-brand-teal dark:bg-teal-400 animate-pulse"
                }`} title={`${dayAssignments.length} entrega(s) programada(s)`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day Agenda Banner or Upcoming Tasks */}
      <div className="mt-2 border-t border-slate-100 dark:border-slate-805 pt-4">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center justify-between select-none">
          <span>
            📋 {selectedDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
          </span>
          {selectedDayAssignments.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black bg-brand-teal/10 text-brand-teal dark:bg-teal-400/15 dark:text-teal-400 uppercase leading-none">
              {selectedDayAssignments.length} entrega{selectedDayAssignments.length === 1 ? "" : "s"}
            </span>
          )}
        </h4>

        {/* Selected Day Deadlines List */}
        <AnimatePresence mode="wait">
          {selectedDayAssignments.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-3"
            >
              {selectedDayAssignments.map(asg => {
                const badgeInfo = asg.dueDate ? getDaysUntil(asg.dueDate) : null;
                return (
                  <div
                    key={asg.id}
                    className="p-3 rounded-2xl border border-teal-500/15 bg-brand-teal/5 dark:bg-teal-500/5 dark:border-teal-500/10 flex flex-col gap-1.5"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[8px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest bg-teal-500/10 px-1.5 py-0.5 rounded">
                        {asg.section === "TODOS" ? "Todos los Grados" : asg.section}
                      </span>
                      {badgeInfo && (
                        <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-full ${badgeInfo.badgeStyle}`}>
                          {badgeInfo.text}
                        </span>
                      )}
                    </div>
                    <h5 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1">
                      <span>📝</span>
                      {asg.title}
                    </h5>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                      {asg.description}
                    </p>

                    {/* Delivery Quick Link trigger */}
                    <button
                      type="button"
                      onClick={() => onSelectAssignmentForSubmit(asg.id, asg.title, asg.section)}
                      className="mt-1 flex items-center justify-center gap-1.5 w-full py-1.5 bg-brand-teal hover:bg-brand-teal/92 text-white dark:bg-teal-600 dark:hover:bg-teal-500 rounded-xl text-[9px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-sm shadow-brand-teal/10"
                    >
                      <Send size={10} className="stroke-[2.5]" />
                      <span>Ir a Entregar Tarea</span>
                    </button>
                  </div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-4"
            >
              {/* Neutral notification when selected day has nothing */}
              <div className="p-3 bg-slate-50/60 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850/60 rounded-2xl flex items-center gap-2.5">
                <Inbox size={15} className="text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                  No hay fechas límites programadas para este día específico ({selectedDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}).
                </span>
              </div>

              {/* Next upcoming delivery details */}
              {sortedUpcomingAssignments.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1 ml-1 mb-1 shadow-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse"></span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-450 dark:text-slate-500 select-none">
                      Siguientes Actividades Próximas
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[170px] overflow-y-auto pr-0.5">
                    {sortedUpcomingAssignments
                      .filter(asg => {
                        // Display only future tasks
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        return asg.dateObj.getTime() >= today.getTime();
                      })
                      .slice(0, 3) // show top 3 closest deadlines
                      .map(asg => {
                        const badgeInfo = getDaysUntil(asg.dueDate!);
                        return (
                          <div
                            key={asg.id}
                            onClick={() => setSelectedDate(asg.dateObj)}
                            className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-850 bg-white hover:bg-slate-50/50 dark:bg-slate-950/25 dark:hover:bg-slate-950/45 cursor-pointer transition flex items-center justify-between gap-3 select-none text-left"
                            title="Haz clic para ver el día en el calendario"
                          >
                            <div className="min-w-0 flex-1">
                              <h6 className="font-extrabold text-[10.5px] text-slate-800 dark:text-slate-100 truncate flex items-center gap-1 leading-tight">
                                <span className="text-[10px]">📆</span>
                                {asg.title}
                              </h6>
                              <p className="text-[8.5px] uppercase font-bold text-slate-400 dark:text-slate-500 mt-0.5 tracking-wider truncate">
                                {asg.section === "TODOS" ? "Todos los Grados" : asg.section} &bull; {asg.dueDate}
                              </p>
                            </div>
                            
                            {badgeInfo && (
                              <span className={`text-[8px] font-black shrink-0 px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${badgeInfo.badgeStyle}`}>
                                {badgeInfo.text}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
