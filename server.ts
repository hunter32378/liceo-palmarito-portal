import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
dotenv.config();
dotenv.config({ path: ".env.local" });

interface Submission {
  id: string;
  name: string;
  ci: string;
  section: "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado";
  driveLink: string;
  reviewed: boolean;
  createdAt: string;
  comments?: string;
  grade?: string;
  feedback?: string;
  gradedAt?: string;
  updatedAt?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  attachmentName?: string;
  feedbackAttachmentUrl?: string;
  feedbackAttachmentName?: string;
}

interface AuthorizedStudent {
  id: string;
  name: string;
  ci: string;
  section: "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado";
  createdAt: string;
}

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

interface ChatRoom {
  id: string;
  type: "GRADE" | "ASSIGNMENT" | "PRIVATE" | "GROUP";
  name: string;
  section?: "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado";
  assignmentId?: string;
  memberCis?: string[];
  createdAt: string;
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderName: string;
  senderCi?: string;
  senderRole: "STUDENT" | "TEACHER";
  message: string;
  createdAt: string;
  mediaUrl?: string;
  mediaType?: "sticker" | "video" | "document" | "image";
  mediaName?: string;
}

interface AppNotification {
  id: string;
  recipientRole: "TEACHER" | "STUDENT";
  recipientCi?: string;
  title: string;
  message: string;
  type: "SUBMISSION" | "GRADE" | "SYSTEM";
  read: boolean;
  createdAt: string;
  archived?: boolean;
}

// ----------------------------------------------------
// Supabase Setup & Fallback Control
// ----------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const isSupabase = 
  supabaseUrl && 
  supabaseServiceKey && 
  !supabaseUrl.includes("your-project-id") && 
  !supabaseServiceKey.includes("your-service-role-key");

let supabase: any = null;

if (isSupabase) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });
    console.log("🟢 CONECTADO CON ÉXITO A SUPABASE (POSTGRESQL).");
  } catch (err) {
    console.error("🔴 Error inicializando el cliente de Supabase:", err);
  }
} else {
  console.log("⚠️ MODO LOCAL ACTIVO: Supabase no está configurado o tiene valores por defecto. Usando persistencia local JSON.");
}

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration (Changed to Memory for Supabase Upload)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size to support heavy PDFs, images, docs easily
  }
});

function migrateSection(sec: any): "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado" {
  if (sec === "A" || sec === "Primer Grado") return "Primer Grado";
  if (sec === "B" || sec === "Segundo Grado") return "Segundo Grado";
  if (sec === "C" || sec === "Tercer Grado") return "Tercer Grado";
  if (sec === "D" || sec === "Cuarto Grado") return "Cuarto Grado";
  if (sec === "E" || sec === "Quinto Grado") return "Quinto Grado";
  return "Primer Grado"; // Fallback
}

const PORT = 3000;
const DATA_FILE_PATH = path.join(process.cwd(), "submissions.json");
const ALLOWED_STUDENTS_FILE_PATH = path.join(process.cwd(), "allowed_students.json");
const NOTIFICATIONS_FILE_PATH = path.join(process.cwd(), "notifications.json");
const ASSIGNMENTS_FILE_PATH = path.join(process.cwd(), "assignments.json");
const CHAT_ROOMS_FILE_PATH = path.join(process.cwd(), "chat_rooms.json");
const CHAT_MESSAGES_FILE_PATH = path.join(process.cwd(), "chat_messages.json");
const CHAT_RESTRICTIONS_FILE_PATH = path.join(process.cwd(), "chat_restrictions.json");
const FILE_HASHES_FILE_PATH = path.join(process.cwd(), "file_hashes.json");

// In-memory / local JSON falls
let submissionsList: Submission[] = [];
let allowedStudentsList: AuthorizedStudent[] = [];
let notificationsList: AppNotification[] = [];
let assignmentsList: Assignment[] = [];
let chatRoomsList: ChatRoom[] = [];
let chatMessagesList: ChatMessage[] = [];
let fileHashesList: { hash: string; url: string }[] = [];
let restrictedCisList: string[] = [];
let mutedRoomsList: string[] = [];

// Load existing notifications
try {
  if (fs.existsSync(NOTIFICATIONS_FILE_PATH)) {
    const notificationsContent = fs.readFileSync(NOTIFICATIONS_FILE_PATH, "utf-8");
    notificationsList = JSON.parse(notificationsContent);
  } else {
    const initialNotifications: AppNotification[] = [
      {
        id: "sys-1",
        recipientRole: "TEACHER",
        title: "Bienvenida Profesora Anuvis Medina",
        message: "Bienvenida al panel administrativo. Aquí podrá revisar todas las tareas entregadas por los alumnos y asignar calificaciones.",
        type: "SYSTEM",
        read: false,
        createdAt: new Date().toISOString()
      },
      {
        id: "sys-2",
        recipientRole: "STUDENT",
        title: "Portal Escolar Activo",
        message: "¡La plataforma está lista para recibir tus tareas! Ingresa tu número de cédula en la sección correspondiente.",
        type: "SYSTEM",
        read: false,
        createdAt: new Date().toISOString()
      }
    ];
    notificationsList = initialNotifications;
    fs.writeFileSync(NOTIFICATIONS_FILE_PATH, JSON.stringify(initialNotifications, null, 2), "utf-8");
  }
} catch (err) {
  console.warn("Could not load notifications file, using in-memory state:", err);
}

// Load existing submissions if they exist
try {
  if (fs.existsSync(DATA_FILE_PATH)) {
    const fileContent = fs.readFileSync(DATA_FILE_PATH, "utf-8");
    submissionsList = JSON.parse(fileContent);
    let modified = false;
    submissionsList = submissionsList.map(sub => {
      const migrated = migrateSection(sub.section);
      if (migrated !== sub.section) {
        modified = true;
        return { ...sub, section: migrated };
      }
      return sub;
    });
    if (modified) {
      fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(submissionsList, null, 2), "utf-8");
    }
  } else {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify([], null, 2), "utf-8");
  }
} catch (err) {
  console.warn("Could not load submissions file, using in-memory state:", err);
}

// Load existing authorized students or bootstrap with default list
try {
  if (fs.existsSync(ALLOWED_STUDENTS_FILE_PATH)) {
    const studentsContent = fs.readFileSync(ALLOWED_STUDENTS_FILE_PATH, "utf-8");
    allowedStudentsList = JSON.parse(studentsContent);
    let modified = false;
    allowedStudentsList = allowedStudentsList.map(st => {
      const migrated = migrateSection(st.section);
      if (migrated !== st.section) {
        modified = true;
        return { ...st, section: migrated };
      }
      return st;
    });
    if (modified) {
      fs.writeFileSync(ALLOWED_STUDENTS_FILE_PATH, JSON.stringify(allowedStudentsList, null, 2), "utf-8");
    }
  } else {
    const demoStudents: AuthorizedStudent[] = [
      { id: "demo-1", name: "CARLOS PÉREZ", ci: "12345678", section: "Primer Grado", createdAt: new Date().toISOString() },
      { id: "demo-2", name: "MARÍA GÓMEZ", ci: "87654321", section: "Segundo Grado", createdAt: new Date().toISOString() },
      { id: "demo-3", name: "JOSÉ RODRÍGUEZ", ci: "11223344", section: "Tercer Grado", createdAt: new Date().toISOString() },
      { id: "demo-4", name: "ANA MARTÍNEZ", ci: "44332211", section: "Cuarto Grado", createdAt: new Date().toISOString() },
      { id: "demo-5", name: "ESTUDIANTE DEMO", ci: "12345", section: "Primer Grado", createdAt: new Date().toISOString() }
    ];
    allowedStudentsList = demoStudents;
    fs.writeFileSync(ALLOWED_STUDENTS_FILE_PATH, JSON.stringify(demoStudents, null, 2), "utf-8");
  }
} catch (err) {
  console.warn("Could not load authorized students file, using in-memory state:", err);
}

// Load assignments
try {
  if (fs.existsSync(ASSIGNMENTS_FILE_PATH)) {
    const assignmentsContent = fs.readFileSync(ASSIGNMENTS_FILE_PATH, "utf-8");
    assignmentsList = JSON.parse(assignmentsContent);
  } else {
    const initialAssignments: Assignment[] = [
      {
        id: "asg-1",
        title: "Ecuaciones de Segundo Grado",
        description: "Resolver los ejercicios de la página 45 a la 47 del libro de texto y subir el enlace de Google Drive con las fotos de la resolución.",
        section: "Tercer Grado",
        createdAt: new Date().toISOString(),
        dueDate: "Entregar antes del viernes",
      },
      {
        id: "asg-2",
        title: "Lectura Comprensiva de Cuentos",
        description: "Leer el cuento 'El almohadón de plumas' de Horacio Quiroga y realizar un resumen crítico de una página.",
        section: "Primer Grado",
        createdAt: new Date().toISOString(),
        dueDate: "Próximo miércoles",
      }
    ];
    assignmentsList = initialAssignments;
    fs.writeFileSync(ASSIGNMENTS_FILE_PATH, JSON.stringify(initialAssignments, null, 2), "utf-8");
  }
} catch (err) {
  console.warn("Could not load assignments file, using in-memory state:", err);
}

// Load chat rooms
try {
  if (fs.existsSync(CHAT_ROOMS_FILE_PATH)) {
    const chatRoomsContent = fs.readFileSync(CHAT_ROOMS_FILE_PATH, "utf-8");
    chatRoomsList = JSON.parse(chatRoomsContent);
  } else {
    const defaultRooms: ChatRoom[] = [
      { id: "grade-Primer Grado", type: "GRADE", name: "Salón de Primer Grado", section: "Primer Grado", createdAt: new Date().toISOString() },
      { id: "grade-Segundo Grado", type: "GRADE", name: "Salón de Segundo Grado", section: "Segundo Grado", createdAt: new Date().toISOString() },
      { id: "grade-Tercer Grado", type: "GRADE", name: "Salón de Tercer Grado", section: "Tercer Grado", createdAt: new Date().toISOString() },
      { id: "grade-Cuarto Grado", type: "GRADE", name: "Salón de Cuarto Grado", section: "Cuarto Grado", createdAt: new Date().toISOString() },
      { id: "grade-Quinto Grado", type: "GRADE", name: "Salón de Quinto Grado", section: "Quinto Grado", createdAt: new Date().toISOString() },
    ];
    chatRoomsList = defaultRooms;
    fs.writeFileSync(CHAT_ROOMS_FILE_PATH, JSON.stringify(defaultRooms, null, 2), "utf-8");
  }
} catch (err) {
  console.warn("Could not load chat rooms file:", err);
}

// Load chat messages
try {
  if (fs.existsSync(CHAT_MESSAGES_FILE_PATH)) {
    const chatMessagesContent = fs.readFileSync(CHAT_MESSAGES_FILE_PATH, "utf-8");
    chatMessagesList = JSON.parse(chatMessagesContent);
  } else {
    const defaultMessages: ChatMessage[] = [
      {
        id: "msg-init-1",
        roomId: "grade-Primer Grado",
        senderName: "SISTEMA",
        senderRole: "TEACHER",
        message: "¡Bienvenidos al chat oficial de Primer Grado! Aquí los alumnos pueden interactuar y hacer consultas a la Profesora Anuvis Medina.",
        createdAt: new Date().toISOString()
      },
      {
        id: "msg-init-2",
        roomId: "grade-Segundo Grado",
        senderName: "SISTEMA",
        senderRole: "TEACHER",
        message: "¡Bienvenidos al chat oficial de Segundo Grado! Este espacio es para interactuar sanamente y aclarar dudas con la docente.",
        createdAt: new Date().toISOString()
      },
      {
        id: "msg-init-3",
        roomId: "grade-Tercer Grado",
        senderName: "SISTEMA",
        senderRole: "TEACHER",
        message: "¡Bienvenidos al chat oficial de Tercer Grado! Comenta tus inquietudes sobre las tareas escolares aquí.",
        createdAt: new Date().toISOString()
      }
    ];
    chatMessagesList = defaultMessages;
    fs.writeFileSync(CHAT_MESSAGES_FILE_PATH, JSON.stringify(defaultMessages, null, 2), "utf-8");
  }
} catch (err) {
  console.warn("Could not load chat messages file:", err);
}

// Load existing chat restrictions if they exist
try {
  if (fs.existsSync(CHAT_RESTRICTIONS_FILE_PATH)) {
    const restrictionsContent = fs.readFileSync(CHAT_RESTRICTIONS_FILE_PATH, "utf-8");
    const restrictions = JSON.parse(restrictionsContent);
    if (restrictions.restrictedCis) restrictedCisList = restrictions.restrictedCis;
    if (restrictions.mutedRooms) mutedRoomsList = restrictions.mutedRooms;
  } else {
    fs.writeFileSync(CHAT_RESTRICTIONS_FILE_PATH, JSON.stringify({ restrictedCis: [], mutedRooms: [] }, null, 2), "utf-8");
  }
} catch (err) {
  console.warn("Could not load restrictions file, using in-memory state:", err);
}

// Local Save Helpers
function saveRestrictions() {
  try {
    fs.writeFileSync(CHAT_RESTRICTIONS_FILE_PATH, JSON.stringify({
      restrictedCis: restrictedCisList,
      mutedRooms: mutedRoomsList
    }, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving restrictions:", err);
  }
}

function saveChatRooms() {
  try {
    fs.writeFileSync(CHAT_ROOMS_FILE_PATH, JSON.stringify(chatRoomsList, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving chat rooms:", err);
  }
}

function saveChatMessages() {
  try {
    fs.writeFileSync(CHAT_MESSAGES_FILE_PATH, JSON.stringify(chatMessagesList, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving chat messages:", err);
  }
}

function saveFileHashes() {
  try {
    fs.writeFileSync(FILE_HASHES_FILE_PATH, JSON.stringify(fileHashesList, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving file hashes:", err);
  }
}

function saveSubmissions() {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(submissionsList, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving submissions to file:", err);
  }
}

function saveAllowedStudents() {
  try {
    fs.writeFileSync(ALLOWED_STUDENTS_FILE_PATH, JSON.stringify(allowedStudentsList, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving authorized students to file:", err);
  }
}

function saveNotifications() {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE_PATH, JSON.stringify(notificationsList, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving notifications to file:", err);
  }
}

function saveAssignments() {
  try {
    fs.writeFileSync(ASSIGNMENTS_FILE_PATH, JSON.stringify(assignmentsList, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving assignments to file:", err);
  }
}

// Common offensive vocabulary filtering for student chats (Venezuela context and general Spanish)
const offensiveWords = [
  "mierda", "coño", "maldito", "maldita", "puta", "puto", "hijo de puta", "hija de puta",
  "pendejo", "pendeja", "marico", "marica", "guevon", "guevón", "huevon", "huevón",
  "verga", "culiado", "culiada", "estupido", "estupida", "estúpida", "estúpido",
  "mamaguevo", "mamagüevo", "coñazo", "carajo", "singar", "singado"
];

function hasOffensiveContent(text: string): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // removes accents
  return offensiveWords.some(word => {
    const escapedWord = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    return regex.test(normalized);
  });
}

// ----------------------------------------------------
// Server Express Initialization
// ----------------------------------------------------
async function startServer() {
  const app = express();
  app.use(express.json());

  // API Route: GET submissions
  app.get("/api/submissions", async (req, res) => {
    try {
      if (isSupabase) {
        const { data, error } = await supabase
          .from("submissions")
          .select("*")
          .order("createdAt", { ascending: false });
        if (error) throw error;
        return res.json(data);
      }
      res.json(submissionsList);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al obtener tareas." });
    }
  });

  // API Route: Get my grade (for students)
  app.get("/api/submissions/my-grade", async (req, res) => {
    const { ci } = req.query;
    if (!ci) {
      return res.status(400).json({ error: "Debe ingresar una cédula para consultar." });
    }

    const queryCi = String(ci).replace(/\D/g, "");
    if (!queryCi) {
      return res.status(400).json({ error: "Cédula inválida." });
    }

    try {
      if (isSupabase) {
        const { data, error } = await supabase
          .from("submissions")
          .select("*")
          .order("createdAt", { ascending: false });
        if (error) throw error;
        const studentSubmissions = (data || []).filter(
          (sub: any) => sub.ci.replace(/\D/g, "") === queryCi
        );
        return res.json(studentSubmissions);
      }

      const studentSubmissions = submissionsList.filter(
        (sub) => sub.ci.replace(/\D/g, "") === queryCi
      );
      res.json(studentSubmissions);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al consultar nota." });
    }
  });

  // API Route: POST submission with security validation
  app.post("/api/submissions", async (req, res) => {
    const { name, ci, section, driveLink, comments, assignmentId, assignmentTitle, attachmentName } = req.body;

    if (!name || !ci || !section || !driveLink) {
      return res.status(400).json({ error: "Todos los campos son obligatorios." });
    }

    if (!["Primer Grado", "Segundo Grado", "Tercer Grado", "Cuarto Grado", "Quinto Grado"].includes(section)) {
      return res.status(400).json({ error: "Grado seleccionado no es válido." });
    }

    const normCi = ci.toString().replace(/\D/g, "");

    try {
      let isAuthorized = false;
      if (isSupabase) {
        const { data: allowedStudents, error } = await supabase
          .from("allowed_students")
          .select("*");
        if (error) throw error;
        isAuthorized = (allowedStudents || []).some(
          (s: any) => s.ci.replace(/\D/g, "") === normCi && s.section === section
        );
      } else {
        isAuthorized = allowedStudentsList.some(
          (s) => s.ci.replace(/\D/g, "") === normCi && s.section === section
        );
      }

      if (!isAuthorized) {
        return res.status(403).json({
          error: `Acceso Denegado por Seguridad: El número de Cédula (${ci}) no está registrado/autorizado en el ${section} por la Profesora Anuvis Medina. Comunícate con ella para que te añada a la lista de alumnos.`
        });
      }

      let urlString = driveLink.trim();
      if (!urlString.startsWith("http://") && !urlString.startsWith("https://") && !urlString.startsWith("/api/files/")) {
        urlString = "https://" + urlString;
      }

      const submissionId = Math.random().toString(36).substring(2, 11);
      const newSubmission: Submission = {
        id: submissionId,
        name: name.trim(),
        ci: ci.toString().trim(),
        section: section as "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado",
        driveLink: urlString,
        reviewed: false,
        createdAt: new Date().toISOString(),
        comments: comments ? comments.trim() : undefined,
        assignmentId: assignmentId || undefined,
        assignmentTitle: assignmentTitle || undefined,
        attachmentName: attachmentName ? attachmentName.trim() : undefined,
      };

      const notifId = "notif-" + Math.random().toString(36).substring(2, 11);
      const teacherNotification: AppNotification = {
        id: notifId,
        recipientRole: "TEACHER",
        title: "Nueva Tarea de Alumno",
        message: `${name.trim()} (${section}) ha enviado su tarea para evaluación.`,
        type: "SUBMISSION",
        read: false,
        createdAt: new Date().toISOString()
      };

      if (isSupabase) {
        const { error: subErr } = await supabase
          .from("submissions")
          .insert([newSubmission]);
        if (subErr) throw subErr;

        const { error: notifErr } = await supabase
          .from("notifications")
          .insert([teacherNotification]);
        if (notifErr) throw notifErr;
      } else {
        submissionsList.unshift(newSubmission);
        saveSubmissions();

        notificationsList.unshift(teacherNotification);
        saveNotifications();
      }

      res.status(201).json({ success: true, submission: newSubmission });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al procesar la entrega." });
    }
  });

  // API Route: POST grade to submission
  app.post("/api/submissions/:id/grade", async (req, res) => {
    const { id } = req.params;
    const { grade, feedback, feedbackAttachmentUrl, feedbackAttachmentName } = req.body;

    try {
      let submission: any = null;
      if (isSupabase) {
        const { data, error } = await supabase
          .from("submissions")
          .select("*")
          .eq("id", id)
          .single();
        if (error) {
          return res.status(404).json({ error: "Tarea no encontrada." });
        }
        submission = data;
      } else {
        submission = submissionsList.find((s) => s.id === id);
        if (!submission) {
          return res.status(404).json({ error: "Tarea no encontrada." });
        }
      }

      const isModification = !!(submission.grade !== undefined || submission.feedback !== undefined || submission.gradedAt);
      const now = new Date().toISOString();

      const updates: any = {
        grade: grade || null,
        feedback: feedback || null,
        feedbackAttachmentUrl: feedbackAttachmentUrl || null,
        feedbackAttachmentName: feedbackAttachmentName || null,
        reviewed: true,
        gradedAt: submission.gradedAt || now
      };

      if (isModification) {
        updates.updatedAt = now;
      }

      const studentNotification: AppNotification = {
        id: "notif-" + Math.random().toString(36).substring(2, 11),
        recipientRole: "STUDENT",
        recipientCi: submission.ci.replace(/\D/g, ""),
        title: isModification ? "Calificación Actualizada" : "Tarea Calificada 🎉",
        message: `La Profesora Anuvis Medina ha ${isModification ? "actualizado la" : "calificado tu"} tarea en la Sección ${submission.section}. Nota: ${grade || "No Asignada"}`,
        type: "GRADE",
        read: false,
        createdAt: now
      };

      if (isSupabase) {
        const { error: updErr } = await supabase
          .from("submissions")
          .update(updates)
          .eq("id", id);
        if (updErr) throw updErr;

        const { error: notifErr } = await supabase
          .from("notifications")
          .insert([studentNotification]);
        if (notifErr) throw notifErr;

        // Fetch updated object for response
        const { data: updatedSub } = await supabase
          .from("submissions")
          .select("*")
          .eq("id", id)
          .single();
        submission = updatedSub;
      } else {
        submission.grade = grade || undefined;
        submission.feedback = feedback || undefined;
        submission.feedbackAttachmentUrl = feedbackAttachmentUrl || undefined;
        submission.feedbackAttachmentName = feedbackAttachmentName || undefined;
        submission.reviewed = true;
        submission.gradedAt = submission.gradedAt || now;
        if (isModification) {
          submission.updatedAt = now;
        }
        saveSubmissions();

        notificationsList.unshift(studentNotification);
        saveNotifications();
      }

      res.json({ success: true, submission });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al calificar tarea." });
    }
  });

  // API Route: GET notifications
  app.get("/api/notifications", async (req, res) => {
    const { role, ci } = req.query;

    try {
      let filtered: AppNotification[] = [];
      if (isSupabase) {
        let query = supabase.from("notifications").select("*").order("createdAt", { ascending: false });
        if (role) query = query.eq("recipientRole", role);
        const { data, error } = await query;
        if (error) throw error;
        filtered = data || [];
      } else {
        filtered = notificationsList;
        if (role) {
          filtered = filtered.filter(n => n.recipientRole === role);
        }
      }

      if (ci) {
        const matchCi = String(ci).replace(/\D/g, "");
        filtered = filtered.filter(n => !n.recipientCi || n.recipientCi === matchCi);
      }
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al obtener notificaciones." });
    }
  });

  // API Route: Mark single notification as read
  app.post("/api/notifications/:id/read", async (req, res) => {
    const { id } = req.params;

    try {
      if (isSupabase) {
        const { error } = await supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", id);
        if (error) throw error;
        return res.json({ success: true });
      }

      const notification = notificationsList.find(n => n.id === id);
      if (!notification) {
        return res.status(404).json({ error: "Notificación no encontrada." });
      }
      notification.read = true;
      saveNotifications();
      res.json({ success: true, notification });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al marcar notificación." });
    }
  });

  // API Route: Mark all as read
  app.post("/api/notifications/read-all", async (req, res) => {
    const { role, ci } = req.body;

    try {
      if (isSupabase) {
        let query = supabase.from("notifications").update({ read: true }).eq("read", false);
        if (role) query = query.eq("recipientRole", role);
        if (ci) {
          const matchCi = String(ci).replace(/\D/g, "");
          query = query.eq("recipientCi", matchCi);
        }
        const { error } = await query;
        if (error) throw error;
        return res.json({ success: true });
      }

      let count = 0;
      notificationsList.forEach(n => {
        const matchesRole = role ? n.recipientRole === role : true;
        const matchesCi = ci ? n.recipientCi === String(ci).replace(/\D/g, "") : true;
        if (matchesRole && matchesCi && !n.read) {
          n.read = true;
          count++;
        }
      });
      if (count > 0) {
        saveNotifications();
      }
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al marcar lecturas." });
    }
  });

  // API Route: Clear notifications
  app.post("/api/notifications/clear", async (req, res) => {
    const { role, ci } = req.body;

    try {
      if (isSupabase) {
        let query = supabase.from("notifications").delete();
        if (role) query = query.eq("recipientRole", role);
        if (ci) {
          const matchCi = String(ci).replace(/\D/g, "");
          query = query.eq("recipientCi", matchCi);
        }
        const { error } = await query;
        if (error) throw error;
        return res.json({ success: true });
      }

      if (role || ci) {
        notificationsList = notificationsList.filter(n => {
          const matchesRole = role ? n.recipientRole === role : true;
          const matchesCi = ci ? n.recipientCi === String(ci).replace(/\D/g, "") : true;
          return !(matchesRole && matchesCi);
        });
      } else {
        notificationsList = [];
      }
      saveNotifications();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al vaciar notificaciones." });
    }
  });

  // API Route: GET assignments
  app.get("/api/assignments", async (req, res) => {
    const { section, ci } = req.query;

    try {
      let targetSection = section ? String(section) : null;
      let dbStudents: AuthorizedStudent[] = [];

      if (isSupabase) {
        const { data, error } = await supabase.from("allowed_students").select("*");
        if (error) throw error;
        dbStudents = data || [];
      } else {
        dbStudents = allowedStudentsList;
      }

      if (ci) {
        const normCi = String(ci).replace(/\D/g, "");
        const student = dbStudents.find(s => s.ci.replace(/\D/g, "") === normCi);
        if (student) {
          targetSection = student.section;
        }
      }

      let allAssignments: Assignment[] = [];
      if (isSupabase) {
        const { data, error } = await supabase
          .from("assignments")
          .select("*")
          .order("createdAt", { ascending: false });
        if (error) throw error;
        allAssignments = data || [];
      } else {
        allAssignments = assignmentsList;
      }

      if (targetSection) {
        const filtered = allAssignments.filter(
          item => item.section === targetSection || item.section === "TODOS"
        );
        return res.json(filtered);
      }

      res.json(allAssignments);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al obtener tareas." });
    }
  });

  // API Route: POST assignments
  app.post("/api/assignments", async (req, res) => {
    const { title, description, section, dueDate, attachmentLink, attachmentName } = req.body;
    if (!title || !description || !section) {
      return res.status(400).json({ error: "Título, descripción y grado son obligatorios." });
    }

    const VALID_SECTIONS_WITH_ALL = ["Primer Grado", "Segundo Grado", "Tercer Grado", "Cuarto Grado", "Quinto Grado", "TODOS"];
    if (!VALID_SECTIONS_WITH_ALL.includes(section)) {
      return res.status(400).json({ error: "Grado seleccionado no es válido." });
    }

    const assignmentId = Math.random().toString(36).substring(2, 11);
    const newAssignment: Assignment = {
      id: assignmentId,
      title: title.trim(),
      description: description.trim(),
      section: section as any,
      createdAt: new Date().toISOString(),
      dueDate: dueDate ? dueDate.trim() : undefined,
      attachmentLink: attachmentLink ? attachmentLink.trim() : undefined,
      attachmentName: attachmentName ? attachmentName.trim() : undefined
    };

    const newNotif: AppNotification = {
      id: "asg-notif-" + Math.random().toString(36).substring(2, 11),
      recipientRole: "STUDENT",
      title: "Nueva Tarea Asignada 📋",
      message: `Nueva tarea publicada para ${section}: "${title.trim()}"`,
      type: "SYSTEM",
      read: false,
      createdAt: new Date().toISOString()
    };

    try {
      if (isSupabase) {
        const { error: asgErr } = await supabase
          .from("assignments")
          .insert([newAssignment]);
        if (asgErr) throw asgErr;

        const { error: notifErr } = await supabase
          .from("notifications")
          .insert([newNotif]);
        if (notifErr) throw notifErr;
      } else {
        assignmentsList.unshift(newAssignment);
        saveAssignments();

        notificationsList.unshift(newNotif);
        saveNotifications();
      }

      res.status(201).json({ success: true, assignment: newAssignment });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al guardar tarea." });
    }
  });

  // API Route: DELETE assignment
  app.delete("/api/assignments/:id", async (req, res) => {
    const { id } = req.params;

    try {
      if (isSupabase) {
        const { error } = await supabase
          .from("assignments")
          .delete()
          .eq("id", id);
        if (error) throw error;
        return res.json({ success: true });
      }

      const index = assignmentsList.findIndex(item => item.id === id);
      if (index === -1) {
        return res.status(404).json({ error: "Tarea no encontrada." });
      }
      assignmentsList.splice(index, 1);
      saveAssignments();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al eliminar tarea." });
    }
  });

  // API Route: Send reminders to students pending submission
  app.post("/api/assignments/:id/remind-pending", async (req, res) => {
    const { id } = req.params;

    try {
      let assignment: any = null;
      let dbStudents: AuthorizedStudent[] = [];
      let dbSubmissions: Submission[] = [];

      if (isSupabase) {
        const { data: asgData, error: asgErr } = await supabase.from("assignments").select("*").eq("id", id).single();
        if (asgErr) return res.status(404).json({ error: "Tarea no encontrada." });
        assignment = asgData;

        const { data: stData, error: stErr } = await supabase.from("allowed_students").select("*");
        if (stErr) throw stErr;
        dbStudents = stData || [];

        const { data: subData, error: subErr } = await supabase.from("submissions").select("*");
        if (subErr) throw subErr;
        dbSubmissions = subData || [];
      } else {
        assignment = assignmentsList.find(item => item.id === id);
        if (!assignment) {
          return res.status(404).json({ error: "Tarea no encontrada." });
        }
        dbStudents = allowedStudentsList;
        dbSubmissions = submissionsList;
      }

      const targetSection = assignment.section;
      const targetedStudents = dbStudents.filter(
        student => targetSection === "TODOS" || student.section === targetSection
      );

      if (targetedStudents.length === 0) {
        return res.json({ success: true, count: 0, reminded: [], message: "No hay alumnos autorizados en este grado." });
      }

      const reminded: string[] = [];
      const newNotifications: AppNotification[] = [];

      targetedStudents.forEach(student => {
        const normStudentCi = student.ci.replace(/\D/g, "");
        const hasSubmitted = dbSubmissions.some(sub => {
          const normSubCi = sub.ci.replace(/\D/g, "");
          if (normSubCi !== normStudentCi) return false;
          if (sub.assignmentId === id) return true;
          if (sub.comments && sub.comments.toLowerCase().includes(assignment.title.toLowerCase())) return true;
          return false;
        });

        if (!hasSubmitted) {
          const reminderNotification: AppNotification = {
            id: "reminder-notif-" + Math.random().toString(36).substring(2, 11),
            recipientRole: "STUDENT",
            recipientCi: normStudentCi,
            title: "¡Recordatorio de Tarea! ⏰",
            message: `La Profesora Anuvis Medina te recuerda que tienes pendiente entregar: "${assignment.title}". Por favor, envíala pronto.`,
            type: "SYSTEM",
            read: false,
            createdAt: new Date().toISOString()
          };
          newNotifications.push(reminderNotification);
          reminded.push(student.name);
        }
      });

      if (newNotifications.length > 0) {
        if (isSupabase) {
          const { error } = await supabase.from("notifications").insert(newNotifications);
          if (error) throw error;
        } else {
          notificationsList.unshift(...newNotifications);
          saveNotifications();
        }
      }

      res.json({
        success: true,
        count: newNotifications.length,
        reminded,
        message: newNotifications.length > 0 
          ? `Se envió un recordatorio a ${newNotifications.length} estudiantes.` 
          : "Todos los alumnos de este grado ya han entregado la tarea."
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al enviar recordatorios." });
    }
  });

  // API Route: GET all chat rooms
  app.get("/api/chat/rooms", async (req, res) => {
    const { role, ci, section } = req.query;

    try {
      let dbStudents: AuthorizedStudent[] = [];
      let dbRooms: ChatRoom[] = [];
      let dbAssignments: Assignment[] = [];

      if (isSupabase) {
        const { data: stData, error: stErr } = await supabase.from("allowed_students").select("*");
        if (stErr) throw stErr;
        dbStudents = stData || [];

        const { data: rmData, error: rmErr } = await supabase.from("chat_rooms").select("*");
        if (rmErr) throw rmErr;
        dbRooms = rmData || [];

        const { data: asData, error: asErr } = await supabase.from("assignments").select("*");
        if (asErr) throw asErr;
        dbAssignments = asData || [];
      } else {
        dbStudents = allowedStudentsList;
        dbRooms = chatRoomsList;
        dbAssignments = assignmentsList;
      }

      if (role === "STUDENT") {
        if (!ci) {
          return res.status(400).json({ error: "Debe ingresar una cédula para acceder al chat." });
        }
        const cleanCi = String(ci).replace(/\D/g, "");
        const isAuthorized = dbStudents.some((s) => s.ci.replace(/\D/g, "") === cleanCi);
        if (!isAuthorized) {
          return res.status(403).json({ error: "Acceso Denegado por Seguridad: Tu número de Cédula no está registrado/autorizado por la Profesora Anuvis Medina en el sistema." });
        }
      }

      // Sync assignment rooms
      const missingRooms: ChatRoom[] = [];
      dbAssignments.forEach(asg => {
        const roomId = `assignment-${asg.id}`;
        if (!dbRooms.some(r => r.id === roomId)) {
          const newRoom: ChatRoom = {
            id: roomId,
            type: "ASSIGNMENT",
            name: `Dudas: ${asg.title}`,
            section: asg.section === "TODOS" ? undefined : asg.section,
            assignmentId: asg.id,
            createdAt: asg.createdAt
          };
          missingRooms.push(newRoom);
          dbRooms.push(newRoom);
        }
      });

      if (missingRooms.length > 0) {
        if (isSupabase) {
          const { error } = await supabase.from("chat_rooms").insert(missingRooms);
          if (error) throw error;
        } else {
          chatRoomsList.push(...missingRooms);
          saveChatRooms();
        }
      }

      // Private chat room auto-creation
      if (role === "STUDENT" && ci) {
        const cleanCi = String(ci).replace(/\D/g, "");
        const privateRoomId = `private-${cleanCi}`;
        if (!dbRooms.some(r => r.id === privateRoomId)) {
          const newPriv: ChatRoom = {
            id: privateRoomId,
            type: "PRIVATE",
            name: "Mensajes con Profa. Anuvis Medina",
            memberCis: [cleanCi],
            createdAt: new Date().toISOString()
          };
          if (isSupabase) {
            const { error } = await supabase.from("chat_rooms").insert([newPriv]);
            if (error) throw error;
          } else {
            chatRoomsList.push(newPriv);
            saveChatRooms();
          }
          dbRooms.push(newPriv);
        }
      }

      if (role === "TEACHER") {
        return res.json(dbRooms);
      }

      if (role === "STUDENT" && ci) {
        const cleanCi = String(ci).replace(/\D/g, "");
        const normSection = section ? String(section) : "";

        const studentRooms = dbRooms.filter(room => {
          if (room.type === "GRADE") {
            return room.section === normSection;
          }
          if (room.type === "ASSIGNMENT") {
            return !room.section || room.section === normSection;
          }
          if (room.type === "PRIVATE" || room.type === "GROUP") {
            return room.memberCis && room.memberCis.includes(cleanCi);
          }
          return false;
        });
        return res.json(studentRooms);
      }

      res.json(dbRooms);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al procesar salas de chat." });
    }
  });

  // API Route: POST create group chat
  app.post("/api/chat/rooms/group", async (req, res) => {
    const { name, memberCis, section } = req.body;
    if (!name || !memberCis || !Array.isArray(memberCis) || memberCis.length === 0) {
      return res.status(400).json({ error: "Nombre del grupo y lista de alumnos seleccionados son obligatorios." });
    }

    const roomId = `group-${Date.now()}`;
    const newGroup: ChatRoom = {
      id: roomId,
      type: "GROUP",
      name: name.trim(),
      section: section || undefined,
      memberCis: memberCis.map(c => String(c).replace(/\D/g, "")),
      createdAt: new Date().toISOString()
    };

    const welcomeMsg: ChatMessage = {
      id: `msg-welcome-${Date.now()}`,
      roomId,
      senderName: "SISTEMA",
      senderRole: "TEACHER",
      message: `¡Grupo '${name}' creado con éxito! Miembros: ${memberCis.length} alumnos de la sección.`,
      createdAt: new Date().toISOString()
    };

    try {
      if (isSupabase) {
        const { error: rmErr } = await supabase.from("chat_rooms").insert([newGroup]);
        if (rmErr) throw rmErr;

        const { error: msgErr } = await supabase.from("chat_messages").insert([welcomeMsg]);
        if (msgErr) throw msgErr;
      } else {
        chatRoomsList.push(newGroup);
        saveChatRooms();

        chatMessagesList.push(welcomeMsg);
        saveChatMessages();
      }

      res.json({ success: true, room: newGroup });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al crear grupo." });
    }
  });

  // API Route: GET all chat messages
  app.get("/api/chat/messages", async (req, res) => {
    const { role, ci, section } = req.query;

    try {
      let dbStudents: AuthorizedStudent[] = [];
      let dbRooms: ChatRoom[] = [];
      let dbMessages: ChatMessage[] = [];

      if (isSupabase) {
        const { data: stData } = await supabase.from("allowed_students").select("*");
        dbStudents = stData || [];

        const { data: rmData } = await supabase.from("chat_rooms").select("*");
        dbRooms = rmData || [];

        const { data: msgData, error: msgErr } = await supabase.from("chat_messages").select("*").order("createdAt", { ascending: true });
        if (msgErr) throw msgErr;
        dbMessages = msgData || [];
      } else {
        dbStudents = allowedStudentsList;
        dbRooms = chatRoomsList;
        dbMessages = chatMessagesList;
      }

      if (role === "STUDENT") {
        if (!ci) {
          return res.status(400).json({ error: "Debe ingresar una cédula para acceder al chat." });
        }
        const cleanCi = String(ci).replace(/\D/g, "");
        const isAuthorized = dbStudents.some((s) => s.ci.replace(/\D/g, "") === cleanCi);
        if (!isAuthorized) {
          return res.status(403).json({ error: "Acceso Denegado por Seguridad: Tu número de Cédula no está registrado/autorizado por la Profesora Anuvis Medina en el sistema." });
        }
      }

      if (role === "TEACHER") {
        return res.json(dbMessages);
      }

      if (role === "STUDENT" && ci) {
        const cleanCi = String(ci).replace(/\D/g, "");
        const normSection = section ? String(section) : "";

        const studentRooms = dbRooms.filter(room => {
          if (room.type === "GRADE") {
            return room.section === normSection;
          }
          if (room.type === "ASSIGNMENT") {
            return !room.section || room.section === normSection;
          }
          if (room.type === "PRIVATE" || room.type === "GROUP") {
            return room.memberCis && room.memberCis.includes(cleanCi);
          }
          return false;
        });

        const studentRoomIds = studentRooms.map(r => r.id);
        const studentMessages = dbMessages.filter(m => studentRoomIds.includes(m.roomId));
        return res.json(studentMessages);
      }

      res.json(dbMessages);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al obtener mensajes." });
    }
  });

  // API Route: GET specific room messages
  app.get("/api/chat/rooms/:roomId/messages", async (req, res) => {
    const { roomId } = req.params;

    try {
      if (isSupabase) {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("roomId", roomId)
          .order("createdAt", { ascending: true });
        if (error) throw error;
        return res.json(data);
      }

      const messages = chatMessagesList.filter(m => m.roomId === roomId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al cargar mensajes del canal." });
    }
  });

  // API Route: POST send chat message
  app.post("/api/chat/rooms/:roomId/messages", async (req, res) => {
    const { roomId } = req.params;
    const { message, senderRole, senderName, senderCi, mediaUrl, mediaType, mediaName } = req.body;

    const cleanCi = senderCi ? String(senderCi).replace(/\D/g, "") : "";

    try {
      let dbStudents: AuthorizedStudent[] = [];
      let dbRestrictedCis: string[] = [];
      let dbMutedRooms: string[] = [];
      let dbRooms: ChatRoom[] = [];

      if (isSupabase) {
        const { data: stData } = await supabase.from("allowed_students").select("*");
        dbStudents = stData || [];

        const { data: restData } = await supabase.from("chat_restricted_students").select("ci");
        dbRestrictedCis = (restData || []).map((r: any) => r.ci);

        const { data: muteData } = await supabase.from("chat_muted_rooms").select("roomId");
        dbMutedRooms = (muteData || []).map((r: any) => r.roomId);

        const { data: rmData } = await supabase.from("chat_rooms").select("*");
        dbRooms = rmData || [];
      } else {
        dbStudents = allowedStudentsList;
        dbRestrictedCis = restrictedCisList;
        dbMutedRooms = mutedRoomsList;
        dbRooms = chatRoomsList;
      }

      if (senderRole === "STUDENT") {
        if (!cleanCi) {
          return res.status(403).json({ error: "Acceso Denegado: Cédula de identidad no válida." });
        }
        const isAuthorized = dbStudents.some((s) => s.ci.replace(/\D/g, "") === cleanCi);
        if (!isAuthorized) {
          return res.status(403).json({ error: "Acceso Denegado por Seguridad: Tu número de Cédula no está registrado/autorizado por la Profesora Anuvis Medina en el sistema." });
        }
      }

      if (senderRole === "STUDENT" && cleanCi && dbRestrictedCis.includes(cleanCi)) {
        return res.status(403).json({ error: "La Profesora Anuvis Medina Anuvis Medina ha restringido tu participación en el chat debido al uso de vocabulario inadecuado o comportamiento inapropiado." });
      }

      if (senderRole === "STUDENT" && dbMutedRooms.includes(roomId)) {
        return res.status(403).json({ error: "Este canal de chat ha sido pausado temporalmente por la Profesora Anuvis Medina Anuvis Medina. Solo lectura." });
      }

      if ((!message || !message.trim()) && !mediaUrl) {
        return res.status(400).json({ error: "El mensaje o archivo no puede estar vacío." });
      }

      if (senderRole === "STUDENT" && message && hasOffensiveContent(message)) {
        return res.status(400).json({
          error: "⚠️ No se permiten palabras obscenas o inapropiadas en el aula de clases. Por favor, mantén el respeto por tus compañeros y la Profesora Anuvis Medina."
        });
      }

      let room = dbRooms.find(r => r.id === roomId);
      if (!room) {
        if (roomId.startsWith("private-")) {
          const studentCi = roomId.replace("private-", "");
          const newPrivRoom: ChatRoom = {
            id: roomId,
            type: "PRIVATE",
            name: "Mensajes Privados",
            memberCis: [studentCi],
            createdAt: new Date().toISOString()
          };
          if (isSupabase) {
            const { error } = await supabase.from("chat_rooms").insert([newPrivRoom]);
            if (error) throw error;
          } else {
            chatRoomsList.push(newPrivRoom);
            saveChatRooms();
          }
          room = newPrivRoom;
        } else {
          return res.status(404).json({ error: "Sala de chat no encontrada." });
        }
      }

      const newMessageId = `msg-${Date.now()}-${Math.round(Math.random() * 100000)}`;
      const newMessage: ChatMessage = {
        id: newMessageId,
        roomId,
        senderName: senderName || (senderRole === "TEACHER" ? "Profesora Anuvis Medina" : "Alumno General"),
        senderRole,
        senderCi: senderCi ? String(senderCi).replace(/\D/g, "") : undefined,
        message: (message || "").trim(),
        createdAt: new Date().toISOString(),
        mediaUrl,
        mediaType,
        mediaName
      };

      if (isSupabase) {
        const { error } = await supabase.from("chat_messages").insert([newMessage]);
        if (error) throw error;
      } else {
        chatMessagesList.push(newMessage);
        saveChatMessages();
      }

      // Generate notification for private chat to teacher
      if (senderRole === "STUDENT" && room && room.type === "PRIVATE") {
        let isDuplicate = false;
        if (isSupabase) {
          const { data: existingNotifs } = await supabase
            .from("notifications")
            .select("*")
            .eq("recipientRole", "TEACHER")
            .eq("read", false);
          isDuplicate = (existingNotifs || []).some((n: any) => n.message.includes(`Mensaje de ${senderName}`));
        } else {
          isDuplicate = notificationsList.some(
            n => n.type === "SYSTEM" && !n.read && n.message.includes(`Mensaje de ${senderName}`)
          );
        }

        if (!isDuplicate) {
          const directNotif: AppNotification = {
            id: `noti-msg-${Date.now()}`,
            recipientRole: "TEACHER",
            title: "💬 Nuevo mensaje de chat",
            message: `El alumno ${senderName} te ha enviado un mensaje de chat privado.`,
            type: "SYSTEM",
            read: false,
            createdAt: new Date().toISOString()
          };
          if (isSupabase) {
            await supabase.from("notifications").insert([directNotif]);
          } else {
            notificationsList.unshift(directNotif);
            saveNotifications();
          }
        }
      }

      res.json({ success: true, message: newMessage });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al enviar mensaje." });
    }
  });

  // API Route: GET chat restrictions
  app.get("/api/chat/restrictions", async (req, res) => {
    try {
      if (isSupabase) {
        const { data: restData, error: restErr } = await supabase.from("chat_restricted_students").select("ci");
        if (restErr) throw restErr;
        const { data: muteData, error: muteErr } = await supabase.from("chat_muted_rooms").select("roomId");
        if (muteErr) throw muteErr;

        const restrictedCis = (restData || []).map((r: any) => r.ci);
        const mutedRooms = (muteData || []).map((r: any) => r.roomId);
        return res.json({ restrictedCis, mutedRooms });
      }

      res.json({
        restrictedCis: restrictedCisList,
        mutedRooms: mutedRoomsList
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al cargar restricciones." });
    }
  });

  // API Route: POST update chat restrictions
  app.post("/api/chat/restrictions", async (req, res) => {
    const { action, ci, roomId, value } = req.body;

    try {
      if (action === "toggle-student-mute" && ci) {
        const cleanCi = String(ci).replace(/\D/g, "");
        if (isSupabase) {
          if (value) {
            const { error } = await supabase
              .from("chat_restricted_students")
              .upsert({ ci: cleanCi });
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("chat_restricted_students")
              .delete()
              .eq("ci", cleanCi);
            if (error) throw error;
          }
          const { data: restData } = await supabase.from("chat_restricted_students").select("ci");
          const restrictedCis = (restData || []).map((r: any) => r.ci);
          return res.json({ success: true, restrictedCis });
        } else {
          if (value) {
            if (!restrictedCisList.includes(cleanCi)) {
              restrictedCisList.push(cleanCi);
            }
          } else {
            restrictedCisList = restrictedCisList.filter(c => c !== cleanCi);
          }
          saveRestrictions();
          return res.json({ success: true, restrictedCis: restrictedCisList });
        }
      }

      if (action === "toggle-room-mute" && roomId) {
        if (isSupabase) {
          if (value) {
            const { error } = await supabase
              .from("chat_muted_rooms")
              .upsert({ roomId });
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("chat_muted_rooms")
              .delete()
              .eq("roomId", roomId);
            if (error) throw error;
          }
          const { data: muteData } = await supabase.from("chat_muted_rooms").select("roomId");
          const mutedRooms = (muteData || []).map((r: any) => r.roomId);
          return res.json({ success: true, mutedRooms });
        } else {
          if (value) {
            if (!mutedRoomsList.includes(roomId)) {
              mutedRoomsList.push(roomId);
            }
          } else {
            mutedRoomsList = mutedRoomsList.filter(id => id !== roomId);
          }
          saveRestrictions();
          return res.json({ success: true, mutedRooms: mutedRoomsList });
        }
      }

      res.status(400).json({ error: "Parámetros de restricción no válidos." });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al actualizar restricciones de chat." });
    }
  });

  // API Route: GET authorized students
  app.get("/api/authorized-students", async (req, res) => {
    try {
      if (isSupabase) {
        const { data, error } = await supabase
          .from("allowed_students")
          .select("*")
          .order("name", { ascending: true });
        if (error) throw error;
        return res.json(data);
      }
      res.json(allowedStudentsList);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al obtener alumnos autorizados." });
    }
  });

  // API Route: POST add/update authorized student
  app.post("/api/authorized-students", async (req, res) => {
    const { name, ci, section } = req.body;
    if (!name || !ci || !section) {
      return res.status(400).json({ error: "Todos los campos son obligatorios (Nombre, Cédula, Sección)." });
    }

    if (!["Primer Grado", "Segundo Grado", "Tercer Grado", "Cuarto Grado", "Quinto Grado"].includes(section)) {
      return res.status(400).json({ error: "Grado no válido." });
    }

    const normCi = ci.toString().replace(/\D/g, "");

    try {
      let existingId = Math.random().toString(36).substring(2, 11);
      if (isSupabase) {
        const { data, error } = await supabase
          .from("allowed_students")
          .select("*");
        if (error) throw error;
        const match = (data || []).find((s: any) => s.ci.replace(/\D/g, "") === normCi && s.section === section);
        if (match) existingId = match.id;
      } else {
        const index = allowedStudentsList.findIndex((s) => s.ci.replace(/\D/g, "") === normCi && s.section === section);
        if (index !== -1) existingId = allowedStudentsList[index].id;
      }

      const newStudent: AuthorizedStudent = {
        id: existingId,
        name: name.trim().toUpperCase(),
        ci: ci.toString().trim(),
        section: section as any,
        createdAt: new Date().toISOString()
      };

      if (isSupabase) {
        const { error } = await supabase.from("allowed_students").upsert([newStudent]);
        if (error) throw error;
      } else {
        const existingIndex = allowedStudentsList.findIndex((s) => s.ci.replace(/\D/g, "") === normCi && s.section === section);
        if (existingIndex !== -1) {
          allowedStudentsList[existingIndex] = newStudent;
        } else {
          allowedStudentsList.unshift(newStudent);
        }
        saveAllowedStudents();
      }

      res.status(201).json({ success: true, student: newStudent });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al guardar alumno." });
    }
  });

  // API Route: POST import students
  app.post("/api/authorized-students/import", async (req, res) => {
    const { section, studentsText } = req.body;
    if (!section || !studentsText) {
      return res.status(400).json({ error: "Sección y texto de alumnos obligatorios." });
    }

    if (!["Primer Grado", "Segundo Grado", "Tercer Grado", "Cuarto Grado", "Quinto Grado"].includes(section)) {
      return res.status(400).json({ error: "Grado no válido." });
    }

    const lines = studentsText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const addedStudents: AuthorizedStudent[] = [];

    try {
      let dbStudents: AuthorizedStudent[] = [];
      if (isSupabase) {
        const { data } = await supabase.from("allowed_students").select("*");
        dbStudents = data || [];
      } else {
        dbStudents = allowedStudentsList;
      }

      lines.forEach((line: string) => {
        let parts = line.split(/[,;\t]/).map((p: string) => p.trim()).filter(Boolean);

        if (parts.length < 2) {
          const words = line.split(/\s+/);
          if (words.length >= 2) {
            const ciIndex = words.findIndex((w: string) => /^\d+$/.test(w.replace(/\D/g, "")));
            if (ciIndex !== -1) {
              const rawCi = words[ciIndex];
              const nameWords = words.filter((_, idx) => idx !== ciIndex);
              parts = [rawCi, nameWords.join(" ")];
            }
          }
        }

        if (parts.length >= 2) {
          let rawCi = parts[0];
          let rawName = parts[1];

          if (/^\d+$/.test(rawName.replace(/\D/g, "")) && !/^\d+$/.test(rawCi.replace(/\D/g, ""))) {
            rawCi = parts[1];
            rawName = parts[0];
          }

          const cleanCi = rawCi.trim();
          const cleanName = rawName.replace(/["']/g, "").trim().toUpperCase();

          if (cleanCi && cleanName) {
            const normCi = cleanCi.replace(/\D/g, "");
            const existingIndex = dbStudents.findIndex(
              (s) => s.ci.replace(/\D/g, "") === normCi && s.section === section
            );

            const studentObj: AuthorizedStudent = {
              id: existingIndex !== -1 ? dbStudents[existingIndex].id : Math.random().toString(36).substring(2, 11),
              name: cleanName,
              ci: cleanCi,
              section: section as any,
              createdAt: new Date().toISOString()
            };

            addedStudents.push(studentObj);
          }
        }
      });

      if (addedStudents.length > 0) {
        if (isSupabase) {
          const { error } = await supabase.from("allowed_students").upsert(addedStudents);
          if (error) throw error;
        } else {
          addedStudents.forEach(st => {
            const norm = st.ci.replace(/\D/g, "");
            const existingIndex = allowedStudentsList.findIndex(
              (s) => s.ci.replace(/\D/g, "") === norm && s.section === section
            );
            if (existingIndex !== -1) {
              allowedStudentsList[existingIndex] = st;
            } else {
              allowedStudentsList.push(st);
            }
          });
          saveAllowedStudents();
        }
      }

      res.json({ success: true, count: addedStudents.length, students: addedStudents });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al importar alumnos." });
    }
  });

  // API Route: DELETE authorized student
  app.delete("/api/authorized-students/:id", async (req, res) => {
    const { id } = req.params;

    try {
      if (isSupabase) {
        const { error } = await supabase
          .from("allowed_students")
          .delete()
          .eq("id", id);
        if (error) throw error;
        return res.json({ success: true });
      }

      const index = allowedStudentsList.findIndex((s) => s.id === id);
      if (index === -1) {
        return res.status(404).json({ error: "Alumno no encontrado." });
      }

      allowedStudentsList.splice(index, 1);
      saveAllowedStudents();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Error al eliminar alumno." });
    }
  });

  // API Route: POST upload files to Supabase Storage
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No se subió ningún archivo." });
    }

    try {
      const fileBuffer = req.file.buffer;
      const originalName = req.file.originalname;
      const ext = path.extname(originalName);
      
      // Calculate SHA-256 hash of the file buffer to prevent duplicates
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const fileHash = hashSum.digest('hex');

      // Check if hash already exists
      if (isSupabase) {
        const { data: existingHash } = await supabase
          .from('file_hashes')
          .select('hash, file_url')
          .eq('hash', fileHash)
          .single();

        if (existingHash) {
          return res.status(409).json({ error: "Este archivo ya ha sido subido anteriormente. No puedes enviar archivos repetidos." });
        }
      } else {
        if (fileHashesList.some(f => f.hash === fileHash)) {
          return res.status(409).json({ error: "Este archivo ya ha sido subido anteriormente. No puedes enviar archivos repetidos." });
        }
      }

      const sanitizedBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, "_");
      const uniqueFilename = `${sanitizedBase}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      // Upload directly to Supabase Storage Bucket 'uploads'
      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(uniqueFilename, fileBuffer, {
          contentType: req.file.mimetype,
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get Public URL
      const { data: publicUrlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(uniqueFilename);

      // Save the hash to prevent future duplicates
      if (isSupabase) {
        await supabase.from('file_hashes').insert([{ hash: fileHash, file_url: publicUrlData.publicUrl }]);
      } else {
        fileHashesList.push({ hash: fileHash, url: publicUrlData.publicUrl });
        saveFileHashes();
      }

      res.json({
        url: publicUrlData.publicUrl,
        originalName: originalName,
        filename: uniqueFilename,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    } catch (err: any) {
      console.error("Error uploading to Supabase Storage:", err);
      // Let's check if the error is due to missing 'file_hashes' table
      if (err.code === '42P01') {
        res.status(500).json({ error: "Falta la tabla 'file_hashes' en la base de datos." });
      } else {
        res.status(500).json({ error: "Error subiendo el archivo a la nube." });
      }
    }
  });

  // Local file serving routes removed because we now serve from Supabase Public URLs

  // API Route: Login with Magic Link
  app.get("/api/auth/google", async (req, res) => {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: 'anuvismedina8@gmail.com',
        options: {
          shouldCreateUser: true
        }
      });

      if (error) {
        throw error;
      }

      res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verificación Requerida</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f0f4f4; color: #004d4d; text-align: center; padding: 20px; }
            h1 { font-size: 24px; margin-bottom: 10px; }
            p { color: #555; max-w: 400px; line-height: 1.5; margin-bottom: 20px; }
            .icon { font-size: 64px; margin-bottom: 20px; }
            .btn { background: #004d4d; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="icon">✉️</div>
          <h1>Revisa tu celular</h1>
          <p>Por motivos de máxima seguridad, hemos enviado un <b>Enlace Mágico</b> al correo <b>anuvismedina8@gmail.com</b>.</p>
          <p>Abre la aplicación de Gmail en tu celular, busca el correo de "Supabase" o "Liceo Palmarito" y haz clic en el enlace para entrar de forma segura a la plataforma.</p>
          <p style="font-size: 12px; opacity: 0.7;">(Puedes cerrar esta ventana)</p>
          <a href="/" class="btn">Volver al inicio</a>
        </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Auth error:", err);
      res.status(500).send("Error al enviar el enlace de seguridad.");
    }
  });

  // Hotfix static route for assets during production or vite delivery
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
