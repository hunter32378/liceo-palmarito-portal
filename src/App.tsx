/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { AppView } from "./types";
import RoleSelection from "./components/RoleSelection";
import StudentForm from "./components/StudentForm";
import TeacherDashboard from "./components/TeacherDashboard";
import { GraduationCap, Sparkles, BookOpen, Sun, Moon, Bell } from "lucide-react";
import { motion } from "motion/react";

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("ROLE_SELECTION");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark" ? "dark" : "light";
  });
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        let url = "/api/notifications";
        if (currentView === "TEACHER_VIEW") {
          url += "?role=TEACHER";
        } else if (currentView === "STUDENT_VIEW") {
          url += "?role=STUDENT";
        }
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          // Find unread count
          const count = data.filter((n: any) => !n.read).length;
          setUnreadCount(count);
        }
      } catch (err: any) {
        if (err && (err.message === "Failed to fetch" || err.name === "TypeError")) {
          console.warn("Could not reach notification server in layout (transient network failure). Retrying...");
        } else {
          console.error("Error polling unread notifications in layout:", err);
        }
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 10000); // Polling every 10 seconds

    return () => clearInterval(interval);
  }, [currentView]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [theme]);

  // Handle Supabase Magic Link authentication return
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=") && hash.includes("type=magiclink")) {
      // User successfully authenticated via Magic Link
      sessionStorage.setItem("teacher_auth", "true");
      setCurrentView("TEACHER_VIEW");
      
      // Clean up the URL hash to remove the token from visibility
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // Handle hardware back button for mobile (Android/iOS)
  useEffect(() => {
    const handlePopState = () => {
      // If we are in a subview, go back to ROLE_SELECTION
      if (currentView !== "ROLE_SELECTION") {
        setCurrentView("ROLE_SELECTION");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentView]);

  // Update history state when view changes
  useEffect(() => {
    if (currentView !== "ROLE_SELECTION") {
      window.history.pushState({ view: currentView }, "");
    }
  }, [currentView]);

  const renderView = () => {
    switch (currentView) {
      case "STUDENT_VIEW":
        return <StudentForm onBack={() => setCurrentView("ROLE_SELECTION")} />;
      case "TEACHER_VIEW":
        return <TeacherDashboard onBack={() => setCurrentView("ROLE_SELECTION")} />;
      case "ROLE_SELECTION":
      default:
        return (
          <RoleSelection
            onSelectStudent={() => setCurrentView("STUDENT_VIEW")}
            onSelectTeacher={() => setCurrentView("TEACHER_VIEW")}
          />
        );
    }
  };

  return (
    <div className={`min-h-[100dvh] flex flex-col justify-center items-center sm:py-8 sm:px-4 relative overflow-x-hidden font-sans transition-colors duration-300 ${
      theme === "dark" ? "dark bg-slate-950 text-slate-100" : "bg-brand-light text-slate-900"
    }`}>
      
      {/* Decorative desktop-only backdrop illustrations */}
      <div className={`absolute top-10 left-10 pointer-events-none hidden lg:block transition-colors ${
        theme === "dark" ? "text-teal-900/10" : "text-brand-teal/5"
      }`}>
        <GraduationCap size={160} className="stroke-[1]" />
      </div>
      <div className={`absolute bottom-10 right-10 pointer-events-none hidden lg:block transition-colors ${
        theme === "dark" ? "text-amber-900/10" : "text-brand-gold/5"
      }`}>
        <BookOpen size={160} className="stroke-[1]" />
      </div>
      <div className={`absolute top-1/3 right-12 pointer-events-none hidden xl:block transition-colors ${
        theme === "dark" ? "text-teal-900/10" : "text-brand-teal/5"
      }`}>
        <Sparkles size={80} />
      </div>

      {/* Main Container - Full height on mobile, constrained on desktop */}
      <div className={`w-full max-w-full sm:max-w-md md:max-w-3xl h-[100dvh] sm:h-[840px] sm:max-h-[92vh] sm:rounded-[40px] relative flex flex-col sm:shadow-2xl sm:border-[8px] transition-all duration-300 ${
        theme === "dark" 
          ? "bg-slate-900 text-slate-100 sm:border-[#0a0f0f] sm:ring-1 sm:ring-slate-800" 
          : "bg-white text-slate-900 sm:border-[#1a1a1a] sm:ring-1 sm:ring-slate-200"
      }`}>
        
        {/* Mobile Camera Notch Decorator - Hidden on plain mobile layouts */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1a1a1a] rounded-full z-50 items-center justify-center hidden sm:flex">
          <div className="w-3.5 h-3.5 bg-slate-900 rounded-full border border-teal-800/30"></div>
          <div className="w-1.5 h-1.5 bg-cyan-900 rounded-full ml-2"></div>
        </div>

        {/* Global Persistent Header with Theme Toggle */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:pt-10 sm:pb-2 z-40 select-none shrink-0 border-b border-slate-100 dark:border-slate-800/50">
          <div className="flex items-center space-x-1.5 opacity-90">
            <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse"></span>
            <span className="text-[10px] sm:text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
              Portal Educativo
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {unreadCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                tabIndex={0}
                className="flex items-center gap-1 bg-rose-500 text-white rounded-full px-2 py-0.5 shadow-sm font-sans font-extrabold text-[9px] uppercase tracking-wide cursor-default select-none group"
                title={`${unreadCount} notificación(es) sin leer`}
                id="global-unread-badge"
              >
                <div className="relative">
                  <Bell size={10} className="stroke-[2.5] animate-bounce" />
                </div>
                <span>{unreadCount}</span>
              </motion.div>
            )}

            <button
              id="theme-toggle"
              onClick={() => setTheme(prev => prev === "light" ? "dark" : "light")}
              className="p-1.5 rounded-xl transition duration-150 active:scale-95 cursor-pointer flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-amber-400 dark:hover:text-amber-300 border border-slate-200/40 dark:border-slate-700/50 shadow-sm"
              title={theme === "light" ? "Modo Oscuro" : "Modo Claro"}
            >
              {theme === "light" ? <Moon size={14} className="stroke-[2.2]" /> : <Sun size={14} className="stroke-[2.2]" />}
            </button>
          </div>
        </header>

        {/* Dynamic Screen Viewport Router Wrapper */}
        <main className="flex-1 w-full pt-1 pb-2 sm:pb-4 overflow-y-auto chat-scroll relative flex flex-col">
          {renderView()}
        </main>

        {/* Global Support & Copyright Footer */}
        <footer className="px-4 sm:px-6 py-2 border-t border-slate-100 dark:border-slate-800/40 bg-slate-50/45 dark:bg-slate-950/25 flex items-center justify-between text-[9px] sm:text-[10px] text-slate-500 font-sans tracking-wide shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="opacity-75 select-none shrink-0">&copy; Soporte:</span>
            <a href="mailto:bitc953@gmail.com" className="hover:underline font-bold text-slate-600 dark:text-slate-400 truncate">
              bitc953@gmail.com
            </a>
          </div>
          <a
            href="https://wa.me/584120521317"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:opacity-85 active:scale-95 transition shrink-0 font-extrabold text-[#25D366] whitespace-nowrap"
          >
            <span className="text-emerald-500 text-xs">💬</span>
            <span>0412-0521317</span>
          </a>
        </footer>
      </div>

      {/* Under Frame Desktop Caption */}
      <div className="mt-4 text-center hidden sm:flex flex-col gap-1 text-[11px] font-semibold tracking-wide justify-center items-center">
        <span className={theme === "dark" ? "text-teal-400/80" : "text-[#004d4d]"}>
          Portal Educativo &bull; Optimizado para Dispositivos Móviles
        </span>
      </div>
    </div>
  );
}
