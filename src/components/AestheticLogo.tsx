/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Star } from "lucide-react";
// @ts-ignore
import logoImg from "../assets/images/escudo_liceo_palmarito_512.png";

export default function AestheticLogo({ 
  size = "md"
}: { 
  size?: "sm" | "md" | "lg";
}) {
  const finalSize = size === "sm" ? 54 : size === "md" ? 96 : 145;
  
  return (
    <div className="flex flex-col items-center justify-center text-center select-none">
      <div className="relative flex items-center justify-center p-2 rounded-2xl bg-white/5 dark:bg-slate-900/5 transition-all">
        {/* Official Liceo Palmarito authentic school shield logo from the teacher's institution */}
        <div 
          style={{ width: finalSize, height: finalSize }} 
          className="rounded-full overflow-hidden bg-transparent flex items-center justify-center"
        >
          <img
            src={logoImg}
            alt="Escudo U.E. Liceo Palmarito"
            className="w-full h-full object-cover scale-[1.04] selection:bg-transparent"
            referrerPolicy="no-referrer"
          />
        </div>
        
        {/* Sparking Rising Star for Maestra's educational continuity */}
        <span className="absolute -top-1 -right-1 animate-pulse text-brand-gold">
          <Star 
            size={size === "sm" ? 12 : size === "md" ? 18 : 22} 
            fill="currentColor" 
            className="drop-shadow-[0_0_8px_rgba(197,160,89,0.8)]"
          />
        </span>
      </div>
      
      {/* Dynamic Subtitles */}
      <h1 className={`font-sans font-extrabold text-brand-teal dark:text-teal-400 tracking-wide uppercase mt-3 ${
        size === "sm" ? "text-sm" : size === "md" ? "text-base" : "text-lg"
      }`}>
        ANUVIS MEDINA
      </h1>
      <p className={`font-sans font-bold text-brand-gold tracking-[0.15em] text-center mt-0.5 uppercase ${
        size === "sm" ? "text-[8px]" : "text-[10px]"
      }`}>
        Educación con Propósito
      </p>
    </div>
  );
}

