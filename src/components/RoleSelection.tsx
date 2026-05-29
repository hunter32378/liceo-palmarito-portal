/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { GraduationCap, Lock } from "lucide-react";
import AestheticLogo from "./AestheticLogo";

interface RoleSelectionProps {
  onSelectStudent: () => void;
  onSelectTeacher: () => void;
}

export default function RoleSelection({ onSelectStudent, onSelectTeacher }: RoleSelectionProps) {
  return (
    <div className="flex flex-col items-center justify-between min-h-full px-6 py-6 overflow-y-auto">
      {/* Upper Logo Area */}
      <div className="w-full flex-1 flex flex-col items-center justify-center space-y-3 max-w-sm">
        <AestheticLogo size="lg" />
        
        <div className="text-center mt-3 space-y-1.5">
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none">
            ¡Te damos la bienvenida!
          </h2>
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 max-w-[280px] mx-auto leading-relaxed">
            Portal digital para el envío de actividades, tareas y consulta de estado escolar.
          </p>
        </div>
      </div>


      {/* Button Roles Selection */}
      <div className="w-full max-w-sm mt-8 space-y-4">
        {/* Student Button */}
        <button
          id="btn-soy-alumno"
          onClick={onSelectStudent}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-brand-gold hover:opacity-90 text-white shadow-lg transition-all duration-200 group active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-white/15 rounded-xl text-white group-hover:scale-110 transition-transform">
              <GraduationCap size={24} />
            </div>
            <div className="text-left">
              <span className="block text-[10px] text-white/80 font-bold uppercase tracking-wider">
                Para Estudiantes
              </span>
              <span className="block text-base font-black uppercase tracking-tight">
                Soy Alumno (Entregar Tarea)
              </span>
            </div>
          </div>
          <span className="text-white font-bold text-xl group-hover:translate-x-1 transition-transform">
            &rarr;
          </span>
        </button>

        {/* Teacher Button (Google Auth) */}
        <button
          id="btn-acceso-profesora"
          onClick={() => {
            window.location.href = "/api/auth/google";
          }}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800/50 border-2 border-brand-teal dark:border-teal-500/50 hover:bg-brand-teal/5 dark:hover:bg-teal-500/10 text-brand-teal dark:text-teal-400 transition-all duration-200 group active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-brand-teal/10 dark:bg-teal-500/15 rounded-xl text-brand-teal dark:text-teal-400 group-hover:scale-110 transition-transform">
              <Lock size={20} />
            </div>
            <div className="text-left">
              <span className="block text-[10px] text-brand-teal/70 dark:text-teal-400/85 font-bold uppercase tracking-wider">
                Administración Segura
              </span>
              <span className="block text-sm font-black uppercase tracking-tight">
                Entrar con Google (bitc953)
              </span>
            </div>
          </div>
          <span className="text-brand-teal dark:text-teal-400 font-bold text-xl group-hover:translate-x-1 transition-transform">
            &rarr;
          </span>
        </button>
      </div>

      {/* Aesthetic Footer */}
      <div className="mt-12 text-center text-[10px] font-sans text-slate-400 dark:text-slate-500 tracking-wider uppercase font-medium">
        Portal Educativo <span className="font-bold text-brand-teal dark:text-teal-400">Liceo Palmarito</span>
      </div>
    </div>
  );
}
