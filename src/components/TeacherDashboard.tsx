/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ArrowLeft, Search, Filter, CheckCircle2, Circle, ExternalLink, 
  Trash2, LogOut, RefreshCw, ClipboardCheck, GraduationCap, Clock,
  ArrowUpDown, MessageSquare, Download, Eye, FileSpreadsheet, Upload,
  FileText, FileUp, Paperclip
} from "lucide-react";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "motion/react";
import { Submission, AuthorizedStudent } from "../types";
import AestheticLogo from "./AestheticLogo";
import NotificationCenter from "./NotificationCenter";
import ChatSystem from "./ChatSystem";
import { getDaysUntil, parseDateString } from "../utils";
import { generateGradesReport } from "../utils/pdfGenerator";


const getFileNameFromDriveUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const pathname = urlObj.pathname;

    // 1. Try to find potential filename/title params
    const nameParam = urlObj.searchParams.get("title") || 
                      urlObj.searchParams.get("name") || 
                      urlObj.searchParams.get("filename");
    if (nameParam && nameParam !== "download") {
      return decodeURIComponent(nameParam);
    }

    const segments = pathname.split("/").filter(Boolean);

    // 2. File suffix or extension present in last path segment
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.includes(".") && lastSegment.length < 50) {
      const cleanSeg = decodeURIComponent(lastSegment).trim();
      if (!["view", "edit", "preview"].includes(cleanSeg.toLowerCase())) {
        return cleanSeg;
      }
    }

    let docType = "Archivo de Google Drive";
    let extractedId = "";

    // 3. Determine Google Doc Types
    if (host.includes("docs.google.com")) {
      if (pathname.includes("/document/")) {
        docType = "Doc. de Google (Docs)";
      } else if (pathname.includes("/spreadsheets/")) {
        docType = "Hoja de Google (Sheets)";
      } else if (pathname.includes("/presentation/")) {
        docType = "Pres. de Google (Slides)";
      } else if (pathname.includes("/forms/")) {
        docType = "Formulario de Google (Forms)";
      } else if (pathname.includes("/drawings/")) {
        docType = "Dibujo de Google (Drawings)";
      }
    } else if (host.includes("drive.google.com")) {
      if (pathname.includes("/folders/")) {
        docType = "Carpeta de Google Drive";
      } else {
        docType = "Archivo de Google Drive";
      }
    }

    // 4. Find Google Drive File ID
    const dIndex = segments.indexOf("d");
    if (dIndex !== -1 && segments[dIndex + 1]) {
      extractedId = segments[dIndex + 1];
    } else if (segments.includes("folders")) {
      const folderIndex = segments.indexOf("folders");
      if (folderIndex !== -1 && segments[folderIndex + 1]) {
        extractedId = segments[folderIndex + 1];
      }
    } else {
      const idParam = urlObj.searchParams.get("id");
      if (idParam) {
        extractedId = idParam;
      } else if (segments.length > 0) {
        extractedId = segments[segments.length - 1];
      }
    }

    if (extractedId) {
      extractedId = extractedId.split(/[?#]/)[0];
      const truncId = extractedId.length > 14
        ? `${extractedId.slice(0, 7)}...${extractedId.slice(-7)}`
        : extractedId;
      return `${docType} [ID: ${truncId}]`;
    }

    return "Archivo de Google Drive";
  } catch (error) {
    return "Enlace de Google Drive";
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { 
      type: "spring", 
      stiffness: 120, 
      damping: 15 
    } 
  },
};

interface TeacherDashboardProps {
  onBack: () => void;
}

export default function TeacherDashboard({ onBack }: TeacherDashboardProps) {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState("");

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"SUBMISSIONS" | "STUDENTS" | "ASSIGNMENTS" | "CHAT">("SUBMISSIONS");
  const [initialChatRoomName, setInitialChatRoomName] = useState<string | undefined>(undefined);

  const handleTabChange = (tab: "SUBMISSIONS" | "STUDENTS" | "ASSIGNMENTS" | "CHAT") => {
    setActiveTab(tab);
    if (tab !== "CHAT") {
      setInitialChatRoomName(undefined);
    }
  };

  const handleNotificationAction = (notification: any) => {
    if (notification.type === "SUBMISSION") {
      handleTabChange("SUBMISSIONS");
      setSelectedSection("ALL"); 
      const match = notification.message.match(/^([^(]+)\s*\(([^)]+)\)/);
      if (match) {
        const studentName = match[1].trim();
        setSearchQuery(studentName);
      }
    }
    else if (notification.type === "SYSTEM" && (notification.message.includes("mensaje de chat privado") || notification.title.includes("Nuevo mensaje de chat"))) {
      handleTabChange("CHAT");
      const match = notification.message.match(/El alumno\s+(.+?)\s+te ha enviado/);
      if (match) {
        const studentName = match[1].trim();
        setInitialChatRoomName(studentName);
      } else {
        setInitialChatRoomName(undefined);
      }
    }
  };

  // Data states
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Authorized students lists states
  const [allowedStudents, setAllowedStudents] = useState<AuthorizedStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");

  // Individual registration inputs
  const [adminStudentName, setAdminStudentName] = useState("");
  const [adminStudentCi, setAdminStudentCi] = useState("");
  const [adminStudentSection, setAdminStudentSection] = useState<string>("Primer Grado");

  // Bulk registration inputs
  const [bulkStudentText, setBulkStudentText] = useState("");
  const [bulkStudentSection, setBulkStudentSection] = useState<string>("Primer Grado");
  const [excelFileName, setExcelFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // Assignments states
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
  const [newAssignmentDescription, setNewAssignmentDescription] = useState("");
  const [newAssignmentSection, setNewAssignmentSection] = useState<string>("Primer Grado");
  const [newAssignmentDueDate, setNewAssignmentDueDate] = useState("");
  const [newAssignmentAttachment, setNewAssignmentAttachment] = useState("");
  const [assignmentUploadedName, setAssignmentUploadedName] = useState("");
  const [isUploadingAssignmentFile, setIsUploadingAssignmentFile] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"IDLE" | "PUBLISHING" | "SUCCESS" | "ERROR">("IDLE");
  const [publishMessage, setPublishMessage] = useState("");

  // Reminders states
  const [reminderStatuses, setReminderStatuses] = useState<Record<string, { status: "IDLE" | "SENDING" | "SUCCESS" | "ERROR"; message?: string }>>({});

  // Local lookup search bar for students
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  // Grading form states
  const [activeGradingId, setActiveGradingId] = useState<string | null>(null);
  const [gradeInput, setGradeInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [feedbackAttachmentUrl, setFeedbackAttachmentUrl] = useState("");
  const [feedbackAttachmentName, setFeedbackAttachmentName] = useState("");
  const [isUploadingFeedbackFile, setIsUploadingFeedbackFile] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);

  // Filter & Search states
  const [selectedSection, setSelectedSection] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"RECENT" | "OLDEST" | "ALPHABETICAL">("RECENT");

  // Tooltip preview state for Google Drive files
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);
  const [showExportTooltip, setShowExportTooltip] = useState(false);
  const longPressTimeout = React.useRef<any>(null);

  const handleTouchStart = (subId: string) => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
    }
    longPressTimeout.current = setTimeout(() => {
      setActiveTooltipId(subId);
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    // Keep it readable for 2.5 seconds on mobile
    setTimeout(() => {
      setActiveTooltipId(prev => prev ? null : prev);
    }, 2500);
  };

  // Demo PIN setting
  const CORRECT_PIN = "1234";

  // Check login on mount
  useEffect(() => {
    const isAlreadyLoggedIn = sessionStorage.getItem("teacher_auth") === "true";
    if (isAlreadyLoggedIn) {
      setIsAuthenticated(true);
      fetchSubmissions();
      fetchAuthorizedStudents();
      fetchAssignments();
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === CORRECT_PIN) {
      setIsAuthenticated(true);
      setAuthError("");
      sessionStorage.setItem("teacher_auth", "true");
      fetchSubmissions();
      fetchAuthorizedStudents();
      fetchAssignments();
    } else {
      setAuthError("PIN Incorrecto. Intenta con '1234' para demostración.");
      setPin("");
    }
  };

  const fetchSubmissions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/submissions");
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data);
      } else {
        setError("Error al obtener los datos del servidor.");
      }
    } catch (err) {
      setError("Error de red al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAuthorizedStudents = async () => {
    setStudentsLoading(true);
    setStudentsError("");
    try {
      const response = await fetch("/api/authorized-students");
      if (response.ok) {
        const data = await response.json();
        setAllowedStudents(data);
      } else {
        setStudentsError("Error al cargar la lista de alumnos autorizados.");
      }
    } catch (err) {
      setStudentsError("Error de red al conectar con el listado de alumnos.");
    } finally {
      setStudentsLoading(false);
    }
  };

  const fetchAssignments = async () => {
    setAssignmentsLoading(true);
    try {
      const response = await fetch("/api/assignments");
      if (response.ok) {
        const data = await response.json();
        setAllAssignments(data);
      }
    } catch (err) {
      console.error("Error loading assignments for teacher:", err);
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const handleAssignmentFileUpload = async (file: File) => {
    setIsUploadingAssignmentFile(true);
    setPublishStatus("IDLE");
    setPublishMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setNewAssignmentAttachment(data.url);
        setAssignmentUploadedName(data.originalName);
      } else {
        const errData = await response.json();
        setPublishStatus("ERROR");
        setPublishMessage(errData.error || "Error al subir el archivo.");
      }
    } catch (err) {
      setPublishStatus("ERROR");
      setPublishMessage("Error de comunicación de red al subir el archivo.");
    } finally {
      setIsUploadingAssignmentFile(false);
    }
  };

  const handlePublishAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssignmentTitle.trim() || !newAssignmentDescription.trim()) {
      setPublishStatus("ERROR");
      setPublishMessage("El título y la descripción son campos obligatorios.");
      return;
    }

    if (newAssignmentDueDate.trim()) {
      const parsedDate = parseDateString(newAssignmentDueDate.trim());
      if (parsedDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const targetMidnight = new Date(parsedDate.getTime());
        targetMidnight.setHours(0, 0, 0, 0);

        if (targetMidnight.getTime() < today.getTime()) {
          setPublishStatus("ERROR");
          setPublishMessage(`La fecha de entrega (${newAssignmentDueDate}) ya ha pasado. Por favor ingresa una fecha futura.`);
          return;
        }
      }
    }

    setPublishStatus("PUBLISHING");
    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newAssignmentTitle.trim(),
          description: newAssignmentDescription.trim(),
          section: newAssignmentSection,
          dueDate: newAssignmentDueDate.trim(),
          attachmentLink: newAssignmentAttachment.trim(),
          attachmentName: assignmentUploadedName.trim()
        })
      });
      if (response.ok) {
        setPublishStatus("SUCCESS");
        setPublishMessage("¡La tarea se ha publicado con éxito!");
        setNewAssignmentTitle("");
        setNewAssignmentDescription("");
        setNewAssignmentDueDate("");
        setNewAssignmentAttachment("");
        setAssignmentUploadedName("");
        fetchAssignments();
        setTimeout(() => {
          setPublishStatus("IDLE");
          setPublishMessage("");
        }, 3000);
      } else {
        const errData = await response.json();
        setPublishStatus("ERROR");
        setPublishMessage(errData.error || "Ocurrió un error al publicar la tarea.");
      }
    } catch (err) {
      setPublishStatus("ERROR");
      setPublishMessage("No se pudo conectar con el servidor.");
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm("¿Estás segura de eliminar esta tarea asignada? Los alumnos correspondientes ya no podrán visualizarla.")) return;
    try {
      const response = await fetch(`/api/assignments/${id}`, { method: "DELETE" });
      if (response.ok) {
        fetchAssignments();
      }
    } catch (err) {
      console.error("Error deleting assignment:", err);
    }
  };

  const handleSendReminder = async (assignmentId: string, assignmentTitle: string) => {
    if (!confirm(`¿Estás segura de enviar una notificación de recordatorio a todos los alumnos de este grado que aún no han entregado la tarea: "${assignmentTitle}"?`)) {
      return;
    }

    setReminderStatuses(prev => ({
      ...prev,
      [assignmentId]: { status: "SENDING" }
    }));

    try {
      const response = await fetch(`/api/assignments/${assignmentId}/remind-pending`, {
        method: "POST",
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setReminderStatuses(prev => ({
          ...prev,
          [assignmentId]: { status: status === "IDLE" ? "IDLE" : "SUCCESS", message: data.message }
        }));
        setReminderStatuses(prev => ({
          ...prev,
          [assignmentId]: { status: "SUCCESS", message: data.message }
        }));
        
        // Reset after 4 seconds
        setTimeout(() => {
          setReminderStatuses(prev => ({
            ...prev,
            [assignmentId]: { status: "IDLE" }
          }));
        }, 4000);
      } else {
        setReminderStatuses(prev => ({
          ...prev,
          [assignmentId]: { status: "ERROR", message: data.error || "No se pudo enviar el recordatorio." }
        }));
      }
    } catch (err) {
      console.error("Error sending reminders:", err);
      setReminderStatuses(prev => ({
        ...prev,
        [assignmentId]: { status: "ERROR", message: "Error de conexión." }
      }));
    }
  };

  const handleFeedbackFileUpload = async (file: File) => {
    setIsUploadingFeedbackFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setFeedbackAttachmentUrl(data.url);
        setFeedbackAttachmentName(data.originalName);
      } else {
        alert("Error al subir el archivo complementario.");
      }
    } catch (err) {
      alert("Error de comunicación al subir el archivo.");
    } finally {
      setIsUploadingFeedbackFile(false);
    }
  };

  const handleSaveGrade = async (subId: string) => {
    try {
      const response = await fetch(`/api/submissions/${subId}/grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          grade: gradeInput.trim(),
          feedback: feedbackInput.trim(),
          feedbackAttachmentUrl: feedbackAttachmentUrl,
          feedbackAttachmentName: feedbackAttachmentName
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Update local state list
        setSubmissions(prev =>
          prev.map(sub => sub.id === subId ? data.submission : sub)
        );
        setActiveGradingId(null);
        setGradeInput("");
        setFeedbackInput("");
        setFeedbackAttachmentUrl("");
        setFeedbackAttachmentName("");
      } else {
        alert("Error al guardar la calificación.");
      }
    } catch (err) {
      alert("Error de red al calificar.");
    }
  };

  const handleExportExcel = (section: string) => {
    try {
      // Filter students based on section
      const targetStudents = section === "ALL" 
        ? allowedStudents 
        : allowedStudents.filter(s => s.section === section);

      // Filter assignments based on section
      const targetAssignments = section === "ALL"
        ? allAssignments
        : allAssignments.filter(a => a.section === section || a.section === "TODOS");

      if (targetStudents.length === 0) {
        alert("No hay alumnos registrados en este grado para exportar.");
        return;
      }

      // Map out assignments for columns
      const data = targetStudents.map(student => {
        const studentSubs = submissions.filter(sub => sub.ci.replace(/\D/g, "") === student.ci.replace(/\D/g, ""));
        
        // Base details
        const row: any = {
          "Cédula": student.ci,
          "Nombre Completo": student.name,
          "Grado": student.section,
        };

        // Add column for each assignment
        let deliveredCount = 0;
        let gradedCount = 0;

        targetAssignments.forEach(asg => {
          const sub = studentSubs.find(s => s.assignmentId === asg.id || (s.comments && s.comments.toLowerCase().includes(asg.title.toLowerCase())));
          if (sub) {
            deliveredCount++;
            if (sub.grade) {
              gradedCount++;
              row[asg.title] = sub.grade;
            } else {
              row[asg.title] = "Entregado (Sin Nota)";
            }
          } else {
            row[asg.title] = "No Entregado";
          }
        });

        row["Total Tareas"] = targetAssignments.length;
        row["Entregadas"] = deliveredCount;
        row["Evaluadas"] = gradedCount;
        row["Pendientes"] = targetAssignments.length - deliveredCount;
        row["% de Cumplimiento"] = targetAssignments.length > 0 
          ? Math.round((deliveredCount / targetAssignments.length) * 100) + "%"
          : "0%";

        return row;
      });

      // Create sheet
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Auto-fit column widths
      const maxProps = Object.keys(data[0] || {}).map(key => {
        let maxLength = key.length;
        data.forEach(row => {
          const val = row[key];
          if (val !== undefined && val !== null) {
            maxLength = Math.max(maxLength, String(val).length);
          }
        });
        return { wch: Math.max(maxLength + 2, 11) };
      });
      worksheet["!cols"] = maxProps;

      // Create workbook and append worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Rendimiento Escolar");

      // Write file
      const dateStr = new Date().toISOString().slice(0, 10);
      const cleanSection = section === "ALL" ? "Todos_los_Grados" : section.replace(/\s+/g, "_");
      const fileName = `Control_Notas_${cleanSection}_${dateStr}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error("Error al exportar a Excel:", err);
      alert("Hubo un error al generar el archivo de Excel.");
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminStudentName.trim() || !adminStudentCi.trim()) {
      alert("Ambos campos (Nombre y Cédula) son obligatorios.");
      return;
    }

    try {
      const response = await fetch("/api/authorized-students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: adminStudentName.trim(),
          ci: adminStudentCi.trim(),
          section: adminStudentSection
        })
      });

      if (response.ok) {
        await fetchAuthorizedStudents();
        setAdminStudentName("");
        setAdminStudentCi("");
        alert("¡Alumno registrado con éxito!");
      } else {
        const errData = await response.json();
        alert(errData.error || "No se pudo agregar al alumno.");
      }
    } catch (err) {
      alert("Error de red al agregar.");
    }
  };

  // Process the uploaded Excel/CSV/Text file on the client
  const processRosterFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (!result) return;

        let parsedLines: string[] = [];
        let importedCount = 0;

        // Reading file as an Array Buffer and passing to sheetjs is incredibly robust
        // sheetjs natively parses CSV, TSV, XLS, XLSX, and text files.
        const data = new Uint8Array(result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse sheet to array of arrays
        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        for (const row of jsonData) {
          if (!row || row.length === 0) continue;
          
          // Map to cell values as strings
          const cellValues = row.map(cell => cell !== null && cell !== undefined ? String(cell).trim() : "");
          
          // Check if it has header signatures
          const isHeader = cellValues.some(val => {
            const lower = val.toLowerCase();
            return lower === "cedula" || lower === "cédula" || lower === "ci" || lower === "c.i." || lower === "nombre" || lower === "apellido" || lower === "estudiante" || lower === "alumno" || lower === "nombre completo" || lower === "nombres";
          });
          
          // Heuristic: If it looks like a header row and does not contain actual student C.I., skip it.
          const hasBigNumber = cellValues.some(val => /^\d{5,10}$/.test(val.replace(/\D/g, "")));
          if (isHeader && !hasBigNumber) {
            continue;
          }
          
          let ciValue = "";
          let nameValue = "";
          
          // Try to locate columns by content analysis
          // We look for a cell with digits (CI) and a cell with letters (Name, including accents)
          for (const cell of cellValues) {
            if (!cell) continue;
            const normCell = cell.replace(/\D/g, "");
            if (!ciValue && /^\d+$/.test(normCell) && normCell.length >= 5 && normCell.length <= 11) {
              ciValue = normCell;
            } else if (!nameValue && /[a-zA-ZáéíóúñÁÉÍÓÚÑ]{2,}/.test(cell) && !cell.toLowerCase().includes("http") && !cell.includes("@")) {
              nameValue = cell;
            }
          }
          
          // Fallback: If heuristic failed, check if we have multiple cell values, and take column indices
          if (!ciValue || !nameValue) {
            const filteredCells = cellValues.filter(Boolean);
            if (filteredCells.length >= 2) {
              const firstNumIdx = filteredCells.findIndex(v => /^\d+$/.test(v.replace(/\D/g, "")) && v.replace(/\D/g, "").length >= 4);
              if (firstNumIdx !== -1) {
                ciValue = filteredCells[firstNumIdx].replace(/\D/g, "");
                const names = filteredCells.filter((_, idx) => idx !== firstNumIdx);
                if (names.length > 0) {
                  nameValue = names[0];
                }
              } else {
                // If no clear match, columns 0 and 1
                ciValue = filteredCells[0].replace(/\D/g, "");
                nameValue = filteredCells[1];
              }
            }
          }
          
          if (ciValue && nameValue && ciValue.length >= 4) {
            // Clean up name
            const cleanName = nameValue.replace(/["']/g, "").trim().toUpperCase();
            parsedLines.push(`${ciValue}, ${cleanName}`);
            importedCount++;
          }
        }

        if (parsedLines.length > 0) {
          setBulkStudentText(parsedLines.join("\n"));
          setExcelFileName(file.name);
          alert(`¡Archivo procesado con éxito!\nSe detectaron ${importedCount} alumnos en el archivo Excel/CSV "${file.name}".\n\nPuedes ver la lista en el cuadro de texto de abajo y hacer cambios manuales si fuera necesario.\nPara guardarla en el sistema, presiona el botón "Procesar Roster Masivo 💼".`);
        } else {
          alert("No se encontraron registros válidos de estudiantes en el archivo. El archivo debe contener al menos una columna con Cédulas de Identidad (números) y otra columna con el Nombre del alumno.");
        }
      } catch (err) {
        console.error("Error reading file:", err);
        alert("Hubo un error al leer el archivo. Asegúrate de que corresponda a un archivo Excel (.xlsx, .xls) o CSV válido.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkStudentText.trim()) {
      alert("Debes pegar o escribir el texto de los alumnos, o cargar un archivo Excel.");
      return;
    }

    try {
      const response = await fetch("/api/authorized-students/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          section: bulkStudentSection,
          studentsText: bulkStudentText
        })
      });

      if (response.ok) {
        const result = await response.json();
        await fetchAuthorizedStudents();
        setBulkStudentText("");
        setExcelFileName("");
        alert(`¡Roster Cargado! Se importaron ${result.count} alumnos de la Sección ${bulkStudentSection} exitosamente.`);
      } else {
        const errData = await response.json();
        alert(errData.error || "Error al importar.");
      }
    } catch (err) {
      alert("Error de red al importar.");
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este alumno de la lista autorizada? No podrá realizar nuevas entregas de tarea.")) {
      return;
    }

    try {
      const response = await fetch(`/api/authorized-students/${id}`, {
        method: "DELETE"
      });

      if (response.ok) {
        setAllowedStudents(prev => prev.filter(s => s.id !== id));
      } else {
        alert("No se pudo eliminar de la lista.");
      }
    } catch (err) {
      alert("Error de red al eliminar.");
    }
  };

  const toggleReviewed = async (id: string) => {
    try {
      const response = await fetch(`/api/submissions/${id}/toggle-review`, {
        method: "POST",
      });
      if (response.ok) {
        // Update local list
        setSubmissions(prev => 
          prev.map(sub => sub.id === id ? { ...sub, reviewed: !sub.reviewed } : sub)
        );
      }
    } catch (err) {
      alert("Error de conexión al marcar como revisada.");
    }
  };

  const deleteSubmission = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este registro de entrega?")) {
      return;
    }
    try {
      const response = await fetch(`/api/submissions/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSubmissions(prev => prev.filter(sub => sub.id !== id));
      }
    } catch (err) {
      alert("Error de conexión al eliminar.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("teacher_auth");
  };

  const handleExportCSV = () => {
    const listToExport = sortedSubmissions;
    if (listToExport.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    // Header structure: Nombre, cédula, sección, enlace y estado
    const headers = ["Nombre", "Cédula", "Sección", "Enlace Google Drive", "Estado", "Comentarios", "Fecha de Envío"];

    const rows = listToExport.map(sub => [
      sub.name,
      sub.ci,
      sub.section,
      sub.driveLink,
      sub.reviewed ? "Calificada" : "Pendiente",
      sub.comments || "",
      new Date(sub.createdAt).toLocaleString("es-ES"),
    ]);

    // Build standard comma-separated values (CSV)
    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(value => {
          const stringVal = String(value).replace(/"/g, '""');
          return `"${stringVal}"`;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    const sectionSuffix = selectedSection === "ALL" ? "" : `_seccion_${selectedSection}`;
    link.setAttribute("download", `entregas_tareas${sectionSuffix}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter & search implementation
  const sortedSubmissions = (() => {
    const filtered = submissions.filter((sub) => {
      const matchesSection = selectedSection === "ALL" || sub.section === selectedSection;
      
      const cleanSearch = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !cleanSearch || 
        sub.name.toLowerCase().includes(cleanSearch) || 
        sub.ci.includes(cleanSearch);

      return matchesSection && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "OLDEST") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === "ALPHABETICAL") {
        return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      } else { // RECENT is default
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  })();

  // Calculate statistics based on selected grade/section
  const statsSubmissions = selectedSection === "ALL" 
    ? submissions 
    : submissions.filter(s => s.section === selectedSection);
  const totalCount = statsSubmissions.length;
  const reviewedCount = statsSubmissions.filter(s => s.reviewed).length;
  const pendingCount = totalCount - reviewedCount;

  // Helper to categorize grades for the selected section
  const getGradeCategory = (g: string | undefined) => {
    if (!g) return "Sin Nota";
    const clean = g.trim().toLowerCase();
    if (clean.includes("excelente") || clean.includes("sobresaliente") || ["a", "a+", "ad"].includes(clean)) return "Excelente / A";
    if (clean.includes("bueno") || ["b", "c"].includes(clean)) return "Bueno / B-C";
    if (clean.includes("regular") || ["d"].includes(clean)) return "Regular / D";
    if (clean.includes("reprobado") || ["e", "f"].includes(clean)) return "Debe Mejorar / E-F";
    
    // Parse numeric out of 20
    const numMatch = clean.match(/^(\d+)/);
    if (numMatch) {
      const score = parseInt(numMatch[1], 10);
      if (score >= 18) return "Excelente / A";
      if (score >= 14) return "Bueno / B-C";
      if (score >= 10) return "Regular / D";
      return "Debe Mejorar / E-F";
    }
    return "Excelente / A"; // Fallback
  };

  const gradedSubmissions = statsSubmissions.filter(s => s.reviewed && s.grade);

  const gradeCounts = { excelente: 0, bueno: 0, regular: 0, debeMejorar: 0 };
  gradedSubmissions.forEach(sub => {
    const cat = getGradeCategory(sub.grade);
    if (cat === "Excelente / A") gradeCounts.excelente++;
    else if (cat === "Bueno / B-C") gradeCounts.bueno++;
    else if (cat === "Regular / D") gradeCounts.regular++;
    else if (cat === "Debe Mejorar / E-F") gradeCounts.debeMejorar++;
  });

  const totalGraded = gradedSubmissions.length;
  const targetStudentsForStats = selectedSection === "ALL"
    ? allowedStudents
    : allowedStudents.filter(s => s.section === selectedSection);
  const targetAssignmentsForStats = selectedSection === "ALL"
    ? allAssignments
    : allAssignments.filter(a => a.section === selectedSection || a.section === "TODOS");

  // Inactive students in this section (students with 0 submissions in general or for target assignments)
  const inactiveStudents = targetStudentsForStats.filter(st => {
    const cleanCi = st.ci.replace(/\D/g, "");
    const studentSubs = submissions.filter(s => s.ci.replace(/\D/g, "") === cleanCi);
    return studentSubs.length === 0;
  });

  // Render Lock Screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-5 py-12 animate-fade-in font-sans">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800/80 shadow-xl shadow-slate-200/50 dark:shadow-none transition-colors duration-300">
          <div className="flex justify-start mb-4">
            <button
              id="btn-login-back"
              onClick={onBack}
              className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition active:scale-95 flex items-center space-x-1 text-xs font-semibold cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Volver</span>
            </button>
          </div>

          <div className="mb-6 flex flex-col items-center">
            <AestheticLogo size="sm" />
            <h2 className="text-xl font-bold text-brand-teal dark:text-teal-400 mt-6 font-sans">Acceso Profesora</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center leading-relaxed">
              Ingresa el código PIN para acceder al panel de administración de las entregas.
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100/40 dark:border-rose-900/40 text-rose-700 dark:text-rose-455 text-xs font-bold rounded-xl text-center">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5 text-center">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-widest font-sans">
                Código PIN
              </label>
              <input
                id="pin-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="&bull; &bull; &bull; &bull;"
                className="w-full text-center text-2xl tracking-[0.5em] font-extrabold px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-brand-teal dark:focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-350 dark:placeholder-slate-600 focus:ring-1 focus:ring-brand-teal dark:focus:ring-teal-500 outline-none transition"
              />
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 p-2.5 rounded-xl text-center text-xs leading-relaxed font-semibold">
              🔑 PIN demo: <strong className="text-amber-805 dark:text-amber-300">1234</strong>
            </div>

            <button
              id="btn-auth-submit"
              type="submit"
              className="w-full py-3.5 bg-brand-teal dark:bg-teal-600 hover:bg-brand-teal/95 dark:hover:bg-teal-550 text-white font-bold rounded-xl transition shadow-lg active:scale-[0.98] cursor-pointer"
            >
              Ingresar al Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-4 py-5 font-sans">
      {/* Top action header */}
      <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto w-full mb-5">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-brand-teal/10 dark:bg-teal-500/10 rounded-xl text-brand-teal dark:text-teal-400">
            <ClipboardCheck size={22} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-brand-teal dark:text-teal-400 leading-none uppercase">Panel de Control</h2>
            <p className="text-[9px] uppercase font-bold tracking-wider text-brand-gold dark:text-amber-450 mt-1">
              PROFE ANUVIS MEDINA
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <div className="relative inline-block">
            <AnimatePresence>
              {showExportTooltip && (
                <motion.div
                  id="export-csv-tooltip"
                  role="tooltip"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-100 text-[10px] font-semibold rounded-lg shadow-md whitespace-nowrap z-50 pointer-events-none flex flex-col items-center"
                >
                  <span>Exportar lista a CSV</span>
                  <div className="w-1.5 h-1.5 bg-slate-900 dark:bg-slate-800 rotate-45 -mt-0.5" />
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              id="btn-export-csv"
              onClick={handleExportCSV}
              disabled={sortedSubmissions.length === 0}
              onMouseEnter={() => setShowExportTooltip(true)}
              onMouseLeave={() => setShowExportTooltip(false)}
              onFocus={() => setShowExportTooltip(true)}
              onBlur={() => setShowExportTooltip(false)}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              whileTap={{ scale: 0.92 }}
              className="flex items-center space-x-1.5 py-2 px-3.5 rounded-xl bg-brand-teal/5 dark:bg-teal-500/10 hover:bg-brand-teal/10 dark:hover:bg-teal-500/25 text-brand-teal dark:text-teal-400 text-xs font-black border-2 border-brand-teal/80 dark:border-teal-500/60 shadow-md shadow-brand-teal/5 dark:shadow-none transition-colors duration-200 disabled:opacity-50 cursor-pointer"
              title="Exportar tareas a CSV"
              aria-describedby="export-csv-tooltip"
            >
              <Download size={14} />
              <span>Exportar CSV</span>
            </motion.button>
          </div>
          <button
            id="btn-refresh"
            onClick={fetchSubmissions}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-350 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Refrescar lista"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          
          <NotificationCenter role="TEACHER" onNotificationAction={handleNotificationAction} />

          <button
            id="btn-logout"
            onClick={handleLogout}
            className="flex items-center space-x-1 py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-xs font-bold border border-rose-200/50 dark:border-rose-800/40 transition active:scale-95 cursor-pointer"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-3 gap-3 max-w-5xl mx-auto w-full mb-4">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Entregas</span>
          <div className="flex items-baseline space-x-1 mt-1 justify-between">
            <span className="text-xl sm:text-2xl font-black text-brand-teal dark:text-teal-400">{totalCount}</span>
            <GraduationCap className="text-brand-teal/20 dark:text-teal-500/20 shrink-0" size={18} />
          </div>
        </div>
        <div className="bg-teal-50/50 dark:bg-teal-950/15 p-3 rounded-2xl border border-teal-100/50 dark:border-teal-900/30 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-brand-teal dark:text-teal-400 uppercase tracking-wider">Calificadas</span>
          <div className="flex items-baseline space-x-1 mt-1 justify-between">
            <span className="text-xl sm:text-2xl font-black text-brand-teal dark:text-teal-400">{reviewedCount}</span>
            <CheckCircle2 className="text-brand-gold/30 dark:text-amber-400/35 shrink-0" size={17} />
          </div>
        </div>
        <div className="bg-amber-50/50 dark:bg-amber-950/15 p-3 rounded-2xl border border-amber-100/50 dark:border-amber-900/30 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Pendientes</span>
          <div className="flex items-baseline space-x-1 mt-1 justify-between">
            <span className="text-xl sm:text-2xl font-black text-amber-800 dark:text-amber-300">{pendingCount}</span>
            <Clock className="text-brand-gold/30 dark:text-amber-400/35 shrink-0" size={17} />
          </div>
        </div>
      </div>

      {/* Expandable School Statistics Dashboard Panel */}
      <div className="max-w-5xl mx-auto w-full mb-6">
        <button
          type="button"
          onClick={() => setShowStatsPanel(!showStatsPanel)}
          className="w-full py-2.5 px-4 rounded-xl border border-dashed border-brand-teal/40 dark:border-teal-500/40 bg-brand-teal/[0.02] dark:bg-teal-500/[0.02] hover:bg-brand-teal/5 dark:hover:bg-teal-500/5 text-brand-teal dark:text-teal-400 font-sans text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-sm select-none"
        >
          <span>{showStatsPanel ? "▲ Ocultar Reporte de Rendimiento Escolar" : "📊 Ver Panel de Estadísticas y Rendimiento Escolar"}</span>
        </button>

        <AnimatePresence>
          {showStatsPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 overflow-hidden shadow-md font-sans space-y-5"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 dark:border-slate-850 pb-3 gap-2">
                <div>
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📊 Rendimiento Escolar & Estadísticas</span>
                    <span className="text-[10px] bg-brand-teal/10 px-2 py-0.5 rounded-full text-brand-teal font-extrabold normal-case">
                      {selectedSection === "ALL" ? "Todos los Grados" : selectedSection}
                    </span>
                  </h3>
                  <p className="text-[10.5px] text-slate-500 mt-0.5 leading-normal">Métricas recolectadas de tareas entregadas, autorizaciones y calificaciones registradas en tiempo real para este nivel escolar.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExportExcel(selectedSection)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-xl transition active:scale-95 shadow-sm cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet size={12} />
                  <span>Exportar Notas a Excel</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Visual Grade Distribution bar chart */}
                <div className="bg-slate-50/50 dark:bg-slate-950/20 rounded-xl p-4 border border-slate-150 dark:border-slate-850 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest block mb-4">
                      Distribución de Calificaciones
                    </span>
                    {totalGraded === 0 ? (
                      <div className="h-28 flex items-center justify-center text-[11px] text-slate-400 text-center leading-normal italic">
                        No hay tareas calificadas en este grupo aún para calcular rangos de notas.
                      </div>
                    ) : (
                      <div className="space-y-3 font-sans">
                        {[
                          { label: "Excelente / Sobresaliente (18-20 / A)", count: gradeCounts.excelente, color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
                          { label: "Bueno / Aprobado (14-17 / B-C)", count: gradeCounts.bueno, color: "bg-teal-500", text: "text-teal-600 dark:text-teal-400" },
                          { label: "Regular / Suficiente (10-13 / D)", count: gradeCounts.regular, color: "bg-amber-500", text: "text-amber-500" },
                          { label: "Debe Mejorar / Reprobado (<10 / E-F)", count: gradeCounts.debeMejorar, color: "bg-rose-500", text: "text-rose-500" }
                        ].map((item) => {
                          const pct = totalGraded > 0 ? Math.round((item.count / totalGraded) * 100) : 0;
                          return (
                            <div key={item.label} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-650 dark:text-slate-450 truncate max-w-[150px]">{item.label}</span>
                                <span className={item.text}>{item.count} ({pct}%)</span>
                              </div>
                              <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery and response rates */}
                <div className="bg-slate-50/50 dark:bg-slate-950/20 rounded-xl p-4 border border-slate-150 dark:border-slate-850 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest block mb-4">
                      Tasa de Cumplimiento Escolar
                    </span>
                    
                    <div className="flex flex-col items-center justify-center py-2 space-y-3 font-sans">
                      <div className="relative w-24 h-24 flex items-center justify-center">
                        {/* Circular ring tracker */}
                        {(() => {
                          const studentsNum = targetStudentsForStats.length;
                          const assignmentsNum = targetAssignmentsForStats.length;
                          const totalExpected = studentsNum * assignmentsNum;
                          const deliveryRate = totalExpected > 0 ? Math.round((statsSubmissions.length / totalExpected) * 100) : 0;
                          
                          // SVG dasharray / circular progress
                          const r = 38;
                          const circ = 2 * Math.PI * r;
                          const strokePct = ((100 - Math.min(100, deliveryRate)) / 100) * circ;

                          return (
                            <>
                              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle
                                  cx="50"
                                  cy="50"
                                  r={r}
                                  className="stroke-slate-100 dark:stroke-slate-800 fill-none"
                                  strokeWidth="10"
                                />
                                <circle
                                  cx="50"
                                  cy="50"
                                  r={r}
                                  className="stroke-brand-teal dark:stroke-teal-500 fill-none transition-all duration-500"
                                  strokeWidth="10"
                                  strokeDasharray={circ}
                                  strokeDashoffset={strokePct}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute text-center">
                                <span className="text-base font-black text-slate-800 dark:text-white block leading-none">{deliveryRate}%</span>
                                <span className="text-[8.5px] text-slate-500 font-bold block mt-0.5">Entregas</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="w-full text-[10px] space-y-1.5 text-slate-650 dark:text-slate-350 font-bold">
                        <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1">
                          <span>Alumnos Autorizados:</span>
                          <span className="text-slate-800 dark:text-slate-100">{targetStudentsForStats.length}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-1">
                          <span>Tareas Asignadas:</span>
                          <span className="text-slate-800 dark:text-slate-100">{targetAssignmentsForStats.length}</span>
                        </div>
                        <div className="flex justify-between pb-1">
                          <span>Tareas Recibidas:</span>
                          <span className="text-slate-800 dark:text-slate-100">{statsSubmissions.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Follow-up / alert list */}
                <div className="bg-slate-50/50 dark:bg-slate-950/20 rounded-xl p-4 border border-slate-150 dark:border-slate-850 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest block mb-2">
                      Seguimiento Alumnos ({inactiveStudents.length})
                    </span>
                    <span className="text-[8.5px] text-slate-500 block mb-3 font-sans leading-normal">
                      Estudiantes que aún no registran ninguna entrega. Copia una plantilla cordial para contactar al representante.
                    </span>

                    {inactiveStudents.length === 0 ? (
                      <div className="h-28 flex items-center justify-center text-[10px] text-emerald-600 dark:text-emerald-400 text-center font-bold bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 leading-normal">
                        🎉 ¡Todos los alumnos autorizados de este grado ya han entregado al menos una tarea!
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {inactiveStudents.map((student) => (
                          <div key={student.id} className="flex justify-between items-center p-2 rounded-lg bg-orange-500/5 border border-orange-500/10 text-[10px] transition-colors hover:bg-orange-500/10">
                            <div className="min-w-0 font-sans">
                              <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{student.name}</span>
                              <span className="text-[8.5px] text-amber-600 dark:text-amber-400 font-bold block mt-0.5">CI: {student.ci}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const msgText = `Buenas tardes Estimado Representante. Le escribe la Profesora Anuvis Medina. Le informo que el alumno ${student.name} tiene tareas escolares pendientes de entrega en nuestro portal escolar. Por favor, comuníquese conmigo o ingrese al portal para ponerse al día. ¡Muchas gracias!`;
                                navigator.clipboard.writeText(msgText);
                                alert(`¡Mensaje de recordatorio para el representante de ${student.name} copiado al portapapeles!\n\nYa puedes pegarlo directamente en WhatsApp.`);
                              }}
                              className="px-2 py-1 bg-amber-55 hover:bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 font-black rounded-lg transition text-[8.5px] uppercase tracking-wider shrink-0"
                              title="Copiar mensaje escolar para representante"
                            >
                              Copiar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Triple Tab Switcher */}
      <div className="flex flex-col md:flex-row bg-white dark:bg-slate-900 border border-slate-155 dark:border-slate-800 rounded-2xl p-1 max-w-5xl mx-auto w-full mb-6 font-bold text-xs select-none shadow-sm gap-1">
        <button
          onClick={() => handleTabChange("SUBMISSIONS")}
          className={`flex-1 py-2.5 rounded-xl text-center transition cursor-pointer font-extrabold flex items-center justify-center gap-2 ${
            activeTab === "SUBMISSIONS"
              ? "bg-brand-teal text-white hover:opacity-95"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        >
          <ClipboardCheck size={14} />
          <span>Ver Entregas ({submissions.length})</span>
        </button>
        <button
          onClick={() => handleTabChange("ASSIGNMENTS")}
          className={`flex-1 py-2.5 rounded-xl text-center transition cursor-pointer font-extrabold flex items-center justify-center gap-2 ${
            activeTab === "ASSIGNMENTS"
              ? "bg-brand-teal text-white hover:opacity-95"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        >
          <FileText size={14} />
          <span>Asignar Tareas ({allAssignments.length})</span>
        </button>
        <button
          onClick={() => handleTabChange("STUDENTS")}
          className={`flex-1 py-2.5 rounded-xl text-center transition cursor-pointer font-extrabold flex items-center justify-center gap-2 ${
            activeTab === "STUDENTS"
              ? "bg-brand-teal text-white hover:opacity-95"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        >
          <GraduationCap size={14} />
          <span>Alumnos Autorizados ({allowedStudents.length})</span>
        </button>
        <button
          onClick={() => handleTabChange("CHAT")}
          className={`flex-1 py-2.5 rounded-xl text-center transition cursor-pointer font-extrabold flex items-center justify-center gap-2 ${
            activeTab === "CHAT"
              ? "bg-brand-teal text-white hover:opacity-95"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          }`}
        >
          <MessageSquare size={14} />
          <span>Buzón de Chat 💬</span>
        </button>
      </div>

      {activeTab === "SUBMISSIONS" && (
        <>
          {/* Filters and Search Bar Container */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm max-w-5xl mx-auto w-full mb-6 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="input-teacher-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o cédula..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:bg-white dark:focus:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-brand-teal dark:focus:border-teal-500 focus:ring-1 focus:ring-brand-teal dark:focus:ring-teal-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
              {/* Section Filter with mini pill tabs */}
              <div className="space-y-1.5 font-sans">
                <div className="flex justify-between items-center sm:items-baseline">
                  <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Filter size={11} className="text-brand-teal dark:text-teal-400" />
                    Filtrar Grado
                  </span>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        generateGradesReport({
                          submissions,
                          allowedStudents,
                          assignments: allAssignments,
                          selectedSection,
                        });
                      }}
                      title={`Exportar calificaciones de ${selectedSection === "ALL" ? "Todos los Grados" : selectedSection} a PDF`}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[8.5px] font-black uppercase text-[#004d4d] dark:text-teal-400 hover:text-white hover:bg-[#004d4d] dark:hover:bg-teal-500 dark:hover:text-white border border-[#004d4d]/30 dark:border-teal-400/30 hover:border-transparent rounded-lg transition active:scale-[0.97] cursor-pointer shadow-xs select-none"
                    >
                      <Download size={9} className="stroke-[2.5]" />
                      <span>PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleExportExcel(selectedSection);
                      }}
                      title={`Exportar calificaciones de ${selectedSection === "ALL" ? "Todos los Grados" : selectedSection} a Excel`}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[8.5px] font-black uppercase text-emerald-800 dark:text-emerald-400 hover:text-white hover:bg-emerald-600 dark:hover:bg-emerald-500 dark:hover:text-white border border-emerald-600/35 dark:border-emerald-400/30 hover:border-transparent rounded-lg transition active:scale-[0.97] cursor-pointer shadow-xs select-none"
                    >
                      <FileSpreadsheet size={9} className="stroke-[2.5]" />
                      <span>Excel</span>
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", "Primer Grado", "Segundo Grado", "Tercer Grado", "Cuarto Grado", "Quinto Grado"].map((sect) => (
                    <button
                      key={sect}
                      onClick={() => setSelectedSection(sect)}
                      className={`py-1.5 px-3.5 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer ${
                        selectedSection === sect
                          ? "bg-brand-teal dark:bg-teal-600 text-white shadow-sm"
                          : "bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/50 dark:border-slate-850"
                      }`}
                    >
                      {sect === "ALL" ? "Todos" : sect}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort By options */}
              <div className="space-y-1.5 font-sans">
                <span className="text-[9px] font-extrabold text-[#94a3b8] dark:text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <ArrowUpDown size={11} className="text-brand-teal dark:text-teal-400" />
                  Ordenar por
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "RECENT", label: "Más recientes" },
                    { value: "OLDEST", label: "Más antiguas" },
                    { value: "ALPHABETICAL", label: "Nombre (A-Z)" }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value as any)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer ${
                        sortBy === opt.value
                          ? "bg-brand-teal dark:bg-teal-600 text-white shadow-sm"
                          : "bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-455 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/50 dark:border-slate-850"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

      {/* Main Content List Area */}
      <div className="max-w-5xl mx-auto w-full flex-1">
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-150 text-rose-700 text-sm font-semibold text-center mt-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
            <svg className="animate-spin h-8 w-8 text-brand-teal" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-teal">Cargando entregas...</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 px-1 text-slate-500 font-medium text-xs">
              <span>{sortedSubmissions.length} Tareas encontradas</span>
              {sortedSubmissions.length !== submissions.length && (
                <button 
                  onClick={() => { setSelectedSection("ALL"); setSearchQuery(""); setSortBy("RECENT"); }}
                  className="text-brand-teal hover:underline font-bold cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {sortedSubmissions.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-dashed border-slate-200 text-slate-400">
                <p className="text-sm font-semibold mb-1 text-slate-600">No hay tareas que coincidan</p>
                <p className="text-xs">No se encontraron entregas de tareas bajo estas condiciones de búsqueda.</p>
              </div>
            ) : (
              <motion.div
                key={`${selectedSection}-${sortBy}-${submissions.length}-${searchQuery.length > 0}`}
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-3"
              >
                {sortedSubmissions.map((sub) => {
                  const submitDate = new Date(sub.createdAt).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  const isRecent = (() => {
                    const diff = Date.now() - new Date(sub.createdAt).getTime();
                    return diff >= 0 && diff < 24 * 60 * 60 * 1000;
                  })();

                  return (
                    <motion.div
                      key={sub.id}
                      variants={itemVariants}
                      className={`relative flex flex-col p-4 rounded-2xl border transition-all duration-200 ${
                        sub.reviewed
                          ? "bg-teal-50/40 dark:bg-teal-950/10 hover:bg-teal-50/60 dark:hover:bg-teal-950/25 border-teal-200/50 dark:border-teal-900/30 shadow-sm opacity-70"
                          : "bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/60 border-slate-200 dark:border-slate-800 shadow-sm"
                      }`}
                    >
                      {/* Top Row with Student name and Section label */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h4 className="text-sm sm:text-base font-bold text-brand-teal dark:text-teal-400 leading-snug uppercase flex flex-wrap items-center gap-1.5 col-span-12">
                            <span>{sub.name}</span>
                            {isRecent && !sub.reviewed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-450 text-[8px] font-black tracking-wider uppercase border border-amber-500/30 dark:border-amber-500/40 animate-pulse">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                </span>
                                <span>Tarea Nueva</span>
                              </span>
                            )}
                          </h4>
                          <div className="flex flex-wrap gap-2 items-center text-xs text-slate-500 dark:text-slate-400">
                            <span className="px-1.5 py-0.5 rounded bg-brand-teal/10 dark:bg-teal-500/15 font-bold text-brand-teal dark:text-teal-450 uppercase tracking-wide text-[9px]">
                              SEC {sub.section}
                            </span>
                            <span>&bull;</span>
                            <span className="font-mono text-[10px]">C.I. {sub.ci}</span>
                          </div>
                          <div 
                            id={`submission-date-${sub.id}`} 
                            className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 font-sans"
                          >
                            <Clock size={12} className="text-brand-teal/70 dark:text-teal-400 shrink-0" />
                            <span className="font-bold text-slate-400 dark:text-slate-500 text-[9px] uppercase tracking-wider">Fecha de entrega:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{submitDate}</span>
                          </div>
                        </div>

                        {/* Top-Right Toggle Checkbox Action */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {/* Checkbox button to mark task as Reviewed */}
                          <button
                            id={`btn-review-${sub.id}`}
                            onClick={() => toggleReviewed(sub.id)}
                            className={`p-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer ${
                              sub.reviewed
                                ? "bg-brand-teal dark:bg-teal-600 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                            }`}
                            title={sub.reviewed ? "Marcar como pendiente" : "Marcar como revisada"}
                          >
                            {sub.reviewed ? (
                              <CheckCircle2 size={15} fill="currentColor" className="text-white/80" />
                            ) : (
                              <Circle size={15} />
                            )}
                            <span className="text-[9px] font-bold uppercase tracking-wider px-0.5">
                              {sub.reviewed ? "Listo" : "Revisada"}
                            </span>
                          </button>

                          {/* Delete Item button */}
                          <button
                            id={`btn-delete-${sub.id}`}
                            onClick={() => deleteSubmission(sub.id)}
                            className="p-1.5 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 dark:hover:text-rose-450 transition cursor-pointer"
                            title="Eliminar registro"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Student Comments (if present) */}
                      {sub.comments && (
                        <div className="mt-3 p-2.5 bg-slate-50/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-350 flex items-start gap-1.5 font-sans">
                          <MessageSquare size={13} className="text-brand-teal dark:text-teal-400 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <span className="block text-[9px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-0.5 font-mono">Comentario del Alumno:</span>
                            <p className="leading-relaxed italic">"{sub.comments}"</p>
                          </div>
                        </div>
                      )}

                      {/* Evaluated / Grade Visualization Panel */}
                      {sub.grade && (
                        <div className="mt-3 p-3 bg-teal-500/5 dark:bg-teal-500/10 border border-teal-200/50 dark:border-teal-900/30 rounded-xl text-xs flex flex-col gap-1.5 font-sans transition-all">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-extrabold text-brand-teal dark:text-teal-400 uppercase tracking-widest flex items-center gap-1 font-sans">
                              <GraduationCap size={13} /> CALIFICACIÓN ASIGNADA:
                            </span>
                            {sub.gradedAt && (
                              <span className="text-[8.5px] text-slate-450 dark:text-slate-500 font-bold font-mono">
                                {new Date(sub.gradedAt).toLocaleDateString("es-ES")}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-black text-brand-teal dark:text-teal-400">
                            {sub.grade}
                          </p>
                          {sub.updatedAt && (
                            <div className="text-[8.5px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 self-start select-none bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                              <Clock size={11} className="stroke-[2.5]" />
                              <span>Última edición: {new Date(sub.updatedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
                            </div>
                          )}
                          {sub.feedback && (
                            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-650 dark:text-slate-300 font-sans">
                              <span className="font-bold text-[8.5px] uppercase tracking-wider text-slate-450 dark:text-slate-500 block mb-0.5">Retroalimentación / Sugerencias:</span>
                              <p className="italic leading-normal text-slate-600 dark:text-slate-350">"{sub.feedback}"</p>
                            </div>
                          )}
                          {sub.feedbackAttachmentUrl && (
                            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-650 dark:text-slate-300 font-sans">
                              <span className="font-bold text-[8.5px] uppercase tracking-wider text-slate-450 dark:text-slate-500 block mb-1">Documento de Retroalimentación Adjunto:</span>
                              <a
                                href={sub.feedbackAttachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 border border-amber-500/20 rounded-lg text-[10.5px] font-bold transition font-sans"
                              >
                                <Paperclip size={11} className="stroke-[2.5]" />
                                <span className="truncate">{sub.feedbackAttachmentName || "Ver Documento Adjunto"}</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Divider line */}
                      <div className="my-3 border-t border-slate-100 dark:border-slate-800 font-sans"></div>

                      {/* Bottom Row showing Submission details & External Link */}
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <span className="text-slate-400 dark:text-slate-500 flex items-center space-x-1 font-mono text-[9px]">
                          <span>Entregado:</span>
                          <span>{submitDate}</span>
                        </span>

                        {/* Actions group with preview, evaluate and drive URL */}
                        <div className="flex items-center space-x-2 shrink-0">
                          {/* Preview Eye Icon Button with Tooltip */}
                          <div className="relative">
                            <button
                              onMouseEnter={() => setActiveTooltipId(sub.id)}
                              onMouseLeave={() => setActiveTooltipId(null)}
                              onTouchStart={() => handleTouchStart(sub.id)}
                              onTouchEnd={handleTouchEnd}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTooltipId(activeTooltipId === sub.id ? null : sub.id);
                              }}
                              className={`p-1.5 rounded-xl border transition-all duration-200 cursor-pointer select-none active:scale-95 flex items-center justify-center ${
                                activeTooltipId === sub.id
                                  ? "bg-slate-900 border-slate-900 text-white shadow-md scale-105"
                                  : "bg-slate-100 hover:bg-slate-200 border-transparent text-slate-500 hover:text-brand-teal dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-teal-400"
                              }`}
                              title="Vista rápida del enlace"
                              aria-label="Vista rápida del enlace"
                            >
                              <Eye size={14} className="stroke-[2.2]" />
                            </button>

                            <AnimatePresence>
                              {activeTooltipId === sub.id && (
                                <motion.div
                                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700/50 z-50 pointer-events-auto"
                                  style={{ transformOrigin: "bottom right" }}
                                >
                                  <div className="text-left space-y-1.5 font-sans">
                                    <div className="flex items-center gap-1.5 text-brand-gold font-bold text-[9px] uppercase tracking-wider">
                                      <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse"></span>
                                      <span>Detalle de Archivo</span>
                                    </div>
                                    <p className="text-xs text-white font-bold break-all leading-normal">
                                      {sub.attachmentName || getFileNameFromDriveUrl(sub.driveLink)}
                                    </p>
                                    <div className="pt-1 border-t border-slate-800 flex flex-col gap-0.5">
                                      <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                                        {sub.attachmentName ? "Origen del Archivo:" : "URL del Recurso:"}
                                      </span>
                                      <p className="text-[9px] text-slate-300 font-mono break-all leading-relaxed select-all">
                                        {sub.attachmentName ? "Subido Directamente a la Plataforma" : sub.driveLink}
                                      </p>
                                    </div>
                                  </div>
                                  {/* Tooltip arrow */}
                                  <div className="absolute top-full right-3.5 -translate-y-1 border-4 border-transparent border-t-slate-900"></div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Grading/Evaluation Trigger and Visual State */}
                          <button
                            onClick={() => {
                              if (activeGradingId === sub.id) {
                                setActiveGradingId(null);
                              } else {
                                setActiveGradingId(sub.id);
                                setGradeInput(sub.grade || "");
                                setFeedbackInput(sub.feedback || "");
                                setFeedbackAttachmentUrl(sub.feedbackAttachmentUrl || "");
                                setFeedbackAttachmentName(sub.feedbackAttachmentName || "");
                              }
                            }}
                            className={`py-1.5 px-3 rounded-xl font-bold transition flex items-center gap-1 select-none active:scale-[0.96] text-[10px] uppercase tracking-wider cursor-pointer border ${
                              activeGradingId === sub.id
                                ? "bg-slate-900 border-slate-900 text-white shadow-md font-extrabold"
                                : sub.grade
                                  ? "bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-400 hover:bg-teal-500/15"
                                  : "bg-slate-100 hover:bg-slate-200 border-transparent text-slate-600 hover:text-brand-teal dark:bg-slate-800 dark:text-slate-400 dark:hover:text-teal-400"
                            }`}
                            title="Asignar o editar calificación"
                          >
                            <GraduationCap size={12} className="stroke-[2.2]" />
                            <span>{sub.grade ? "Editar Nota" : "Calificar"}</span>
                          </button>

                          {/* Drive Button or Download Button */}
                          {sub.attachmentName ? (
                            <a
                              id={`link-download-${sub.id}`}
                              href={`/api/download/${sub.driveLink.substring("/api/files/".length)}?name=${encodeURIComponent(sub.attachmentName)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center space-x-1 py-1.5 px-3.5 rounded-xl font-bold transition shadow-sm active:scale-[0.98] text-[10px] uppercase tracking-wider cursor-pointer ${
                                sub.reviewed 
                                  ? "bg-emerald-55 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-950/45" 
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                              }`}
                            >
                              <span>Descargar</span>
                              <Download size={11} className="stroke-[2.5]" />
                            </a>
                          ) : (
                            <a
                              id={`link-drive-${sub.id}`}
                              href={sub.driveLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center space-x-1 py-1.5 px-3.5 rounded-xl font-bold transition shadow-sm active:scale-[0.98] text-[10px] uppercase tracking-wider cursor-pointer ${
                                sub.reviewed 
                                  ? "bg-slate-100 hover:bg-slate-200 text-slate-705 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300" 
                                  : "bg-brand-gold hover:opacity-95 text-white font-black"
                              }`}
                            >
                              <span>Ver Tarea</span>
                              <ExternalLink size={11} className="stroke-[2.5]" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Evaluation Form collapsible drawer */}
                      {activeGradingId === sub.id && (
                        <div className="mt-3.5 p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl font-sans flex flex-col gap-3 transition-all animate-fade-in">
                          <div className="flex items-center gap-1.5 text-brand-teal dark:text-teal-400 font-extrabold text-[10px] uppercase tracking-wider">
                            <GraduationCap size={15} />
                            <span>Calificar Entrega de {sub.name}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div className="flex flex-col sm:col-span-1">
                              <label className="text-[9px] font-bold text-slate-450 dark:text-slate-500 mb-1 uppercase tracking-wider">Nota Asignada</label>
                              <input
                                type="text"
                                value={gradeInput}
                                onChange={(e) => setGradeInput(e.target.value)}
                                placeholder="Ej. 20/20"
                                className="p-2 border border-slate-205 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 outline-none"
                              />
                            </div>
                            <div className="flex flex-col sm:col-span-3">
                              <label className="text-[9px] font-bold text-slate-450 dark:text-slate-500 mb-1 uppercase tracking-wider">Comentarios de la Profesora / Sugerencias</label>
                              <input
                                type="text"
                                value={feedbackInput}
                                onChange={(e) => setFeedbackInput(e.target.value)}
                                placeholder="Ej. Excelente análisis y excelente presentación."
                                className="p-2 border border-slate-205 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 outline-none"
                              />
                            </div>
                          </div>

                          {/* File upload for feedback */}
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-450 dark:text-slate-500 mb-1.5 uppercase tracking-wider">
                              Archivo de Retroalimentación o Corrección (Opcional)
                            </span>
                            {feedbackAttachmentUrl ? (
                              <div className="flex items-center justify-between p-2.5 bg-brand-teal/5 dark:bg-teal-500/10 border border-brand-teal/25 rounded-lg text-xs">
                                <div className="flex items-center gap-2 text-brand-teal dark:text-teal-400 font-bold min-w-0 font-sans">
                                  <Paperclip size={13} className="shrink-0 stroke-[2.5]" />
                                  <span className="truncate">{feedbackAttachmentName}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFeedbackAttachmentUrl("");
                                    setFeedbackAttachmentName("");
                                  }}
                                  className="text-[10px] text-rose-500 hover:text-rose-600 font-extrabold uppercase tracking-wider px-2 py-1 hover:bg-rose-500/10 rounded transition cursor-pointer shrink-0"
                                >
                                  Quitar
                                </button>
                              </div>
                            ) : (
                              <label className="flex items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-lg p-3 bg-white dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 cursor-pointer transition select-none">
                                <div className="flex items-center gap-2 font-bold font-sans">
                                  {isUploadingFeedbackFile ? (
                                    <>
                                      <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-brand-teal rounded-full animate-spin"></span>
                                      <span>Subiendo archivo...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Paperclip size={14} className="text-slate-400" />
                                      <span>Selecciona o arrastra un documento/archivo complementario</span>
                                    </>
                                  )}
                                </div>
                                <input
                                  type="file"
                                  disabled={isUploadingFeedbackFile}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleFeedbackFileUpload(file);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>
                            )}
                          </div>
                          <div className="flex justify-end gap-2 text-[10px] pt-1">
                            <button
                              type="button"
                              onClick={() => setActiveGradingId(null)}
                              className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg font-bold transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveGrade(sub.id)}
                              className="py-1.5 px-4 bg-brand-teal text-white rounded-lg font-black transition shadow cursor-pointer active:scale-95"
                            >
                              Guardar Nota
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </>
        )}
      </div>
    </>
  )}

        {activeTab === "STUDENTS" && (
          /* STUDENTS ROSTERS MANAGEMENT COMPONENT VIEW */
          <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col gap-6 font-sans">
            {/* Top warning about security */}
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-450 border border-amber-105 dark:border-amber-900/40 rounded-2xl text-[11px] leading-relaxed flex items-start gap-2">
              <span className="shrink-0 text-sm">💡</span>
              <div>
                <strong>Control de Acceso Activo:</strong> Solo los alumnos que figuren en las listas de cada sección podrán realizar entregas de tareas. Esto bloquea envíos anónimos o nombres no autorizados.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form Box 1: Manual registration */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-155 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-brand-teal dark:text-teal-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-4 bg-brand-gold rounded-full"></span>
                    Inscripción Individual
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal mb-4">
                    Inscribe un estudiante de forma individual completando los siguientes datos de control.
                  </p>
                  <form onSubmit={handleAddStudent} className="space-y-4">
                    <div className="flex flex-col">
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">Nombre Completo del Estudiante</label>
                      <input
                        type="text"
                        required
                        value={adminStudentName}
                        onChange={(e) => setAdminStudentName(e.target.value)}
                        placeholder="Ej. ANDRÉS BELLO"
                        className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded-xl text-xs outline-none focus:border-brand-teal focus:bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">Cédula de Identidad (CI)</label>
                        <input
                          type="text"
                          required
                          value={adminStudentCi}
                          onChange={(e) => setAdminStudentCi(e.target.value.replace(/\D/g, ""))}
                          placeholder="Ej. 24123456"
                          className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded-xl text-xs outline-none focus:border-brand-teal focus:bg-white"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">Grado Escolar</label>
                        <select
                          value={adminStudentSection}
                          onChange={(e) => setAdminStudentSection(e.target.value)}
                          className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-150 rounded-xl text-xs outline-none cursor-pointer focus:border-brand-teal"
                        >
                          <option value="Primer Grado">Primer Grado</option>
                          <option value="Segundo Grado">Segundo Grado</option>
                          <option value="Tercer Grado">Tercer Grado</option>
                          <option value="Cuarto Grado">Cuarto Grado</option>
                          <option value="Quinto Grado">Quinto Grado</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 bg-brand-teal text-white font-extrabold rounded-xl text-xs hover:opacity-95 transition shadow active:scale-95 cursor-pointer"
                    >
                      Registrar Estudiante 👤
                    </button>
                  </form>
                </div>
              </div>

              {/* Form Box 2: Bulk Roster Loading Textarea */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-155 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-brand-teal dark:text-teal-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-4 bg-brand-gold rounded-full"></span>
                    Inscripción Masiva (Excel / Roster)
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal mb-4">
                    Registra secciones completas de forma rápida. Escribe una línea por cada alumno. Formato: <code>CI, Nombre</code>.
                  </p>
                  <form onSubmit={handleBulkImport} className="space-y-4">
                    <div className="flex flex-col">
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">Seleccionar Grado Destino</label>
                      <select
                        value={bulkStudentSection}
                        onChange={(e) => setBulkStudentSection(e.target.value)}
                        className="p-2 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-150 rounded-lg text-xs outline-none cursor-pointer w-full sm:w-1/2 focus:border-brand-teal"
                      >
                        <option value="Primer Grado">Primer Grado</option>
                        <option value="Segundo Grado">Segundo Grado</option>
                        <option value="Tercer Grado">Tercer Grado</option>
                        <option value="Cuarto Grado">Cuarto Grado</option>
                        <option value="Quinto Grado">Quinto Grado</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">Cargar Archivo Excel (.xlsx, .xls) o CSV</label>
                      <div 
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragActive(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragActive(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragActive(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragActive(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            processRosterFile(e.dataTransfer.files[0]);
                          }
                        }}
                        className={`flex flex-col items-center justify-center text-center p-4 border-2 border-dashed rounded-2xl relative min-h-[96px] transition cursor-pointer ${
                          dragActive 
                            ? "border-teal-500 bg-teal-500/5 dark:bg-teal-500/10" 
                            : excelFileName
                              ? "border-brand-gold bg-amber-500/5"
                              : "border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 hover:border-brand-teal/50 hover:bg-slate-100/50 dark:hover:bg-slate-900/40"
                        }`}
                      >
                        <input
                          type="file"
                          accept=".xlsx, .xls, .csv, .txt"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              processRosterFile(e.target.files[0]);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="flex flex-col items-center gap-1.5 cursor-pointer">
                          <div className={`p-1.5 rounded-lg ${excelFileName ? "bg-brand-gold/10 text-brand-gold" : "bg-teal-500/10 text-brand-teal dark:text-teal-400"}`}>
                            <FileSpreadsheet size={16} />
                          </div>
                          {excelFileName ? (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 block">
                                📄 {excelFileName}
                              </span>
                              <span className="text-[9px] text-teal-600 dark:text-teal-400 font-extrabold block">
                                ¡Listo! Alumnos del archivo cargados en la caja inferior.
                              </span>
                            </div>
                          ) : (
                            <>
                              <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-350">
                                Haz clic o arrastra tu archivo Excel / CSV aquí
                              </span>
                              <span className="text-[9px] text-slate-400">
                                Soporta formatos .xlsx, .xls, .csv y .txt
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">Copiar lista y pegar abajo</label>
                      <textarea
                        rows={4}
                        value={bulkStudentText}
                        onChange={(e) => setBulkStudentText(e.target.value)}
                        placeholder={"12345678, ANDRÉS SÁNCHEZ\n87654321, CLARA ROJAS\n23111222, MARCO PÉREZ"}
                        className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 rounded-xl text-xs outline-none font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-brand-teal"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 bg-brand-gold text-white font-extrabold rounded-xl text-xs hover:opacity-95 transition shadow active:scale-95 cursor-pointer font-sans"
                    >
                      Procesar Roster Masivo 💼
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Roster database visualized filtered by local Search query */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-155 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h4 className="text-sm font-black uppercase text-brand-teal dark:text-teal-400 tracking-tight">
                    Lista de Alumnos Autorizados ({allowedStudents.length})
                  </h4>
                  <p className="text-[10px] text-slate-450 dark:text-slate-550 mt-0.5">Puedes filtrar el listado usando el campo de búsqueda rápida de C.I. o Nombre.</p>
                </div>

                {/* Local student lookup bar */}
                <div className="relative w-full sm:w-72">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    placeholder="Buscar estudiante por CI o nombre..."
                    className="w-full pl-9 pr-3.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:bg-white focus:border-brand-teal"
                  />
                </div>
              </div>

              <div>
                {studentsLoading ? (
                  <div className="text-center py-10 text-slate-450 text-xs font-semibold">
                    Cargando roster de alumnos autorizados...
                  </div>
                ) : allowedStudents.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs font-medium leading-relaxed">
                    🔒 No hay alumnos autorizados definidos en el sistema.<br />
                    Utiliza los formularios de arriba para inscribir alumnos y habilitar las entregas.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-1">
                    {allowedStudents
                      .filter((st) => {
                        const sq = studentSearchQuery.toLowerCase().trim();
                        return !sq || st.name.toLowerCase().includes(sq) || st.ci.includes(sq);
                      })
                      .map((st) => (
                        <div
                          key={st.id}
                          className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/25 flex items-center justify-between gap-2 text-xs transition hover:bg-slate-50 hover:border-slate-200"
                        >
                          <div className="min-w-0 font-sans">
                            <p className="font-extrabold text-slate-800 dark:text-slate-150 uppercase truncate">
                              {st.name}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium mt-1">
                              <span className="px-1 py-0.2 rounded bg-brand-teal/10 text-brand-teal dark:text-teal-400 font-bold text-[8.5px] uppercase">
                                {st.section}
                              </span>
                              <span>&bull;</span>
                              <span className="font-mono text-[9px]">C.I. {st.ci}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteStudent(st.id)}
                            className="p-1 px-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-455 hover:bg-rose-50 dark:hover:bg-rose-950/15 transition shrink-0 cursor-pointer"
                            title="Eliminar acceso de este alumno"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "ASSIGNMENTS" && (
          <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col gap-6 font-sans">
            {/* Top info card */}
            <div className="p-3.5 bg-[#004d4d]/10 dark:bg-teal-900/20 text-[#004d4d] dark:text-teal-400 border border-[#004d4d]/10 dark:border-teal-900/35 rounded-2xl text-[11px] leading-relaxed flex items-start gap-2 select-none md:max-w-none">
              <span className="shrink-0 text-sm">📋</span>
              <div>
                <strong>Asignar Tareas y Actividades:</strong> Pública tareas, guías de clase, enlaces de Drive o fechas límites específicas para un grado escolar o para "Todos los Grados" a la vez. Los estudiantes verán esta información de forma inmediata.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form Box - Create Assignment */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-155 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-[#004d4d] dark:text-teal-400 uppercase tracking-widest flex items-center gap-1.5 mb-2 select-none">
                    <span className="w-1.5 h-4 bg-brand-gold rounded-full"></span>
                    Crear y Publicar Tarea
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal mb-4 select-none">
                    Rellena el formulario para enviar la tarea o guía directamente al grado correspondiente.
                  </p>

                  {publishStatus !== "IDLE" && (
                    <div className={`mb-4 p-3 rounded-xl text-xs font-semibold select-none ${
                      publishStatus === "PUBLISHING" ? "bg-slate-50 dark:bg-slate-950 border border-slate-200 text-slate-700 animate-pulse" :
                      publishStatus === "SUCCESS" ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 text-emerald-700 dark:text-emerald-400" :
                      "bg-rose-50 dark:bg-rose-950/20 border border-rose-255/50 text-rose-700 dark:text-rose-455"
                    }`}>
                      {publishStatus === "PUBLISHING" ? "Publicando tarea en el sistema..." : publishMessage}
                    </div>
                  )}

                  <form onSubmit={handlePublishAssignment} className="space-y-4">
                    <div className="flex flex-col">
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1 select-none">Título de la Tarea</label>
                      <input
                        type="text"
                        required
                        value={newAssignmentTitle}
                        onChange={(e) => setNewAssignmentTitle(e.target.value)}
                        placeholder="Ej. Tarea 2: Análisis de Compuestos Químicos"
                        className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded-xl text-xs outline-none focus:border-brand-teal focus:bg-white"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1 select-none">Instrucciones / Descripción detallada</label>
                      <textarea
                        rows={3}
                        required
                        value={newAssignmentDescription}
                        onChange={(e) => setNewAssignmentDescription(e.target.value)}
                        placeholder="Escribe aquí las instrucciones de la actividad, páginas del libro que deben leer, etc..."
                        className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded-xl text-xs outline-none focus:border-brand-teal focus:bg-white transition"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1 select-none">Grado Escolar Destinatario</label>
                        <select
                          value={newAssignmentSection}
                          onChange={(e) => setNewAssignmentSection(e.target.value)}
                          className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-150 rounded-xl text-xs outline-none cursor-pointer focus:border-brand-teal"
                        >
                          <option value="TODOS">Todos los Grados</option>
                          <option value="Primer Grado">Primer Grado</option>
                          <option value="Segundo Grado">Segundo Grado</option>
                          <option value="Tercer Grado">Tercer Grado</option>
                          <option value="Cuarto Grado">Cuarto Grado</option>
                          <option value="Quinto Grado">Quinto Grado</option>
                        </select>
                      </div>

                      <div className="flex flex-col">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1 select-none">Plazo / Fecha de Entrega (Opcional)</label>
                        <input
                          type="text"
                          value={newAssignmentDueDate}
                          onChange={(e) => setNewAssignmentDueDate(e.target.value)}
                          placeholder="Ej. Lunes 5 de Junio"
                          className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded-xl text-xs outline-none focus:border-brand-teal focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Attachments Section */}
                    <div className="border border-slate-150 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20 space-y-4">
                      <span className="text-[10px] font-extrabold uppercase text-[#004d4d] dark:text-teal-400 tracking-wider select-none leading-none block">
                        Adjuntos de la Tarea 📎
                      </span>
                      
                      {/* Option 1: File Upload */}
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider select-none">
                          Opción A: Subir Archivo Local (Cualquier PDF, Imagen, TXT, etc.)
                        </label>
                        
                        {isUploadingAssignmentFile ? (
                          <div className="p-4 border border-dashed border-brand-teal/40 bg-brand-teal/5 flex flex-col items-center justify-center gap-2 rounded-xl">
                            <RefreshCw size={18} className="animate-spin text-brand-teal" />
                            <span className="text-[10.5px] text-brand-teal font-extrabold animate-pulse">Subiendo documento...</span>
                          </div>
                        ) : assignmentUploadedName ? (
                          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-xl flex items-center justify-between gap-3 animate-fade-in">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 truncate">
                                  {assignmentUploadedName}
                                </p>
                                <p className="text-[9px] text-emerald-600 dark:text-emerald-555 font-bold uppercase tracking-wider">
                                  Archivo Cargado Listo
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setNewAssignmentAttachment("");
                                setAssignmentUploadedName("");
                              }}
                              className="p-1.5 rounded-lg text-emerald-700 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/15 transition cursor-pointer shrink-0"
                              title="Eliminar archivo"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="relative group/upload">
                            <input
                              type="file"
                              id="assignment-file-input"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAssignmentFileUpload(file);
                              }}
                              className="hidden"
                            />
                            <label
                              htmlFor="assignment-file-input"
                              className="border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 py-3.5 px-4 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center group-hover/upload:border-brand-teal dark:group-hover/upload:border-teal-500 transition shadow-sm"
                            >
                              <FileUp size={18} className="text-slate-400 dark:text-slate-500" />
                              <div className="text-center">
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                  Seleccionar archivo...
                                </span>
                                <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                                  PDF, imágenes, TXT, Word u otros (Máx 50MB)
                                </p>
                              </div>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Divider line */}
                      <div className="flex items-center gap-2 select-none my-1">
                        <span className="h-[1px] bg-slate-100 dark:bg-slate-800 flex-1"></span>
                        <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-widest">o bien</span>
                        <span className="h-[1px] bg-slate-100 dark:bg-slate-800 flex-1"></span>
                      </div>

                      {/* Option 2: Drive Link */}
                      <div className="flex flex-col">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1 select-none">
                          Opción B: Pegar Enlace a Google Drive o Web (Alternativo)
                        </label>
                        <input
                          type="text"
                          value={assignmentUploadedName ? "" : newAssignmentAttachment}
                          disabled={!!assignmentUploadedName}
                          onChange={(e) => {
                            setNewAssignmentAttachment(e.target.value);
                            setAssignmentUploadedName(""); // Clear uploaded file name if text link is typed manually
                          }}
                          placeholder={assignmentUploadedName ? "Deshabilitado al subir un archivo arriba" : "https://drive.google.com/file/d/..."}
                          className="p-2.5 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 rounded-xl text-xs outline-none focus:border-brand-teal focus:bg-white disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={publishStatus === "PUBLISHING"}
                      className="w-full py-3 bg-[#0a9396] hover:bg-[#005f73] font-black text-white rounded-xl text-xs hover:opacity-95 transition shadow disabled:opacity-50 active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span>Publicar Tarea Oficial</span>
                      <span>🚀</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* Assignments list view for deletion/archive */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-155 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <div>
                  <h4 className="text-sm font-black uppercase text-[#004d4d] dark:text-teal-400 tracking-tight select-none">
                    Actividades Publicadas {assignmentsLoading ? "..." : `(${allAssignments.length})`}
                  </h4>
                  <p className="text-[10px] text-slate-455 dark:text-slate-500 mt-0.5 select-none">Puedes eliminar las tareas completadas o antiguas haciendo clic en el banner de la papelera.</p>
                </div>

                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {assignmentsLoading ? (
                    <div className="text-center py-10 text-slate-450 text-xs font-semibold select-none">
                      Cargando tareas autorizadas...
                    </div>
                  ) : allAssignments.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 text-xs font-medium leading-relaxed border border-dashed border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/20 select-none">
                      📋 No tienes tareas activas creadas actualmente.<br />
                      Usa el formulario de la izquierda para publicar la primera tarea escolar.
                    </div>
                  ) : (
                    allAssignments.map((asg) => (
                      <div
                        key={asg.id}
                        className="p-3.5 rounded-2xl border border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/25 flex flex-col gap-2 relative group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-brand-teal/10 text-brand-teal dark:text-teal-400 font-bold text-[8px] uppercase tracking-wide">
                              {asg.section === "TODOS" ? "Todos los Grados" : asg.section}
                            </span>
                            <h5 className="font-extrabold text-slate-850 dark:text-slate-100 text-[11px] mt-1 pr-4 leading-tight">
                              {asg.title}
                            </h5>
                          </div>
                          
                          <button
                            onClick={() => handleDeleteAssignment(asg.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-455 hover:bg-rose-50 dark:hover:bg-rose-950/15 transition shrink-0 cursor-pointer self-start"
                            title="Eliminar tarea asignada"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal whitespace-pre-line font-medium pr-2">
                          {asg.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[9px] text-slate-400 border-t border-slate-100 dark:border-slate-850 pt-2 shrink-0 select-none">
                          {asg.dueDate && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#c5a059] flex items-center gap-0.5 animate-fade-in">
                                📅 Plazo: {asg.dueDate}
                              </span>
                              {(() => {
                                const badgeInfo = getDaysUntil(asg.dueDate);
                                if (badgeInfo) {
                                  return (
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${badgeInfo.badgeStyle}`}>
                                      {badgeInfo.text}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                          {asg.attachmentLink && (
                            asg.attachmentLink.startsWith("/api/files/") ? (
                              <a
                                href={`/api/download/${asg.attachmentLink.substring("/api/files/".length)}?name=${encodeURIComponent(asg.attachmentName || "archivo")}`}
                                className="text-emerald-650 dark:text-emerald-400 font-extrabold hover:underline flex items-center gap-0.5"
                                title={asg.attachmentName || "Descargar archivo"}
                              >
                                <Download size={11} className="shrink-0" />
                                <span>Descargar: {asg.attachmentName || "Archivo adjunto"}</span>
                              </a>
                            ) : (
                              <a
                                href={asg.attachmentLink.startsWith("http") ? asg.attachmentLink : `https://${asg.attachmentLink}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                                className="text-[#c5a059] dark:text-amber-400 font-extrabold hover:underline flex items-center gap-0.5 truncate max-w-[200px]"
                                title={asg.attachmentLink}
                              >
                                <ExternalLink size={11} className="shrink-0" />
                                <span>Ver: {asg.attachmentName || "Enlace adjunto"}</span>
                              </a>
                            )
                          )}
                        </div>

                        {/* Reminders trigger */}
                        <div className="border-t border-slate-100 dark:border-slate-850 pt-2 mt-1 flex items-center justify-between gap-2.5">
                          {reminderStatuses[asg.id]?.status === "SUCCESS" ? (
                            <span className="text-[9.5px] font-extrabold text-emerald-650 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded-lg border border-emerald-200/40 animate-fade-in flex items-center gap-1">
                              <span>✅</span> {reminderStatuses[asg.id]?.message}
                            </span>
                          ) : reminderStatuses[asg.id]?.status === "ERROR" ? (
                            <span className="text-[9.5px] font-extrabold text-[#e63946] dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded-lg border border-rose-200/40 animate-fade-in flex items-center gap-1">
                              <span>⚠️</span> {reminderStatuses[asg.id]?.message}
                            </span>
                          ) : (
                            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                              Notificar a Pendientes
                            </span>
                          )}

                          <button
                            onClick={() => handleSendReminder(asg.id, asg.title)}
                            disabled={reminderStatuses[asg.id]?.status === "SENDING"}
                            className="px-2.5 py-1 bg-[#c5a059] hover:opacity-90 disabled:bg-[#c5a059]/70 text-white rounded-lg font-black text-[9px] uppercase tracking-wide transition active:scale-95 cursor-pointer shadow-sm shrink-0 flex items-center gap-1"
                          >
                            <span>⏰</span>
                            <span>{reminderStatuses[asg.id]?.status === "SENDING" ? "Enviando..." : "Recordar"}</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      {activeTab === "CHAT" && (
        <div className="max-w-5xl mx-auto w-full mb-12 animate-fade-in px-4">
          <ChatSystem role="TEACHER" initialSelectedRoomName={initialChatRoomName} />
        </div>
      )}
      </div>
    );
}
