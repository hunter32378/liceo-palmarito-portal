import React, { useState, useEffect, useRef } from "react";
import { 
  Bell, BellOff, Check, Trash2, X, Info, Award, ClipboardCheck, 
  Settings, Volume2, VolumeX, Music, Upload, Play, Smartphone,
  User, TrendingUp, Calendar, BookOpen, ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AppNotification, AuthorizedStudent, Submission } from "../types";
import { parseDateString, getDaysUntil } from "../utils";

// Helper to extract student info from submission notification messages
function extractStudentInfoFromMessage(message: string): { studentName: string; sectionName: string } | null {
  if (!message) return null;
  const match = message.match(/^([^(]+)\s*\(([^)]+)\)/);
  if (match) {
    return {
      studentName: match[1].trim(),
      sectionName: match[2].trim(),
    };
  }
  return null;
}

// Utility to calculate average grade for a student's graded submissions
function calculateAverageGrade(subs: Submission[]): string {
  const gradedList = subs.filter(s => s.grade && !isNaN(parseFloat(s.grade)));
  if (gradedList.length === 0) return "N/A";
  const sum = gradedList.reduce((acc, curr) => acc + parseFloat(curr.grade!), 0);
  return (sum / gradedList.length).toFixed(1);
}

// IndexedDB setup for holding the custom audio song of any size
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("NotificationSettingsDB", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sounds")) {
        db.createObjectStore("sounds", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveCustomSound = async (dataUrl: string, fileName: string): Promise<boolean> => {
  try {
    const db = await openDB();
    const tx = db.transaction("sounds", "readwrite");
    const store = tx.objectStore("sounds");
    store.put({ id: "custom_ringtone", name: fileName, data: dataUrl });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
    });
  } catch (err) {
    console.error("Error saving sound to IndexedDB:", err);
    return false;
  }
};

const getCustomSound = async (): Promise<{ name: string; data: string } | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction("sounds", "readonly");
    const store = tx.objectStore("sounds");
    return new Promise((resolve) => {
      const req = store.get("custom_ringtone");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error("Error loading sound from IndexedDB:", err);
    return null;
  }
};

// Generates beautiful synth melodies directly via Web Audio API, avoiding 404 assets
function playPresetSound(type: string, volume: number) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    if (type === "bell") {
      // Elegant crystal bell sound (melodic chime)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6

      gainNode.gain.setValueAtTime(0.8, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(masterGain);

      osc1.start();
      osc2.start();
      
      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);
    } else if (type === "school") {
      // Energetic double electronic beep sweep
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.setValueAtTime(698.46, ctx.currentTime + 0.15); // F5
      
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1174.66, ctx.currentTime);
      osc2.frequency.setValueAtTime(1396.91, ctx.currentTime + 0.15);

      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(masterGain);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.55);
      osc2.stop(ctx.currentTime + 0.55);
    } else if (type === "retro") {
      // Arcade coin/retro raise bubble step
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gainNode);
      gainNode.connect(masterGain);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch (err) {
    console.error("Web Audio API error:", err);
  }
}

interface NotificationCenterProps {
  role: "TEACHER" | "STUDENT";
  ci?: string;
  onNewNotificationsCount?: (count: number) => void;
  onNotificationAction?: (n: AppNotification) => void;
}

export default function NotificationCenter({
  role,
  ci,
  onNewNotificationsCount,
  onNotificationAction
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [panelView, setPanelView] = useState<"list" | "settings">("list");

  // States for Student Quick View Modal
  const [showQuickViewModal, setShowQuickViewModal] = useState(false);
  const [quickViewNotification, setQuickViewNotification] = useState<AppNotification | null>(null);
  const [quickViewLoading, setQuickViewLoading] = useState(false);
  const [students, setStudents] = useState<AuthorizedStudent[]>([]);
  const [submissionsList, setSubmissionsList] = useState<Submission[]>([]);
  const [selectedQuickViewData, setSelectedQuickViewData] = useState<{
    student: AuthorizedStudent | null;
    submissions: Submission[];
  } | null>(null);

  const handleQuickView = async (n: AppNotification) => {
    // 1. Mark as read immediately if not read
    if (!n.read) {
      markAsRead(n.id);
    }

    setQuickViewLoading(true);
    setQuickViewNotification(n);
    setShowQuickViewModal(true);

    try {
      let currentStudents = students;
      let currentSubmissions = submissionsList;

      // Lazy load students and submissions
      if (students.length === 0 || submissionsList.length === 0) {
        const [studentsRes, submissionsRes] = await Promise.all([
          fetch("/api/authorized-students"),
          fetch("/api/submissions")
        ]);

        if (studentsRes.ok) {
          const studentsData = await studentsRes.json();
          setStudents(studentsData);
          currentStudents = studentsData;
        }
        if (submissionsRes.ok) {
          const submissionsData = await submissionsRes.json();
          setSubmissionsList(submissionsData);
          currentSubmissions = submissionsData;
        }
      }

      // 2. Parse student name and section from notification message
      const extracted = extractStudentInfoFromMessage(n.message);
      let matchedStudent: AuthorizedStudent | null = null;
      let matchingSubmissions: Submission[] = [];

      if (extracted) {
        const { studentName, sectionName } = extracted;
        
        // Find matching registered student
        matchedStudent = currentStudents.find(
          s => s.name.trim().toLowerCase() === studentName.toLowerCase()
        ) || null;

        // Collect matching submissions
        if (matchedStudent) {
          const cleanCi = matchedStudent.ci.replace(/\D/g, "");
          matchingSubmissions = currentSubmissions.filter(
            sub => sub.ci.replace(/\D/g, "") === cleanCi
          );
        } else {
          matchingSubmissions = currentSubmissions.filter(
            sub => sub.name.trim().toLowerCase() === studentName.toLowerCase()
          );
        }

        // Virtual student model if unregistered but has active submissions
        if (!matchedStudent && matchingSubmissions.length > 0) {
          const firstSub = matchingSubmissions[0];
          matchedStudent = {
            id: `virtual-${firstSub.id}`,
            name: firstSub.name,
            ci: firstSub.ci,
            section: firstSub.section,
            createdAt: firstSub.createdAt,
          };
        }

        // Fallback placeholder record
        if (!matchedStudent) {
          matchedStudent = {
            id: "fallback-temp",
            name: studentName,
            ci: "(No registrado/a)",
            section: sectionName as any,
            createdAt: new Date().toISOString(),
          };
        }
      }

      setSelectedQuickViewData({
        student: matchedStudent,
        submissions: matchingSubmissions,
      });

    } catch (err) {
      console.error("Error loaded quick view details:", err);
    } finally {
      setQuickViewLoading(false);
    }
  };

  // Load sound and vibration settings from localStorage
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("notif_sound_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [soundType, setSoundType] = useState<string>(() => {
    return localStorage.getItem("notif_sound_type") || "bell";
  });
  const [soundVolume, setSoundVolume] = useState<number>(() => {
    const saved = localStorage.getItem("notif_sound_volume");
    return saved !== null ? parseFloat(saved) : 0.8;
  });
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("notif_vibrate_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [vibratePattern, setVibratePattern] = useState<string>(() => {
    return localStorage.getItem("notif_vibrate_pattern") || "double";
  });
  const [customFileName, setCustomFileName] = useState<string>("");

  // Global Notification Preferences (specifically for TEACHER)
  const [notifySubmissions, setNotifySubmissions] = useState<boolean>(() => {
    const saved = localStorage.getItem("notif_teacher_submissions");
    return saved !== null ? saved === "true" : true;
  });
  const [notifyPrivateChat, setNotifyPrivateChat] = useState<boolean>(() => {
    const saved = localStorage.getItem("notif_teacher_private_chat");
    return saved !== null ? saved === "true" : true;
  });

  // Automatic Task Reminders Enable/Disable State
  const [taskRemindersEnabled, setTaskRemindersEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("notif_task_reminders_enabled");
    return saved !== null ? saved === "true" : true;
  });

  const [dismissedReminders, setDismissedReminders] = useState<string[]>(() => {
    const saved = localStorage.getItem("notif_dismissed_reminders");
    return saved ? JSON.parse(saved) : [];
  });

  const [alertedTaskIds, setAlertedTaskIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("notif_alerted_task_ids");
    return saved ? JSON.parse(saved) : [];
  });

  const [calendarAssignments, setCalendarAssignments] = useState<any[]>([]);

  // Check if any assignment matching current grade has less than 24 hours left
  const hasUrgentTask = React.useMemo(() => {
    if (role !== "STUDENT") return false;
    return calendarAssignments.some(asg => {
      if (!asg.dueDate) return false;

      let studentSection: string | null = null;
      if (ci && students.length > 0) {
        const matched = students.find(s => s.ci.replace(/\D/g, "") === ci.replace(/\D/g, ""));
        if (matched) studentSection = matched.section;
      }

      const gradeMatches = 
        !studentSection || 
        asg.section === "TODOS" || 
        asg.section === studentSection;

      if (!gradeMatches) return false;

      const targetDate = parseDateString(asg.dueDate);
      if (!targetDate) return false;

      const now = new Date();
      const diffTimeMs = targetDate.getTime() - now.getTime();
      const hrs = diffTimeMs / (1000 * 60 * 60);

      // Remaining deadline time less than 24h but not expired
      return hrs > 0 && hrs < 24;
    });
  }, [role, calendarAssignments, ci, students]);

  // Local deadline notifications computed dynamically
  const localDeadlineNotifications = React.useMemo(() => {
    if (role !== "STUDENT" || !taskRemindersEnabled) return [];

    return calendarAssignments
      .filter(asg => {
        if (!asg.dueDate) return false;
        
        let studentSection: string | null = null;
        if (ci && students.length > 0) {
          const matched = students.find(s => s.ci.replace(/\D/g, "") === ci.replace(/\D/g, ""));
          if (matched) studentSection = matched.section;
        }

        const gradeMatches = 
          !studentSection || 
          asg.section === "TODOS" || 
          asg.section === studentSection;

        if (!gradeMatches) return false;

        const targetDate = parseDateString(asg.dueDate);
        if (!targetDate) return false;

        const now = new Date();
        const diffTimeMs = targetDate.getTime() - now.getTime();
        const hrs = diffTimeMs / (1000 * 60 * 60);

        // Less than 24 hours left, but not expired more than 24 hours ago
        return hrs > -24 && hrs < 24;
      })
      .map(asg => {
        const isRead = dismissedReminders.includes(asg.id);
        const targetDate = parseDateString(asg.dueDate!);
        const now = new Date();
        const diffTimeMs = targetDate!.getTime() - now.getTime();
        const hrs = Math.max(0, Math.ceil(diffTimeMs / (1000 * 60 * 60)));

        return {
          id: `deadline-${asg.id}`,
          recipientRole: "STUDENT" as const,
          title: `⏳ ¡Plazo menor a 24h!: ${asg.title}`,
          message: hrs === 0 
            ? `Quedan pocos minutos para el plazo de entrega hoy: "${asg.title}".`
            : `Faltan solo ${hrs} ${hrs === 1 ? "hora" : "horas"} para la fecha límite de "${asg.title}": ${asg.dueDate}.`,
          type: "GRADE" as const, // Render in gold style
          read: isRead,
          createdAt: asg.createdAt || new Date().toISOString()
        };
      });
  }, [role, taskRemindersEnabled, calendarAssignments, dismissedReminders, ci, students]);

  // Computed displayed notifications based on active preferences
  const displayedNotifications = React.useMemo(() => {
    let list = [...notifications];
    
    // Merge local deadline notifications for student
    if (role === "STUDENT" && taskRemindersEnabled) {
      list = [...localDeadlineNotifications, ...list];
    }

    return list.filter(n => {
      if (role !== "TEACHER") return true;
      if (n.type === "SUBMISSION" && !notifySubmissions) return false;
      if (n.type === "SYSTEM" && !notifyPrivateChat) return false;
      return true;
    });
  }, [notifications, localDeadlineNotifications, role, taskRemindersEnabled, notifySubmissions, notifyPrivateChat]);

  const unreadCount = displayedNotifications.filter(n => !n.read).length;
  const pendingSubmissionsCount = displayedNotifications.filter(n => n.type === "SUBMISSION" && !n.read).length;
  const pendingChatCount = displayedNotifications.filter(n => n.type === "SYSTEM" && !n.read).length;

  // Refs for checking newly received notifications (to avoid playing on first render)
  const prevNotificationIds = useRef<string[]>([]);
  const isFirstLoad = useRef(true);

  // Sync settings with localStorage
  useEffect(() => {
    localStorage.setItem("notif_sound_enabled", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("notif_sound_type", soundType);
  }, [soundType]);

  useEffect(() => {
    localStorage.setItem("notif_sound_volume", String(soundVolume));
  }, [soundVolume]);

  useEffect(() => {
    localStorage.setItem("notif_vibrate_enabled", String(vibrateEnabled));
  }, [vibrateEnabled]);

  useEffect(() => {
    localStorage.setItem("notif_vibrate_pattern", vibratePattern);
  }, [vibratePattern]);

  useEffect(() => {
    localStorage.setItem("notif_teacher_submissions", String(notifySubmissions));
  }, [notifySubmissions]);

  useEffect(() => {
    localStorage.setItem("notif_teacher_private_chat", String(notifyPrivateChat));
  }, [notifyPrivateChat]);

  useEffect(() => {
    localStorage.setItem("notif_task_reminders_enabled", String(taskRemindersEnabled));
  }, [taskRemindersEnabled]);

  useEffect(() => {
    localStorage.setItem("notif_dismissed_reminders", JSON.stringify(dismissedReminders));
  }, [dismissedReminders]);

  useEffect(() => {
    localStorage.setItem("notif_alerted_task_ids", JSON.stringify(alertedTaskIds));
  }, [alertedTaskIds]);

  const fetchAssignments = async () => {
    if (role !== "STUDENT") return;
    try {
      const response = await fetch("/api/assignments");
      if (response.ok) {
        const data = await response.json();
        setCalendarAssignments(data);
      }
    } catch (err) {
      console.error("Error fetching assignments for reminders:", err);
    }
  };

  useEffect(() => {
    if (role === "STUDENT") {
      fetchAssignments();
      const interval = setInterval(fetchAssignments, 15000); // Poll assignments every 15s
      return () => clearInterval(interval);
    }
  }, [role]);

  const handleToggleTaskReminders = async (checked: boolean) => {
    if (checked) {
      if ("Notification" in window) {
        try {
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            new Notification("📆 Recordatorios Activados", {
              body: "Recibirás avisos automáticos cuando falte menos de 24 horas para entregar tus tareas.",
            });
          }
        } catch (e) {
          console.warn("Permission request failed:", e);
        }
      }
      setTaskRemindersEnabled(true);
    } else {
      setTaskRemindersEnabled(false);
    }
  };

  const triggerPushNotification = (title: string, body: string) => {
    if (!("Notification" in window)) return;
    try {
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
        });
      }
    } catch (e) {
      console.warn("Web Push Notification failed:", e);
    }
  };

  // Task deadline alerts coordinator
  useEffect(() => {
    if (role !== "STUDENT" || !taskRemindersEnabled || calendarAssignments.length === 0) return;

    const urgentAssignments = calendarAssignments.filter(asg => {
      if (!asg.dueDate) return false;
      
      let studentSection: string | null = null;
      if (ci && students.length > 0) {
        const matched = students.find(s => s.ci.replace(/\D/g, "") === ci.replace(/\D/g, ""));
        if (matched) studentSection = matched.section;
      }

      const gradeMatches = 
        !studentSection || 
        asg.section === "TODOS" || 
        asg.section === studentSection;

      if (!gradeMatches) return false;

      const targetDate = parseDateString(asg.dueDate);
      if (!targetDate) return false;

      const now = new Date();
      const diffTimeMs = targetDate.getTime() - now.getTime();
      const hrs = diffTimeMs / (1000 * 60 * 60);

      return hrs > 0 && hrs < 24;
    });

    const unalertedUrgent = urgentAssignments.filter(asg => !alertedTaskIds.includes(asg.id));

    if (unalertedUrgent.length > 0) {
      setTimeout(() => {
        triggerAlert();
      }, 500);

      unalertedUrgent.forEach(asg => {
        triggerPushNotification(
          `⏳ Tarea por vencer: ${asg.title}`,
          `Falta menos de 24 horas para entregar: ${asg.dueDate}.`
        );
      });

      setAlertedTaskIds(prev => {
        const next = [...prev];
        unalertedUrgent.forEach(asg => {
          if (!next.includes(asg.id)) next.push(asg.id);
        });
        return next;
      });
    }
  }, [role, taskRemindersEnabled, calendarAssignments, alertedTaskIds, ci, students]);

  // Sync unreadCount with parent handler
  useEffect(() => {
    if (onNewNotificationsCount) {
      onNewNotificationsCount(unreadCount);
    }
  }, [unreadCount, onNewNotificationsCount]);

  // Read custom file name from IndexedDB if preset
  useEffect(() => {
    const readCustomName = async () => {
      const sound = await getCustomSound();
      if (sound) {
        setCustomFileName(sound.name);
      }
    };
    readCustomName();
  }, []);

  const fetchNotifications = async () => {
    try {
      const url = `/api/notifications?role=${role}${ci ? `&ci=${encodeURIComponent(ci)}` : ""}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (err: any) {
      if (err && (err.message === "Failed to fetch" || err.name === "TypeError")) {
        console.warn("Could not reach notification server in NotificationCenter (transient network failure). Retrying...");
      } else {
        console.error("Error fetching notifications:", err);
      }
    }
  };

  // Poll for notifications every 10 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 10000);

    return () => clearInterval(interval);
  }, [role, ci]);

  // Delta checker for triggering sound / vibrations
  useEffect(() => {
    if (displayedNotifications.length > 0) {
      if (isFirstLoad.current) {
        // Collect current IDs without triggering alert on initial load
        prevNotificationIds.current = displayedNotifications.map(n => n.id);
        isFirstLoad.current = false;
        return;
      }

      // Find if we have new unread notifications that were not present previously
      const newNotifications = displayedNotifications.filter(
        n => !n.read && !prevNotificationIds.current.includes(n.id)
      );

      if (newNotifications.length > 0) {
        triggerAlert();
      }

      // Update stored IDs
      prevNotificationIds.current = displayedNotifications.map(n => n.id);
    }
  }, [displayedNotifications]);

  // Triggering alert patterns
  const triggerVibrate = (patternOverride?: string) => {
    if (!("vibrate" in navigator)) return;
    const activePattern = patternOverride || vibratePattern;
    let pattern: number | number[] = 150;

    switch (activePattern) {
      case "short":
        pattern = 150;
        break;
      case "long":
        pattern = 600;
        break;
      case "double":
        pattern = [150, 100, 150];
        break;
      case "heartbeat":
        pattern = [100, 55, 100, 55, 300, 150, 100];
        break;
      case "sos":
        // S.O.S alert pattern in Morse
        pattern = [150, 80, 150, 80, 150, 150, 300, 150, 300, 150, 300, 150, 150, 80, 150, 80, 150];
        break;
      default:
        pattern = 150;
    }

    try {
      navigator.vibrate(pattern);
    } catch (e) {
      console.warn("Vibration failed or blocked:", e);
    }
  };

  const triggerSound = async (typeOverride?: string) => {
    const activeType = typeOverride || soundType;
    if (activeType === "custom") {
      const stored = await getCustomSound();
      if (stored && stored.data) {
        try {
          const audio = new Audio(stored.data);
          audio.volume = soundVolume;
          audio.play().catch(e => console.log("Sound autoplay blocked:", e));
        } catch (err) {
          console.error("Failed custom playback, fallbacks:", err);
          playPresetSound("bell", soundVolume);
        }
      } else {
        playPresetSound("bell", soundVolume);
      }
    } else {
      playPresetSound(activeType, soundVolume);
    }
  };

  const triggerAlert = () => {
    if (soundEnabled) {
      triggerSound();
    }
    if (vibrateEnabled) {
      triggerVibrate();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      alert("Por favor selecciona un archivo de audio válido (.mp3, .wav, .m4a, etc.)");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setLoading(true);
        const success = await saveCustomSound(dataUrl, file.name);
        setLoading(false);
        if (success) {
          setCustomFileName(file.name);
          setSoundType("custom");
          // Playback test
          setTimeout(() => {
            const temp = new Audio(dataUrl);
            temp.volume = soundVolume;
            temp.play().catch(err => console.log("Play failed", err));
          }, 200);
        } else {
          alert("Error guardando el sonido.");
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const markAsRead = async (id: string) => {
    if (id.startsWith("deadline-")) {
      const asgId = id.substring("deadline-".length);
      setDismissedReminders(prev => {
        if (!prev.includes(asgId)) {
          return [...prev, asgId];
        }
        return prev;
      });
      return;
    }
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "POST"
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => (n.id === id ? { ...n, read: true } : n))
        );
        const updated = notifications.map(n => (n.id === id ? { ...n, read: true } : n));
        if (onNewNotificationsCount) {
          onNewNotificationsCount(updated.filter(n => !n.read).length);
        }
      }
    } catch (err) {
      console.error("Error marking notification or reading:", err);
    }
  };

  const markAllAsRead = async () => {
    if (role === "STUDENT" && taskRemindersEnabled) {
      const currentDeadlineIds = calendarAssignments
        .filter(asg => {
          if (!asg.dueDate) return false;
          const targetDate = parseDateString(asg.dueDate);
          if (!targetDate) return false;
          const now = new Date();
          const diffTimeMs = targetDate.getTime() - now.getTime();
          const hrs = diffTimeMs / (1000 * 60 * 60);
          return hrs > -24 && hrs < 24;
        })
        .map(asg => asg.id);
      
      if (currentDeadlineIds.length > 0) {
        setDismissedReminders(prev => {
          const next = [...prev];
          currentDeadlineIds.forEach(id => {
            if (!next.includes(id)) next.push(id);
          });
          return next;
        });
      }
    }
    try {
      const response = await fetch(`/api/notifications/read-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, ci })
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        if (onNewNotificationsCount) {
          onNewNotificationsCount(0);
        }
      }
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  const clearAll = async () => {
    if (role === "STUDENT" && taskRemindersEnabled) {
      const currentDeadlineIds = calendarAssignments
        .filter(asg => {
          if (!asg.dueDate) return false;
          const targetDate = parseDateString(asg.dueDate);
          if (!targetDate) return false;
          const now = new Date();
          const diffTimeMs = targetDate.getTime() - now.getTime();
          const hrs = diffTimeMs / (1000 * 60 * 60);
          return hrs > -24 && hrs < 24;
        })
        .map(asg => asg.id);
      
      if (currentDeadlineIds.length > 0) {
        setDismissedReminders(prev => {
          const next = [...prev];
          currentDeadlineIds.forEach(id => {
            if (!next.includes(id)) next.push(id);
          });
          return next;
        });
      }
    }
    try {
      const response = await fetch(`/api/notifications/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, ci })
      });
      if (response.ok) {
        setNotifications([]);
        if (onNewNotificationsCount) {
          onNewNotificationsCount(0);
        }
      }
    } catch (err) {
      console.error("Error clearing notifications:", err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "SUBMISSION":
        return (
          <div className="p-2 bg-teal-500/10 text-brand-teal dark:text-teal-400 rounded-lg shrink-0">
            <ClipboardCheck size={16} />
          </div>
        );
      case "GRADE":
        return (
          <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg shrink-0">
            <Award size={16} />
          </div>
        );
      case "SYSTEM":
      default:
        return (
          <div className="p-2 bg-slate-500/10 text-slate-500 rounded-lg shrink-0">
            <Info size={16} />
          </div>
        );
    }
  };

  return (
    <div className="relative">
      {/* Bell Trigger Button */}
      <button
        id={`btn-bell-${role.toLowerCase()}`}
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setPanelView("list");
        }}
        className={`p-2 rounded-xl border hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-350 transition active:scale-95 cursor-pointer relative ${
          role === "STUDENT" && taskRemindersEnabled 
            ? "border-brand-teal/30 dark:border-teal-400/30 bg-brand-teal/[0.02] dark:bg-teal-500/[0.01]" 
            : "border-slate-200 dark:border-slate-800"
        }`}
        title="Ver y configurar notificaciones"
      >
        <motion.div
          animate={
            role === "STUDENT" && taskRemindersEnabled
              ? { scale: [1, 1.15, 0.95, 1.15, 1] }
              : { scale: 1 }
          }
          transition={{
            repeat: role === "STUDENT" && taskRemindersEnabled ? Infinity : 0,
            repeatDelay: 3.5,
            duration: 1.2,
            ease: "easeInOut"
          }}
          className="inline-block"
        >
          <Bell size={18} className={unreadCount > 0 ? "animate-pulse text-brand-teal dark:text-teal-400" : ""} />
        </motion.div>
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black leading-none text-white px-1 shadow-sm border border-white dark:border-slate-900">
            {unreadCount}
          </span>
        ) : (
          hasUrgentTask && (
            <motion.span 
              className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center"
              animate={{
                scale: [1, 1.25, 1.1, 1.35, 1],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              {/* Aura of the heartbeat */}
              <motion.span 
                className="absolute inline-flex h-full w-full rounded-full bg-rose-500/40"
                animate={{
                  scale: [1, 2.2, 1],
                  opacity: [0.65, 0, 0.65]
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              {/* Core solid indicator dot */}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 border border-white dark:border-slate-900 shadow-[0_0_8px_rgba(244,63,94,0.65)]" />
            </motion.span>
          )
        )}
      </button>

      {/* Notifications Popover Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for click away targeting */}
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              id={`notifications-panel-${role.toLowerCase()}`}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.95 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute right-0 mt-2 w-80 sm:w-92 max-h-[500px] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xl z-50 overflow-hidden text-left"
            >              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 select-none">
                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                    {panelView === "list" ? "Notificaciones" : (role === "TEACHER" ? "Configuración" : "Ajustes de Alerta")}
                  </span>
                  {panelView === "list" && unreadCount > 0 && (
                    <span className="text-[9px] bg-brand-teal text-white rounded-full px-1.5 py-[1px] font-black shrink-0">
                      {unreadCount}
                    </span>
                  )}
                  {role === "TEACHER" && panelView === "list" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span 
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8.5px] font-black border transition ${
                          pendingSubmissionsCount > 0 
                            ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300 border-amber-500/25" 
                            : "bg-slate-100/60 text-slate-400 dark:bg-slate-800/60 dark:text-slate-600 border-slate-200/40 dark:border-slate-800/40"
                        }`}
                        title={`${pendingSubmissionsCount} tareas nuevas por revisar`}
                      >
                        <span className="text-[7.5px]">📝</span>
                        <span>{pendingSubmissionsCount}</span>
                      </span>
                      <span 
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8.5px] font-black border transition ${
                          pendingChatCount > 0 
                            ? "bg-teal-500/15 text-teal-700 dark:bg-teal-400/20 dark:text-teal-300 border-teal-500/25" 
                            : "bg-slate-100/60 text-slate-400 dark:bg-slate-800/60 dark:text-slate-600 border-slate-200/40 dark:border-slate-800/40"
                        }`}
                        title={`${pendingChatCount} dudas de chat pendientes`}
                      >
                        <span className="text-[7.5px]">💬</span>
                        <span>{pendingChatCount}</span>
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-1.5">
                  {panelView === "list" && displayedNotifications.length > 0 && (
                    <>
                      <button
                        id="btn-header-read-all"
                        type="button"
                        onClick={markAllAsRead}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-brand-teal dark:hover:text-teal-400 rounded-lg transition-all active:scale-[0.95] cursor-pointer flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider border border-slate-200/40 dark:border-slate-800/60"
                        title="Marcar todas como leídas"
                      >
                        <Check size={11} className="stroke-[3.5]" />
                        <span className="hidden sm:inline">Leídas</span>
                      </button>

                      <button
                        id="btn-header-clear-all"
                        type="button"
                        onClick={clearAll}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-500 rounded-lg transition-all active:scale-[0.95] cursor-pointer flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider border border-slate-200/40 dark:border-slate-800/60"
                        title="Eliminar todas"
                      >
                        <Trash2 size={11} />
                        <span className="hidden sm:inline">Eliminar</span>
                      </button>
                    </>
                  )}

                  {/* Gear Button to swap view modes */}
                  <button
                    id="btn-toggle-notif-view"
                    type="button"
                    onClick={() => setPanelView(panelView === "list" ? "settings" : "list")}
                    className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center ${
                      panelView === "settings"
                        ? "bg-brand-teal text-white border-brand-teal"
                        : "border-slate-100 dark:border-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-850"
                    }`}
                    title={panelView === "list" ? (role === "TEACHER" ? "Ver configuración global" : "Configurar alertas") : "Volver a notificaciones"}
                  >
                    <Settings size={14} className={panelView === "settings" ? "animate-spin-once" : ""} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* LIST VIEW */}
              {panelView === "list" && (
                <>
                  {/* Action Buttons */}
                  {displayedNotifications.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800/40 text-[10px] text-slate-500 select-none bg-slate-50/20 dark:bg-slate-905">
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="flex items-center space-x-1 hover:text-brand-teal transition cursor-pointer font-bold"
                      >
                        <Check size={12} className="stroke-[3]" />
                        <span>Marcar todo como leído</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearAll}
                        className="flex items-center space-x-1 hover:text-rose-500 transition cursor-pointer font-bold"
                      >
                        <Trash2 size={12} />
                        <span>Eliminar todo</span>
                      </button>
                    </div>
                  )}

                  {/* List Container */}
                  <div className="flex-1 overflow-y-auto max-h-[360px] divide-y divide-slate-50 dark:divide-slate-805">
                    {displayedNotifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-14 px-4 text-center select-none">
                        <BellOff size={28} className="text-slate-305 dark:text-slate-700" />
                        <p className="text-xs font-bold text-slate-405 dark:text-slate-500 mt-2">
                          Sin notificaciones
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">
                          Te mantendremos al tanto de las actividades del aula.
                        </p>
                      </div>
                    ) : (
                      displayedNotifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.read) {
                              markAsRead(n.id);
                            }
                            if (onNotificationAction) {
                              onNotificationAction(n);
                            }
                            setIsOpen(false);
                          }}
                          className={`p-3.5 flex items-start space-x-3 transition cursor-pointer relative select-none ${
                            n.read
                              ? "bg-white hover:bg-slate-50/70 dark:bg-slate-900 dark:hover:bg-slate-950/20"
                              : "bg-teal-500/[0.04] hover:bg-teal-500/[0.06] dark:bg-teal-400/[0.02] dark:hover:bg-teal-400/[0.04] font-medium"
                          }`}
                        >
                          {/* Unread circle badge indicator on left side */}
                          {!n.read && (
                            <span className="absolute left-[3px] top-[18px] w-1.5 h-1.5 rounded-full bg-brand-teal dark:bg-teal-400" />
                          )}

                          {getIcon(n.type)}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className={`text-[11px] font-extrabold truncate ${n.read ? "text-slate-700 dark:text-slate-300" : "text-slate-900 dark:text-slate-50"}`}>
                                {n.title}
                              </p>
                              <span className="text-[8.5px] text-slate-400 font-mono shrink-0 whitespace-nowrap ml-1.5">
                                {new Date(n.createdAt).toLocaleTimeString("es-ES", {
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </span>
                            </div>
                            <p className={`text-[10px] leading-relaxed mt-0.5 ${n.read ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>
                              {n.message}
                            </p>

                            {role === "TEACHER" && n.type === "SUBMISSION" && (
                              <div className="mt-2 flex">
                                <button
                                  id={`btn-quick-view-${n.id}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickView(n);
                                  }}
                                  className="px-2 py-1 bg-brand-teal/10 hover:bg-brand-teal/20 text-[#004d4d] dark:text-teal-400 dark:bg-teal-500/10 text-[9px] font-black uppercase tracking-wider rounded-md border border-brand-teal/20 dark:border-teal-400/20 flex items-center gap-1 transition-all active:scale-[0.97] cursor-pointer"
                                  title="Ver resumen y calificaciones de este alumno"
                                >
                                  <ClipboardCheck size={10} className="stroke-[2.5]" />
                                  <span>Vista Rápida</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* SETTINGS VIEW */}
              {panelView === "settings" && (
                <div className="flex-1 overflow-y-auto max-h-[400px] p-4 space-y-4 bg-slate-50/40 dark:bg-slate-900/10 font-sans select-none">
                  
                  {/* GLOBAL TEACHER PREF PANEL */}
                  {role === "TEACHER" && (
                    <div className="p-3 bg-white dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 rounded-xl space-y-3 shadow-xs">
                      <div className="flex items-center space-x-2 text-xs font-black text-slate-705 dark:text-slate-350 uppercase tracking-wider">
                        <Settings size={14} className="text-brand-teal dark:text-teal-450" />
                        <span>Filtro de Eventos de Aula</span>
                      </div>
                      
                      <div className="space-y-3 pt-2 border-t border-slate-50 dark:border-slate-900/60">
                        {/* Notify Submissions */}
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col pr-2">
                            <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 leading-tight">Entrega de Tareas</span>
                            <span className="text-[8.5px] text-slate-400 dark:text-slate-500 leading-normal">Notificar cuando un alumno envíe su tarea.</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input 
                              type="checkbox" 
                              checked={notifySubmissions} 
                              onChange={(e) => setNotifySubmissions(e.target.checked)} 
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-200 dark:bg-slate-805 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-teal"></div>
                          </label>
                        </div>

                        {/* Notify Private Chats */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-slate-900/40">
                          <div className="flex flex-col pr-2">
                            <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 leading-tight">Mensajes de Chat</span>
                            <span className="text-[8.5px] text-slate-400 dark:text-slate-500 leading-normal">Notificar nuevos chats privados de alumnos.</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input 
                              type="checkbox" 
                              checked={notifyPrivateChat} 
                              onChange={(e) => setNotifyPrivateChat(e.target.checked)} 
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-200 dark:bg-slate-805 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-teal"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GLOBAL STUDENT PREF PANEL */}
                  {role === "STUDENT" && (
                    <div className="p-3 bg-white dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 rounded-xl space-y-3 shadow-xs">
                      <div className="flex items-center space-x-2 text-xs font-black text-slate-705 dark:text-slate-350 uppercase tracking-wider">
                        <Calendar size={14} className="text-brand-teal dark:text-teal-400" />
                        <span>Recordatorios de Calendario</span>
                      </div>
                      
                      <div className="space-y-3 pt-2 border-t border-slate-50 dark:border-slate-900/60">
                        {/* Task Reminders <= 24h Toggle */}
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col pr-2">
                            <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 leading-tight font-sans">Aviso de Plazo Corto (&lt; 24h)</span>
                            <span className="text-[8.5px] text-slate-400 dark:text-slate-500 leading-normal font-sans">Notificar automáticamente cuando falte menos de 24 horas para la fecha límite de entrega.</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input 
                              type="checkbox" 
                              checked={taskRemindersEnabled} 
                              onChange={(e) => handleToggleTaskReminders(e.target.checked)} 
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-200 dark:bg-slate-805 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-teal"></div>
                          </label>
                        </div>
                        
                        {/* Info badge if Notification permission state is denied or supported/unsupported */}
                        {taskRemindersEnabled && "Notification" in window && Notification.permission === "denied" && (
                          <div className="p-2 bg-amber-500/10 text-[9px] text-amber-600 dark:text-amber-400 rounded-lg leading-normal font-semibold font-sans">
                            ⚠️ Los avisos push están desactivados por tu navegador. Se usarán alertas sonoras, vibración y avisos en el panel como alternativa.
                          </div>
                        )}
                        {taskRemindersEnabled && "Notification" in window && Notification.permission === "granted" && (
                          <div className="p-2 bg-emerald-500/10 text-[9px] text-emerald-650 dark:text-emerald-400 rounded-lg leading-[1.3] font-semibold font-sans">
                            ✅ Notificaciones push del navegador habilitadas con éxito.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SOUND PANEL */}
                  <div className="p-3 bg-white dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        <Volume2 size={14} className="text-brand-teal dark:text-teal-400" />
                        <span>Notificación con Sonido</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={soundEnabled} 
                          onChange={(e) => setSoundEnabled(e.target.checked)} 
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 dark:bg-slate-805 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-teal"></div>
                      </label>
                    </div>

                    {soundEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-50 dark:border-slate-900/60 transition-all">
                        {/* Selector de Tonos */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tono / Canción de aviso</label>
                          <select
                            value={soundType}
                            onChange={(e) => setSoundType(e.target.value)}
                            className="p-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal"
                          >
                            <option value="bell">Campana de Cristal (Elegante)</option>
                            <option value="school">Alarma Digital (Directo)</option>
                            <option value="retro">Arcade Coins (Divertido)</option>
                            <option value="custom">🎵 Tu Canción / Audio Propio</option>
                          </select>
                        </div>

                        {/* File Uploader for Custom Sound */}
                        {soundType === "custom" && (
                          <div className="p-2.5 bg-slate-500/[0.04] dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col gap-2">
                            <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1">
                              <Music size={11} className="text-brand-teal" />
                              Cargador de Archivo Propio
                            </span>
                            
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => document.getElementById("hidden-audio-picker")?.click()}
                                className="px-2.5 py-1.5 bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal text-[10px] font-black uppercase tracking-wider rounded-lg border border-brand-teal/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer max-w-max"
                              >
                                <Upload size={12} className="stroke-[2.5]" />
                                Buscar Canción
                              </button>
                              <span className="text-[9.5px] font-bold text-slate-500 truncate max-w-[150px]" title={customFileName || "Ningun archivo seleccionado"}>
                                {customFileName || "Sube cualquier .mp3 o .wav"}
                              </span>
                            </div>

                            <input
                              id="hidden-audio-picker"
                              type="file"
                              accept="audio/*"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                            
                            <p className="text-[8.5px] text-slate-400 leading-tight">
                              Sube un archivo de audio del dispositivo. Se guardará de manera local para sonar cuando llegue una notificación.
                            </p>
                          </div>
                        )}

                        {/* Volúmen slider */}
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Volumen</span>
                            <span className="text-[9px] font-mono font-bold text-slate-500">{Math.round(soundVolume * 100)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05"
                            value={soundVolume}
                            onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                            className="w-full accent-brand-teal h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Probar Sonido Trigger */}
                        <button
                          type="button"
                          onClick={() => triggerSound()}
                          className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 hover:dark:bg-slate-850 border border-slate-200/50 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <Play size={11} className="fill-current" />
                          <span>Probar Sonido</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* VIBRATOR PANEL */}
                  <div className="p-3 bg-white dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        <Smartphone size={14} className="text-brand-teal dark:text-teal-400 animate-bounce" />
                        <span>Vibración del Móvil</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={vibrateEnabled} 
                          onChange={(e) => setVibrateEnabled(e.target.checked)} 
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 dark:bg-slate-803 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-teal"></div>
                      </label>
                    </div>

                    {vibrateEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-50 dark:border-slate-900/60 transition-all">
                        {/* Selector de Patrones */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Patrón de Vibración</label>
                          <select
                            value={vibratePattern}
                            onChange={(e) => setVibratePattern(e.target.value)}
                            className="p-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal"
                          >
                            <option value="short">Corto (Silencioso)</option>
                            <option value="long">Largo (Potente)</option>
                            <option value="double">Doble Pulso (Habitual)</option>
                            <option value="heartbeat">Latido de Corazón (Suave)</option>
                            <option value="sos">Código S.O.S (Alerta)</option>
                          </select>
                        </div>

                        {/* Probar Vibración Trigger */}
                        <button
                          type="button"
                          onClick={() => triggerVibrate()}
                          className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 hover:dark:bg-slate-850 border border-slate-200/50 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <Smartphone size={12} />
                          <span>Probar Motor Vibración</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-[9px] text-slate-400 font-medium text-center uppercase tracking-wide leading-relaxed">
                    Las configuraciones de audio y vibración se guardan de forma local e independiente en cada dispositivo.
                  </p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mini-Modal de Vista Rápida del Estudiante */}
      <AnimatePresence>
        {showQuickViewModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQuickViewModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              id="quick-view-student-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-left font-sans select-none"
            >
              {/* Header with decorative header pattern */}
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-955/40 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#004d4d] dark:text-teal-400 flex items-center gap-1.5">
                  <User size={13} className="stroke-[2.5]" />
                  Detalles del Estudiante
                </span>
                <button
                  id="btn-close-quick-view"
                  type="button"
                  onClick={() => setShowQuickViewModal(false)}
                  className="p-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Content area */}
              <div className="p-5 overflow-y-auto max-h-[80vh] space-y-4">
                {quickViewLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-brand-teal/20 border-t-[#004d4d] animate-spin" />
                    <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider animate-pulse">Obteniendo expediente...</span>
                  </div>
                ) : selectedQuickViewData?.student ? (
                  <>
                    {/* Student Identity Card */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-955/20 border border-slate-150 dark:border-slate-800/40 rounded-2xl flex items-start gap-3 relative overflow-hidden">
                      {/* Left accent column */}
                      <div className="w-1 absolute left-0 top-0 bottom-0 bg-brand-teal dark:bg-teal-500" />
                      
                      <div className="p-2.5 bg-brand-teal/10 text-[#004d4d] dark:text-teal-400 rounded-2xl shrink-0">
                        <User size={22} className="stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-50 truncate leading-tight">
                          {selectedQuickViewData.student.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          <span className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400 px-2 py-0.5 rounded-full text-[9px] font-black uppercase">
                            {selectedQuickViewData.student.section}
                          </span>
                          <span className="font-mono">C.I. {selectedQuickViewData.student.ci}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Statistics Bento Grid */}
                    <div className="grid grid-cols-3 gap-2 text-center select-none">
                      {/* Metric 1 */}
                      <div className="p-3 bg-slate-50 dark:bg-slate-955/20 border border-slate-100 dark:border-slate-850/40 rounded-2xl">
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Submitidas</span>
                        <div className="mt-1.5 flex items-baseline justify-center gap-0.5 text-[#004d4d] dark:text-teal-400">
                          <span className="text-lg font-black leading-none">{selectedQuickViewData.submissions.length}</span>
                          <span className="text-[9px] font-bold text-slate-400">dirs</span>
                        </div>
                      </div>

                      {/* Metric 2 */}
                      <div className="p-3 bg-slate-50 dark:bg-slate-955/20 border border-slate-100 dark:border-slate-850/40 rounded-2xl">
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Calificadas</span>
                        <div className="mt-1.5 flex items-baseline justify-center gap-0.5 text-amber-500">
                          <span className="text-lg font-black leading-none">
                            {selectedQuickViewData.submissions.filter(s => s.grade).length}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 font-sans">eval</span>
                        </div>
                      </div>

                      {/* Metric 3 */}
                      <div className="p-3 bg-slate-50 dark:bg-slate-955/20 border border-slate-100 dark:border-slate-850/40 rounded-2xl">
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Promedio</span>
                        <div className="mt-1.5 flex items-baseline justify-center gap-0.5 text-emerald-650 dark:text-emerald-450">
                          <span className="text-lg font-black leading-none">
                            {calculateAverageGrade(selectedQuickViewData.submissions)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Submissions List Section */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <BookOpen size={12} className="stroke-[2.5]" />
                        Historial de Actividades
                      </span>

                      {selectedQuickViewData.submissions.length === 0 ? (
                        <div className="py-8 text-center text-[10px] text-slate-400 italic">
                          El alumno no ha enviado ninguna asignación todavía.
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
                          {selectedQuickViewData.submissions.map((sub, idx) => (
                            <div 
                              key={sub.id || idx}
                              className="p-3 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-55/10 dark:bg-slate-950/20 text-[10px] space-y-1.5"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <span className="font-extrabold text-slate-850 dark:text-slate-200 truncate pr-1">
                                  {sub.assignmentTitle || "Tarea sin título"}
                                </span>
                                
                                {sub.grade ? (
                                  <span className="bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400 px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wide shrink-0 font-mono">
                                    Nota: {sub.grade}
                                  </span>
                                ) : (
                                  <span className="bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400 px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wide shrink-0">
                                    Pendiente
                                  </span>
                                )}
                              </div>

                              <div className="flex justify-between items-center text-[9px] text-slate-450 select-none">
                                <span className="font-semibold flex items-center gap-0.5">
                                  <Calendar size={10} />
                                  {new Date(sub.createdAt).toLocaleDateString("es-ES", {
                                    day: "2-digit",
                                    month: "short"
                                  })}
                                </span>

                                {sub.driveLink && (
                                  <a
                                    href={`/api/download/${sub.driveLink.substring("/api/files/".length)}?name=${encodeURIComponent(sub.attachmentName || "archivo")}`}
                                    className="text-brand-teal dark:text-teal-400 hover:underline flex items-center gap-0.5 font-bold uppercase text-[8.5px]"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Abrir Entrega
                                    <ExternalLink size={8} />
                                  </a>
                                )}
                              </div>

                              {sub.feedback && (
                                <p className="text-[9px] italic text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-850/40 pt-1 leading-normal">
                                  📝 Retro: <span className="font-medium text-slate-605 dark:text-slate-355">{sub.feedback}</span>
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-450">
                    No pudimos obtener el perfil de este estudiante.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


