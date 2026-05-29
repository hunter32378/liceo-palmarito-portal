/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ArrowLeft, Send, CheckCircle2, Link, FileText, User, 
  CreditCard, HelpCircle, X, MessageSquare, Award, Search, 
  Calendar, ShieldAlert, Clock, Download, ExternalLink, Paperclip,
  FileUp, RefreshCw, Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AestheticLogo from "./AestheticLogo";
import NotificationCenter from "./NotificationCenter";
import ChatSystem from "./ChatSystem";
import { getDaysUntil, parseDateString } from "../utils";
import AssignmentCalendar from "./AssignmentCalendar";


// Expresión regular para validar enlaces de Google Drive o Google Docs
const DRIVE_REGEX = /^(https?:\/\/)?(drive|docs)\.google\.com\/.+/i;

interface StudentFormProps {
  onBack: () => void;
}

export default function StudentForm({ onBack }: StudentFormProps) {
  // Navigation states
  const [activeTab, setActiveTab] = useState<"SUBMIT" | "QUERY" | "ASSIGNMENTS" | "CHAT">("SUBMIT");
  const [asgSubView, setAsgSubView] = useState<"LIST" | "CALENDAR">("LIST");

  const handleNotificationAction = (notification: any) => {
    if (notification.type === "GRADE") {
      setActiveTab("QUERY");
    } else if (notification.type === "SYSTEM" && notification.title && (notification.title.includes("Nueva Tarea Asignada") || notification.message.includes("Nueva tarea publicada"))) {
      setActiveTab("ASSIGNMENTS");
      const match = notification.message.match(/Nueva tarea publicada para\s+([^:]+):/);
      if (match) {
        const targetSection = match[1].trim();
        setSelectedGradeFilter(targetSection);
      }
    } else if (notification.type === "SYSTEM" && notification.title && notification.title.includes("Recordatorio de Tarea")) {
      setActiveTab("SUBMIT");
      const match = notification.message.match(/: "([^"]+)"/);
      if (match) {
        const targetTitle = match[1].trim();
        const found = assignments.find(a => a.title.toLowerCase().includes(targetTitle.toLowerCase()));
        if (found) {
          setSelectedAssignmentId(found.id);
          setSelectedAssignmentTitle(found.title);
        }
      }
    }
  };

  // Form states
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("student_name") || "";
    } catch {
      return "";
    }
  });
  const [ci, setCi] = useState(() => {
    try {
      return localStorage.getItem("student_ci") || "";
    } catch {
      return "";
    }
  });
  const [section, setSection] = useState(() => {
    try {
      return localStorage.getItem("student_section") || "";
    } catch {
      return "";
    }
  });
  const [driveLink, setDriveLink] = useState("");
  const [comments, setComments] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [selectedAssignmentTitle, setSelectedAssignmentTitle] = useState("");
  const [localFileUrl, setLocalFileUrl] = useState("");
  const [localFileName, setLocalFileName] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleStudentFileUpload = async (file: File) => {
    setIsUploadingFile(true);
    setUploadError("");
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setLocalFileUrl(data.url);
        setLocalFileName(data.originalName);
        setDriveLink(data.url);
      } else {
        const errData = await response.json();
        setUploadError(errData.error || "Error al subir el archivo.");
      }
    } catch (err) {
      setUploadError("Error de comunicación de red al subir el archivo.");
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Assignments states
  const [selectedGradeFilter, setSelectedGradeFilter] = useState("Primer Grado");
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  // Compute if any assignment matching current grade has less than 24 hours of remaining deadline
  const hasUrgentTask = React.useMemo(() => {
    return assignments.some(asg => {
      if (!asg.dueDate) return false;

      const gradeMatches =
        selectedGradeFilter === "TODOS" ||
        asg.section === "TODOS" ||
        asg.section === selectedGradeFilter;

      if (!gradeMatches) return false;

      const targetDate = parseDateString(asg.dueDate);
      if (!targetDate) return false;

      const now = new Date();
      const diffTimeMs = targetDate.getTime() - now.getTime();
      const hrs = diffTimeMs / (1000 * 60 * 60);

      // Less than 24 hours of remaining deadline left (not expired)
      return hrs > 0 && hrs < 24;
    });
  }, [assignments, selectedGradeFilter]);

  // Autocomplete states
  const [authorizedStudents, setAuthorizedStudents] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch authorized students on mount for autocomplete
  useEffect(() => {
    const fetchAuthStudents = async () => {
      try {
        const response = await fetch("/api/authorized-students");
        if (response.ok) {
          const data = await response.json();
          setAuthorizedStudents(data);
        }
      } catch (err) {
        console.error("Error loading authorized students for autocomplete:", err);
      }
    };
    fetchAuthStudents();
  }, []);

  // Fetch published assignments/tasks
  useEffect(() => {
    const fetchAssignments = async () => {
      setAssignmentsLoading(true);
      try {
        const response = await fetch("/api/assignments");
        if (response.ok) {
          const data = await response.json();
          setAssignments(data);
        }
      } catch (err) {
        console.error("Error loading assignments for student:", err);
      } finally {
        setAssignmentsLoading(false);
      }
    };
    fetchAssignments();
  }, []);

  // Set Name and Section if exact CI match is typed
  useEffect(() => {
    const cleanCi = ci.replace(/\D/g, "");
    if (cleanCi) {
      const match = authorizedStudents.find(
        (s) => s.ci.replace(/\D/g, "") === cleanCi
      );
      if (match) {
        setName(match.name);
        setSection(match.section);
        setSelectedGradeFilter(match.section); // Automatically pre-filter student assignments
        setShowSuggestions(false);
        try {
          localStorage.setItem("student_ci", cleanCi);
          localStorage.setItem("student_name", match.name);
          localStorage.setItem("student_section", match.section);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [ci, authorizedStudents]);

  const handleSelectSuggestion = (student: any) => {
    const cleanCi = student.ci.replace(/\D/g, "");
    setCi(cleanCi);
    setName(student.name);
    setSection(student.section);
    setSelectedGradeFilter(student.section); // Automatically pre-filter student assignments
    setShowSuggestions(false);
    try {
      localStorage.setItem("student_ci", cleanCi);
      localStorage.setItem("student_name", student.name);
      localStorage.setItem("student_section", student.section);
    } catch (e) {
      console.error(e);
    }
  };

  // Filter student lists matching input
  const cleanTypedCi = ci.replace(/\D/g, "");
  const matchingSuggestions = cleanTypedCi.length >= 3
    ? authorizedStudents.filter(s => s.ci.replace(/\D/g, "").includes(cleanTypedCi))
    : [];

  // Grade search states
  const [ciQuery, setCiQuery] = useState(() => {
    try {
      return localStorage.getItem("student_ci") || "";
    } catch {
      return "";
    }
  });
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [searched, setSearched] = useState(false);

  // UI state
  const [status, setStatus] = useState<"IDLE" | "SUBMITTING" | "SUCCESS" | "ERROR">("IDLE");
  const [errorMessage, setErrorMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Grade query function
  const handleQueryGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ciQuery.trim()) {
      setQueryError("Por favor, ingresa tu Cédula de Identidad.");
      return;
    }
    
    setQueryLoading(true);
    setQueryError("");
    setSearched(true);
    
    try {
      const response = await fetch(`/api/submissions/my-grade?ci=${encodeURIComponent(ciQuery.trim())}`);
      if (response.ok) {
        const data = await response.json();
        setQueryResults(data);
      } else {
        const errData = await response.json();
        setQueryError(errData.error || "No se pudo consultar. Inténtalo de nuevo.");
      }
    } catch (err) {
      setQueryError("Error de comunicación de red. Inténtalo de nuevo.");
    } finally {
      setQueryLoading(false);
    }
  };


  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validations
    if (!name.trim()) {
      setErrorMessage("Por favor, ingresa tu Nombre y Apellido.");
      setStatus("ERROR");
      return;
    }
    if (!ci.trim()) {
      setErrorMessage("Por favor, ingresa tu Cédula de Identidad.");
      setStatus("ERROR");
      return;
    }
    if (!section) {
      setErrorMessage("Por favor, selecciona tu grado correspondiente.");
      setStatus("ERROR");
      return;
    }

    if (localFileUrl) {
      // Local file is uploaded successfully
    } else {
      if (!driveLink.trim()) {
        setErrorMessage("Por favor, sube un archivo o copia y pega el enlace de tu tarea de Google Drive.");
        setStatus("ERROR");
        return;
      }

      if (!DRIVE_REGEX.test(driveLink.trim())) {
        setErrorMessage("Por favor, ingresa un enlace válido de Google Drive o Google Docs (ej. https://drive.google.com/...).");
        setStatus("ERROR");
        return;
      }
    }

    setErrorMessage("");
    setShowConfirmModal(true);
  };

  const executeSubmit = async () => {
    setShowConfirmModal(false);
    setStatus("SUBMITTING");
    setErrorMessage("");

    let finalUrl = driveLink.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("/api/files/")) {
      finalUrl = "https://" + finalUrl;
    }

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          ci: ci.trim(),
          section,
          driveLink: finalUrl,
          comments: comments.trim() || undefined,
          assignmentId: selectedAssignmentId || undefined,
          assignmentTitle: selectedAssignmentTitle || undefined,
          attachmentName: localFileName || undefined
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("IDLE");
        setToastMessage("¡Tarea enviada con éxito! Éxito en tu evaluación.");
        setShowToast(true);
        // Clear fields on success
        setName("");
        setCi("");
        setSection("");
        setDriveLink("");
        setComments("");
        setSelectedAssignmentId("");
        setSelectedAssignmentTitle("");
        setLocalFileUrl("");
        setLocalFileName("");
      } else {
        setErrorMessage(data.error || "Ocurrió un error al enviar la tarea.");
        setStatus("ERROR");
      }
    } catch (err) {
      setErrorMessage("Hubo un error de conexión con el servidor. Inténtalo de nuevo.");
      setStatus("ERROR");
    }
  };

  return (
    <div className="flex flex-col min-h-full px-5 py-6 font-sans relative overflow-hidden">
      {/* Toast Notification (Material Design style) */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-4 left-4 right-4 z-50 bg-brand-teal text-white border border-brand-gold/40 shadow-2xl p-4 rounded-2xl flex items-start gap-3"
          >
            <div className="p-1.5 bg-brand-gold rounded-full text-white shrink-0 shadow-md">
              <CheckCircle2 size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black leading-tight uppercase text-brand-gold tracking-wide">¡Envío Exitoso!</p>
              <p className="text-[11px] text-gray-100 mt-1 font-semibold leading-normal">{toastMessage}</p>
            </div>
            <button
              id="btn-close-toast"
              onClick={() => setShowToast(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer shrink-0 mt-0.5"
              aria-label="Cerrar notificación"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            id="confirm-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              id="confirm-modal-box"
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="w-full max-w-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col"
            >
              <div className="mb-4">
                <span className="inline-block p-2 bg-[#c5a059]/10 rounded-xl text-[#c5a059] mb-3">
                  <HelpCircle size={20} className="stroke-[2.5]" />
                </span>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                  Confirmar Información
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-450 mt-1 leading-normal">
                  Por favor, verifica que tus datos estén bien escritos antes de enviarle la tarea a la profesora Anuvis Medina.
                </p>
              </div>

              {/* Information Summary Grid */}
              <div className="space-y-3 my-2 text-xs border-y border-slate-100 dark:border-slate-800/80 py-3">
                {/* Nombre */}
                <div className="flex items-start gap-2.5">
                  <User size={14} className="text-brand-teal dark:text-teal-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Nombre y Apellido
                    </span>
                    <span className="block font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight truncate">
                      {name}
                    </span>
                  </div>
                </div>

                {/* Cédula */}
                <div className="flex items-start gap-2.5">
                  <CreditCard size={14} className="text-brand-teal dark:text-teal-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Cédula de Identidad
                    </span>
                    <span className="block font-bold text-slate-700 dark:text-slate-200 tracking-wider">
                      {ci.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')}
                    </span>
                  </div>
                </div>

                {/* Sección */}
                <div className="flex items-start gap-2.5">
                  <FileText size={14} className="text-brand-teal dark:text-teal-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Sección Seleccionada
                    </span>
                    <span className="block font-black text-slate-700 dark:text-slate-200">
                      Sección {section}
                    </span>
                  </div>
                </div>

                {/* Enlace */}
                <div className="flex items-start gap-2.5">
                  <Link size={14} className="text-[#c5a059] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Enlace Google Drive
                    </span>
                    <span className="block font-medium text-[#c5a059] dark:text-amber-400 underline underline-offset-2 break-all text-[11px] leading-tight">
                      {driveLink}
                    </span>
                  </div>
                </div>

                {/* Comments (Alternative description detail if written) */}
                {comments.trim() && (
                  <div className="flex items-start gap-2.5">
                    <MessageSquare size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="block text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Comentario (Opcional)
                      </span>
                      <p className="font-sans text-slate-600 dark:text-slate-400 italic leading-snug break-words">
                        "{comments}"
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Action Footer Buttons */}
              <div className="flex items-center gap-2 mt-4">
                <button
                  id="confirm-modal-cancel-btn"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl font-bold text-xs transition duration-150 active:scale-95 cursor-pointer text-center"
                >
                  Corregir Datos
                </button>
                <button
                  id="confirm-modal-submit-btn"
                  onClick={executeSubmit}
                  className="flex-1 py-2.5 bg-brand-teal dark:bg-teal-600 hover:bg-brand-teal/95 dark:hover:bg-teal-550 text-white rounded-xl font-bold text-xs transition duration-150 active:scale-95 cursor-pointer text-center flex items-center justify-center gap-1.5"
                >
                  <Send size={12} className="stroke-[2.5]" />
                  <span>Confirmar</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          id="btn-student-back"
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition active:scale-[0.9] cursor-pointer"
          aria-label="Volver atrás"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="scale-75">
          <AestheticLogo size="sm" />
        </div>
        <NotificationCenter role="STUDENT" ci={ci} onNotificationAction={handleNotificationAction} />
      </div>

      {/* Main Container Card */}
      <div className={`flex-1 mx-auto w-full bg-white dark:bg-slate-900 rounded-[32px] p-6 border border-slate-100 dark:border-slate-800/80 shadow-xl shadow-slate-100/40 dark:shadow-none transition-all duration-350 flex flex-col ${activeTab === "CHAT" ? "max-w-4xl" : "max-w-sm"}`}>
        
        {/* Sub-Navigation Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800/60 mb-6 font-bold text-[11px] tracking-tight shrink-0 gap-1 overflow-x-auto scrollbar-none pb-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("ASSIGNMENTS")}
            className={`flex-1 min-w-[55px] pb-3 text-center transition cursor-pointer relative font-black ${
              activeTab === "ASSIGNMENTS"
                ? "text-brand-teal dark:text-teal-400 border-b-2 border-brand-teal dark:border-teal-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            📋 Tareas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("SUBMIT")}
            className={`flex-1 min-w-[55px] pb-3 text-center transition cursor-pointer relative font-black ${
              activeTab === "SUBMIT"
                ? "text-brand-teal dark:text-teal-400 border-b-2 border-brand-teal dark:border-teal-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            ✏️ Enviar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("QUERY")}
            className={`flex-1 min-w-[50px] pb-3 text-center transition cursor-pointer relative font-black ${
              activeTab === "QUERY"
                ? "text-brand-teal dark:text-teal-400 border-b-2 border-brand-teal dark:border-teal-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            🔍 Notas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CHAT")}
            className={`flex-1 min-w-[55px] pb-3 text-center transition cursor-pointer relative font-black ${
              activeTab === "CHAT"
                ? "text-brand-teal dark:text-teal-400 border-b-2 border-brand-teal dark:border-teal-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            💬 Chat
          </button>
        </div>

        {/* Tab contents */}
        {activeTab === "SUBMIT" && (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="mb-5">
                <h2 className="text-lg font-bold text-[#004d4d] dark:text-teal-400 flex items-center gap-1.5">
                  <span>Entrega de Tarea</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-[#c5a059] font-black uppercase tracking-wider">
                    Segura
                  </span>
                </h2>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
                  Completa los campos. Solo alumnos autorizados en la lista de cada sección pueden enviar.
                </p>
              </div>

              {errorMessage && (
                <div id="error-box" className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold flex gap-2 leading-relaxed">
                  <ShieldAlert size={15} className="shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nombre y Apellido */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                    <User size={11} className="text-brand-teal dark:text-teal-400" />
                    Nombre y Apellido
                  </label>
                  <input
                    id="student-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Carlos Pérez"
                    className="p-2.5 text-sm border border-gray-200 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-1 focus:ring-brand-teal focus:border-brand-teal outline-none transition"
                  />
                </div>

                {/* Cédula de Identidad */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                    <CreditCard size={11} className="text-brand-teal dark:text-teal-400" />
                    Cédula de Identidad
                  </label>
                  <div className="relative">
                    <input
                      id="student-ci"
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      required
                      value={ci}
                      onChange={(e) => {
                        setCi(e.target.value.replace(/\D/g, ""));
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Ej. 24123456 (Solo números)"
                      className="w-full p-2.5 pr-24 text-sm border border-gray-200 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-brand-teal focus:border-brand-teal outline-none transition text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600"
                    />

                    {/* Active exact/partial match indicators inside the textfield */}
                    {ci.trim() !== "" && (
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none select-none">
                        {authorizedStudents.some(s => s.ci.replace(/\D/g, "") === ci.replace(/\D/g, "")) ? (
                          <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1 leading-none shadow-sm animate-pulse">
                            <CheckCircle2 size={11} className="stroke-[3.5]" />
                            Registrado
                          </span>
                        ) : (
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded">
                            Buscando...
                          </span>
                        )}
                      </div>
                    )}

                    {/* Suggestions Dropdown */}
                    <AnimatePresence>
                      {showSuggestions && matchingSuggestions.length > 0 && (
                        <motion.div
                          id="ci-autocomplete-dropdown"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl divide-y divide-slate-100 dark:divide-slate-900/50"
                        >
                          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/40 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                            Alumnos Encontrados ({matchingSuggestions.length})
                          </div>
                          {matchingSuggestions.map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onMouseDown={() => handleSelectSuggestion(st)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900 flex flex-col gap-0.5 transition cursor-pointer select-none"
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                                  {st.name}
                                </span>
                                <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 bg-slate-150 dark:bg-slate-900 px-1.5 py-0.5 rounded tracking-wide border border-slate-100 dark:border-slate-850">
                                  {st.section}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                                Cédula: {st.ci}
                              </span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Sección / Grado */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                    <FileText size={11} className="text-brand-teal dark:text-teal-400" />
                    Grado Escolar
                  </label>
                  <div className="relative">
                    <select
                      id="student-section"
                      required
                      value={section}
                      onChange={(e) => {
                        setSection(e.target.value);
                        setSelectedAssignmentId("");
                        setSelectedAssignmentTitle("");
                      }}
                      className="w-full p-2.5 text-sm border border-gray-200 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none cursor-pointer transition appearance-none focus:ring-1 focus:ring-brand-teal"
                    >
                      <option value="" disabled className="dark:bg-slate-900">Selecciona tu grado</option>
                      <option value="Primer Grado" className="dark:bg-slate-900">Primer Grado</option>
                      <option value="Segundo Grado" className="dark:bg-slate-900">Segundo Grado</option>
                      <option value="Tercer Grado" className="dark:bg-slate-900">Tercer Grado</option>
                      <option value="Cuarto Grado" className="dark:bg-slate-900">Cuarto Grado</option>
                      <option value="Quinto Grado" className="dark:bg-slate-900">Quinto Grado</option>
                    </select>
                    <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                {/* Tarea o Actividad Relacionada */}
                {section && (
                  <div className="flex flex-col animate-fade-in">
                    <label className="text-[10px] font-bold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                      <FileText size={11} className="text-[#004d4d] dark:text-teal-400 font-bold" />
                      Tarea / Actividad que Entregas
                    </label>
                    <div className="relative">
                      <select
                        id="student-assignment-select"
                        value={selectedAssignmentId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedAssignmentId(val);
                          const matching = assignments.find(a => a.id === val);
                          setSelectedAssignmentTitle(matching ? matching.title : "");
                        }}
                        className="w-full p-2.5 text-sm border border-gray-200 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none cursor-pointer transition appearance-none focus:ring-1 focus:ring-brand-teal"
                      >
                        <option value="" className="dark:bg-slate-900">Selecciona la tarea que estás entregando (Opcional)</option>
                        {assignments
                          .filter(a => a.section === "TODOS" || a.section === section)
                          .map((a) => (
                            <option key={a.id} value={a.id} className="dark:bg-slate-900">
                              {a.title} {a.dueDate ? `(Plazo: ${a.dueDate})` : ""}
                            </option>
                          ))
                        }
                      </select>
                      <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}

                 {/* Entrega de Tarea / Adjuntos */}
                <div className="border border-slate-200/65 dark:border-slate-800 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 space-y-4">
                  <span className="text-[10px] font-black uppercase text-[#004d4d] dark:text-teal-400 tracking-wider select-none leading-none block">
                    Entrega tu Tarea / Adjuntar Trabajo 📎
                  </span>
                  
                  {/* Option A: Local File Upload */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider select-none">
                      Opción A: Subir Archivo PDF, Word o Excel
                    </label>
                    
                    {isUploadingFile ? (
                      <div className="p-4 border border-dashed border-brand-teal/40 bg-brand-teal/5 flex flex-col items-center justify-center gap-2 rounded-xl">
                        <RefreshCw size={18} className="animate-spin text-brand-teal" />
                        <span className="text-[10px] text-brand-teal font-extrabold animate-pulse">Subiendo tu documento...</span>
                      </div>
                    ) : localFileName ? (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/55 rounded-xl flex items-center justify-between gap-3 animate-fade-in">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 truncate">
                              {localFileName}
                            </p>
                            <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                              Archivo cargado de forma segura
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLocalFileUrl("");
                            setLocalFileName("");
                            setDriveLink("");
                          }}
                          className="p-1 rounded-lg text-emerald-700 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer shrink-0"
                          title="Eliminar archivo"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="relative group/student-upload">
                        <input
                          type="file"
                          id="student-file-upload-input"
                          accept=".pdf,.doc,.docx,.xls,.xlsx"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleStudentFileUpload(file);
                          }}
                          className="hidden"
                        />
                        <label
                          htmlFor="student-file-upload-input"
                          className="border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 py-3.5 px-4 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer text-center group-hover/student-upload:border-[#004d4d] dark:group-hover/student-upload:border-teal-500 transition shadow-sm"
                        >
                          <FileUp size={16} className="text-slate-400 dark:text-slate-500" />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Presiona para subir un archivo local...
                          </span>
                          <span className="text-[8.5px] text-slate-400 dark:text-slate-500">
                            Formatos habilitados: PDF, Word (.doc, .docx), Excel (.xls, .xlsx)
                          </span>
                        </label>
                      </div>
                    )}
                    {uploadError && (
                      <p className="text-[10px] text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/10 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30">
                        ⚠️ {uploadError}
                      </p>
                    )}
                  </div>

                  {/* Horizontal visual separator with text */}
                  <div className="flex items-center gap-2 select-none">
                    <span className="h-[1.5px] bg-slate-100 dark:bg-slate-850 flex-grow"></span>
                    <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400">o también puedes</span>
                    <span className="h-[1.5px] bg-slate-100 dark:bg-slate-850 flex-grow"></span>
                  </div>

                  {/* Option B: Drive/Web URL */}
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1 select-none">
                      Opción B: Pegar Enlace de Google Drive / Docs
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="student-drive"
                        type="url"
                        disabled={!!localFileName}
                        value={localFileName ? "" : driveLink}
                        onChange={(e) => {
                          setDriveLink(e.target.value);
                          setLocalFileUrl("");
                          setLocalFileName("");
                        }}
                        placeholder={localFileName ? "Deshabilitado al subir un archivo local" : "https://drive.google.com/..."}
                        className={`w-full p-2.5 pr-10 text-xs border rounded-lg bg-gray-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-1 outline-none transition disabled:opacity-50 ${
                          !localFileName && driveLink.trim() !== ""
                            ? DRIVE_REGEX.test(driveLink.trim())
                              ? "border-emerald-500 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white"
                              : "border-rose-300 focus:ring-rose-400 focus:border-rose-450 focus:bg-white"
                            : "border-gray-200 dark:border-slate-800 focus:ring-[#004d4d] focus:border-[#004d4d] focus:bg-white"
                        }`}
                      />
                      {!localFileName && driveLink.trim() !== "" && (
                        <div className="absolute right-3 flex items-center pointer-events-none">
                          {DRIVE_REGEX.test(driveLink.trim()) ? (
                            <span className="text-emerald-500 flex items-center" title="Enlace válido">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          ) : (
                            <span className="text-rose-500 text-xs font-bold font-sans" title="Enlace no válido">
                              ⚠️
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {!localFileName && (
                      <p className="text-[9px] text-[#c5a059] dark:text-amber-400/90 mt-1.5 font-bold flex items-start gap-1">
                        <HelpCircle size={11} className="shrink-0 mt-0.5" />
                        <span>* Recuerda que el enlace debe tener permisos de lectura para la Profa.</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Comentarios del Alumno (Opcional) */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                    <MessageSquare size={11} className="text-brand-teal dark:text-teal-400" />
                    Comentarios (Opcional)
                  </label>
                  <textarea
                    id="student-comments"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="¿Alguna aclaración o duda para la profesora?"
                    rows={2}
                    maxLength={250}
                    className="p-2.5 text-xs border border-gray-200 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-brand-teal focus:border-brand-teal outline-none transition resize-none font-sans"
                  />
                </div>

                {/* Enviar Tarea Button */}
                <button
                  id="btn-enviar-tarea"
                  type="submit"
                  disabled={status === "SUBMITTING"}
                  className="w-full mt-6 py-3 bg-[#c5a059] dark:bg-[#c5a059] hover:bg-[#c5a059]/95 disabled:bg-amber-400 text-white rounded-xl font-bold text-sm shadow-lg transition active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed text-center"
                >
                  {status === "SUBMITTING" ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} className="stroke-[2.5]" />
                      <span>Enviar Tarea</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === "QUERY" && (
          /* Grade and feedback inquiry screen */
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="mb-5">
                <h2 className="text-lg font-bold text-[#004d4d] dark:text-teal-400 flex items-center gap-1.5 animate-fade-in">
                  <span>Consulta tu Calificación</span>
                </h2>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">
                  Ingresa tu Cédula de Identidad para ver tus notas y la retroalimentación de la profesora.
                </p>
              </div>

              {queryError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {queryError}
                </div>
              )}

              <form onSubmit={handleQueryGrade} className="space-y-3.5 mb-5 select-none">
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                    <CreditCard size={11} className="text-brand-teal dark:text-teal-400" />
                    Cédula de Identidad
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="query-student-ci"
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      required
                      value={ciQuery}
                      onChange={(e) => setCiQuery(e.target.value.replace(/\D/g, ""))}
                      placeholder="Ej: 12345 o 12345678"
                      className="flex-1 p-2.5 text-sm border border-gray-200 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-1 focus:ring-brand-teal focus:border-brand-teal outline-none transition"
                    />
                    <button
                      id="btn-submit-ci-query"
                      type="submit"
                      disabled={queryLoading}
                      className="p-2.5 bg-brand-teal hover:bg-[#004d4d]/90 text-white rounded-lg transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                      title="Buscar"
                    >
                      {queryLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                      ) : (
                        <Search size={18} className="stroke-[2.5]" />
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Inquiry Results Render */}
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                {queryLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-1.5">
                    <div className="w-6 h-6 border-2 border-brand-teal border-t-transparent animate-spin rounded-full"></div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-teal">Consultando base de datos...</span>
                  </div>
                ) : searched ? (
                  queryResults.length === 0 ? (
                    <div className="p-5 text-center bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 animate-fade-in">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No se encontraron entregas</p>
                      <p className="text-[10px] mt-1 leading-normal">
                        Asegúrate de haber escrito bien tu cédula ({ciQuery}). Si aún no has enviado tu tarea o no estás registrado en la sección, no aparecerá información.
                      </p>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-3"
                    >
                      <p className="text-[10px] font-bold text-brand-teal dark:text-teal-400 uppercase tracking-widest px-1">
                        Se encontraron {queryResults.length} entrega(s):
                      </p>
                      {queryResults.map((sub, index) => {
                        const hasGrade = !!sub.grade;
                        const gradeDate = sub.gradedAt ? new Date(sub.gradedAt).toLocaleDateString() : null;

                        return (
                          <div
                            key={sub.id}
                            className={`p-4 rounded-2xl border flex flex-col gap-2.5 animate-fade-in ${
                              hasGrade
                                ? "bg-amber-500/5 dark:bg-amber-500/10 border-amber-200 dark:border-amber-900/40"
                                : "bg-slate-50 dark:bg-slate-950/40 border-slate-250 dark:border-slate-850"
                            }`}
                          >
                            <div className="flex items-start justify-between min-w-0">
                              <div className="min-w-0">
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-850 text-slate-600 dark:text-slate-450 font-bold uppercase tracking-wide">
                                  {sub.section}
                                </span>
                                <h4 className="font-extrabold text-[#004d4d] dark:text-teal-400 text-xs mt-1.5 truncate uppercase">
                                  {sub.name}
                                </h4>
                              </div>
                              
                              {/* Status Badge */}
                              {hasGrade ? (
                                <span className="flex items-center gap-1 text-[9px] font-black tracking-wider uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15 py-0.5 px-2 rounded-full border border-emerald-500/20">
                                  <Award size={10} />
                                  <span>Calificada</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-500 bg-amber-500/10 dark:bg-amber-500/15 py-0.5 px-2 rounded-full border border-amber-500/20">
                                  <Clock size={10} />
                                  <span>Pendiente</span>
                                </span>
                              )}
                            </div>

                            {/* Grade card row (Active evaluation) */}
                            {hasGrade ? (
                              <div className="bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-955 p-3 rounded-xl shadow-sm flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[8px] font-black uppercase text-[#c5a059] tracking-wider leading-none">
                                    Nota Asignada
                                  </span>
                                  {gradeDate && (
                                    <span className="text-[8px] text-slate-400 font-bold font-mono">
                                      {gradeDate}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-extrabold text-amber-700 dark:text-amber-400 tracking-tight">
                                  {sub.grade}
                                </p>
                                
                                {sub.updatedAt && (
                                  <div className="text-[8.5px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 self-start select-none bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 mb-0.5">
                                    <Clock size={11} className="stroke-[2.5]" />
                                    <span>Última edición: {new Date(sub.updatedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
                                  </div>
                                )}
                                
                                {sub.feedback && (
                                  <div className="pt-2 border-t border-slate-50 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span className="block font-black uppercase text-[7px] text-slate-400 mb-0.5 tracking-wider">
                                      Retroalimentación de la Prof:
                                    </span>
                                    <p className="italic leading-relaxed animate-fade-in">
                                      "{sub.feedback}"
                                    </p>
                                  </div>
                                )}
                                
                                {sub.feedbackAttachmentUrl && (
                                  <div className="pt-2 border-t border-slate-105 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span className="block font-black uppercase text-[7px] text-[#c5a059] mb-1.5 tracking-wider">
                                      Archivo de Retroalimentación Adjunto:
                                    </span>
                                    <a
                                      href={sub.feedbackAttachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#c5a059]/10 text-[#a98139] dark:bg-[#c5a059]/15 dark:text-amber-300 border border-[#c5a059]/30 rounded-lg text-[9px] font-bold transition duration-200 active:scale-95"
                                    >
                                      <Paperclip size={10} className="stroke-[2.5]" />
                                      <span className="max-w-[200px] truncate">{sub.feedbackAttachmentName || "Ver Documento Adjunto"}</span>
                                    </a>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="bg-slate-100/50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/40 text-[9px] text-slate-500 leading-normal">
                                Tu tarea fue guardada correctamente en el sistema de la MSc. Anuvis Medina. Espera a que sea evaluada.
                              </div>
                            )}

                            {/* File delivered indicator */}
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 select-all border-t border-slate-100 dark:border-slate-850 pt-2 shrink-0">
                              <Link size={10} className="text-[#c5a059]" />
                              <span className="font-bold text-[8px] uppercase tracking-wider text-slate-400">Enlace:</span>
                              <a
                                href={sub.driveLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#c5a059] dark:text-amber-400 select-none hover:underline truncate flex-1 font-semibold text-[9px]"
                              >
                                {sub.driveLink}
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-350 select-none border border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                    <Award size={32} className="opacity-25" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2">Consulta de Evaluaciones</p>
                    <p className="text-[8px] text-center text-slate-400 px-5 mt-1 leading-normal">
                      Ingresa tu Cédula de Identidad en el buscador y presiona buscar para extraer tus calificaciones del aula.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ASSIGNMENTS VIEW */}
        {activeTab === "ASSIGNMENTS" && (
          <div className="flex-1 flex flex-col justify-between select-none">
            <div className="flex-1 flex flex-col">
              <div className="mb-4">
                <h2 className="text-sm font-black text-[#004d4d] dark:text-teal-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <span>📋 Actividades / Tareas</span>
                </h2>
                <p className="text-[9px] text-gray-500 dark:text-slate-400 mt-0.5 leading-normal font-medium">
                  Selecciona tu grado para ver el material y las actividades publicadas por la profesora MSc. Anuvis Medina.
                </p>
              </div>

              {/* Selector de Grado */}
              <div className="mb-4 flex flex-col">
                <label className="text-[8px] font-black text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                  <FileText size={10} className="text-[#004d4d] dark:text-teal-400" />
                  Grado Escolar
                </label>
                <div className="relative">
                  <select
                    id="filter-section-grade"
                    value={selectedGradeFilter}
                    onChange={(e) => setSelectedGradeFilter(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-200 dark:border-slate-800 rounded-lg bg-gray-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-bold outline-none cursor-pointer transition appearance-none focus:ring-1 focus:ring-brand-teal focus:border-brand-teal"
                  >
                    <option value="Primer Grado" className="dark:bg-slate-900">Primer Grado</option>
                    <option value="Segundo Grado" className="dark:bg-slate-900">Segundo Grado</option>
                    <option value="Tercer Grado" className="dark:bg-slate-900">Tercer Grado</option>
                    <option value="Cuarto Grado" className="dark:bg-slate-900">Cuarto Grado</option>
                    <option value="Quinto Grado" className="dark:bg-slate-900">Quinto Grado</option>
                  </select>
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              {/* View style toggle (List 📝 vs Calendar 📅) */}
              <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl mb-4 text-[10px] uppercase tracking-wider font-extrabold select-none gap-1">
                <button
                  type="button"
                  onClick={() => setAsgSubView("LIST")}
                  className={`flex-grow py-1.5 text-center transition rounded-lg ${
                    asgSubView === "LIST"
                      ? "bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-brand-teal dark:text-teal-400 shadow-sm font-black"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350"
                  }`}
                >
                  📝 Lista de Tareas
                </button>
                <button
                  type="button"
                  id="btn-calendar-visual"
                  onClick={() => setAsgSubView("CALENDAR")}
                  className={`flex-grow py-1.5 text-center transition rounded-lg ${
                    asgSubView === "CALENDAR"
                      ? "bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-brand-teal dark:text-teal-400 shadow-sm font-black"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350"
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-1">
                    <span className="relative inline-block leading-none">
                      📅
                      {hasUrgentTask && (
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 border border-white dark:border-slate-900"></span>
                        </span>
                      )}
                    </span>
                    <span>Calendario Visual</span>
                  </span>
                </button>
              </div>

              {/* List space or Calendar space based on view type selection */}
              {asgSubView === "CALENDAR" ? (
                <div className="overflow-y-auto max-h-[380px] pr-1 flex-1">
                  <AssignmentCalendar
                    assignments={assignments}
                    selectedGradeFilter={selectedGradeFilter}
                    onSelectAssignmentForSubmit={(id, title, asgSection) => {
                      if (asgSection !== "TODOS") {
                        setSection(asgSection);
                      }
                      setSelectedAssignmentId(id);
                      setSelectedAssignmentTitle(title);
                      setActiveTab("SUBMIT");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-[290px] pr-1 flex-1">
                  {assignmentsLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-2">
                      <div className="w-6 h-6 border-2 border-[#14b8a6] border-t-transparent animate-spin rounded-full"></div>
                      <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Cargando tareas publicadas...</span>
                    </div>
                  ) : assignments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-300 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/20 dark:bg-slate-950/20">
                      <FileText size={24} className="opacity-25 mb-1" />
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 select-none">Sin tareas publicadas</p>
                      <p className="text-[8px] text-center text-slate-400 px-4 mt-0.5 leading-normal">
                        No hay actividades programadas para este grado actualmente. ¡Excelente trabajo!
                      </p>
                    </div>
                  ) : (
                    assignments.map((asg) => (
                      <motion.div
                        key={asg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 rounded-[18px] border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col gap-1.5 text-slate-800 dark:text-slate-100"
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                            {asg.section === "TODOS" ? "Todos los Grados" : asg.section}
                          </span>
                          {asg.dueDate && (
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[8px] font-bold text-[#c5a059] flex items-center gap-0.5">
                                <Clock size={10} className="stroke-[2.5]" />
                                Plazo: {asg.dueDate}
                              </span>
                              {(() => {
                                const badgeInfo = getDaysUntil(asg.dueDate);
                                if (badgeInfo) {
                                  return (
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full select-none ${badgeInfo.badgeStyle}`}>
                                      {badgeInfo.text}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                        
                        <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-[11px] leading-tight flex items-center gap-1">
                          <span className="text-[#004d4d] dark:text-teal-400">📋</span>
                          {asg.title}
                        </h3>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal font-medium whitespace-pre-line">
                          {asg.description}
                        </p>

                        {asg.attachmentLink && (
                          <div className="mt-2.5 p-2 bg-slate-100/50 dark:bg-slate-900/60 border border-slate-150 dark:border-slate-805 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Paperclip size={12} className="text-brand-teal dark:text-teal-400 shrink-0" />
                              <div className="min-w-0">
                                <span className="text-[9.5px] font-bold text-slate-700 dark:text-slate-300 truncate block leading-none">
                                  {asg.attachmentName || "Material adjunto"}
                                </span>
                                <span className="text-[8px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider block mt-0.5">
                                  {asg.attachmentLink.startsWith("/api/files/") ? "Archivo de la plataforma" : "Enlace externo / Drive"}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0">
                              {asg.attachmentLink.startsWith("/api/files/") ? (
                                <>
                                  {/* Leer/Revisar en línea */}
                                  <a
                                    href={asg.attachmentLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-1 bg-brand-teal/10 hover:bg-brand-teal/15 text-brand-teal dark:text-teal-400 text-[9px] font-extrabold rounded-lg flex items-center gap-1 transition"
                                    title="Abrir o previsualizar archivo"
                                  >
                                    <ExternalLink size={10} />
                                    <span>Revisar</span>
                                  </a>
                                  {/* Descargar */}
                                  <a
                                    href={`/api/download/${asg.attachmentLink.substring("/api/files/".length)}?name=${encodeURIComponent(asg.attachmentName || "archivo")}`}
                                    className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 text-[9px] font-extrabold rounded-lg flex items-center gap-1 transition shadow-sm"
                                    title="Descargar archivo a tu dispositivo"
                                  >
                                    <Download size={10} />
                                    <span>Descargar</span>
                                  </a>
                                </>
                              ) : (
                                <a
                                  href={asg.attachmentLink.startsWith("http") ? asg.attachmentLink : `https://${asg.attachmentLink}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  referrerPolicy="no-referrer"
                                  className="px-2.5 py-1.5 bg-[#c5a059]/10 hover:bg-[#c5a059]/15 text-[#b0883f] dark:text-amber-400 text-[9px] font-extrabold rounded-lg flex items-center gap-1 transition"
                                >
                                  <ExternalLink size={10} />
                                  <span>Abrir en Drive</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Button to quickly submit this specific task */}
                        <button
                          onClick={() => {
                            if (asg.section !== "TODOS") {
                              setSection(asg.section);
                            }
                            setSelectedAssignmentId(asg.id);
                            setSelectedAssignmentTitle(asg.title);
                            setActiveTab("SUBMIT");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="mt-2 flex items-center justify-center gap-1 w-full py-2 bg-[#004d4d]/5 dark:bg-teal-500/10 hover:bg-[#004d4d] dark:hover:bg-teal-600 text-[#004d4d] dark:text-teal-400 hover:text-white dark:hover:text-white rounded-xl font-bold text-[10px] uppercase tracking-wide border border-[#004d4d]/10 dark:border-teal-500/20 shadow-sm transition active:scale-95 cursor-pointer leading-none"
                        >
                          <Send size={10} className="stroke-[2]" />
                          <span>Entregar esta Tarea</span>
                        </button>
                      </motion.div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === "CHAT" && (
          <ChatSystem 
            role="STUDENT"
            studentCi={ci || ciQuery}
            studentName={name}
            studentSection={section ? (section as any) : undefined}
            onIdentify={(identifiedCi, identifiedName, identifiedSection) => {
              setCi(identifiedCi);
              setCiQuery(identifiedCi);
              setName(identifiedName);
              setSection(identifiedSection);
            }}
          />
        )}
      </div>
    </div>
  );
}
