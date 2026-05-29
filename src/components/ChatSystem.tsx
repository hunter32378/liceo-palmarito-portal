import React, { useState, useEffect, useRef } from "react";
import { ChatRoom, ChatMessage, AuthorizedStudent } from "../types";
import { 
  Send, 
  Users, 
  RefreshCw, 
  Plus, 
  Search, 
  MessageSquare, 
  User, 
  Check, 
  CheckSquare, 
  Square,
  BookOpen,
  Info,
  ChevronRight,
  Sparkles,
  Paperclip,
  Smile,
  FileText,
  Download,
  Lock,
  Unlock,
  ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ChatSystemProps {
  role: "STUDENT" | "TEACHER";
  studentCi?: string;
  studentName?: string;
  studentSection?: string;
  onIdentify?: (ci: string, name: string, section: string) => void;
  initialSelectedRoomName?: string;
  initialSelectedRoomId?: string;
}

export default function ChatSystem({ 
  role, 
  studentCi, 
  studentName, 
  studentSection, 
  onIdentify,
  initialSelectedRoomName,
  initialSelectedRoomId
}: ChatSystemProps) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typedMessage, setTypedMessage] = useState("");
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [students, setStudents] = useState<AuthorizedStudent[]>([]);
  const [chatError, setChatError] = useState("");

  const [restrictions, setRestrictions] = useState<{ restrictedCis: string[]; mutedRooms: string[] }>({
    restrictedCis: [],
    mutedRooms: []
  });
  const [showStickersMenu, setShowStickersMenu] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [moderatorSearchQuery, setModeratorSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getRoomDisplayName = (room: ChatRoom) => {
    if (room.type === "PRIVATE" && role === "TEACHER" && room.memberCis && room.memberCis.length > 0) {
      const studentCi = room.memberCis[0];
      const foundStudent = students.find(s => s.ci.replace(/\D/g, "") === studentCi.replace(/\D/g, ""));
      if (foundStudent) {
        return `Chats con ${foundStudent.name}`;
      }
    }
    return room.name;
  };

  const STUDY_STICKERS = [
    { text: "¡Buen Trabajo! 🌟", icon: "🌟" },
    { text: "¡Excelente! 🏆", icon: "🏆" },
    { text: "Sigue así 👍", icon: "👍" },
    { text: "Atención 📝", icon: "📝" },
    { text: "Estudiando 📚", icon: "📚" },
    { text: "Pregunta 💡", icon: "💡" },
    { text: "¡Genial! 🎨", icon: "🎨" },
    { text: "Pensando 🤔", icon: "🤔" },
    { text: "Feliz 😊", icon: "😊" },
    { text: "¡Wow! 🤩", icon: "🤩" },
    { text: "Gracias 🙏", icon: "🙏" },
    { text: "Fuego 🔥", icon: "🔥" }
  ];

  const fetchRestrictions = async () => {
    try {
      const response = await fetch("/api/chat/restrictions");
      if (response.ok) {
        const data = await response.json();
        setRestrictions(data);
      }
    } catch (err) {
      console.error("Error fetching chat restrictions:", err);
    }
  };

  // Hardware back button for mobile chat room navigation
  useEffect(() => {
    const handlePopState = () => {
      if (selectedRoom) {
        setSelectedRoom(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedRoom]);

  // Update history state when room is selected
  useEffect(() => {
    if (selectedRoom) {
      window.history.pushState({ roomId: selectedRoom.id }, "");
    }
  }, [selectedRoom]);

  const toggleStudentMute = async (ci: string, currentlyMuted: boolean) => {
    try {
      const response = await fetch("/api/chat/restrictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-student-mute",
          ci,
          value: !currentlyMuted
        })
      });
      if (response.ok) {
        await fetchRestrictions();
      }
    } catch (err) {
      console.error("Error toggling student mute:", err);
    }
  };

  const toggleRoomMute = async (roomId: string, currentlyMuted: boolean) => {
    try {
      const response = await fetch("/api/chat/restrictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-room-mute",
          roomId,
          value: !currentlyMuted
        })
      });
      if (response.ok) {
        await fetchRestrictions();
      }
    } catch (err) {
      console.error("Error toggling room mute:", err);
    }
  };

  const handleSendSticker = async (stickerText: string, emojiIcon: string) => {
    if (!selectedRoom) return;

    setIsSending(true);
    setChatError("");
    const bodyPayload = {
      message: `${emojiIcon} Sticker: ${stickerText}`,
      senderRole: role,
      senderName: role === "TEACHER" ? "Profesora Anuvis Medina 👩‍🏫" : (resolvedName || "Estudiante"),
      senderCi: role === "STUDENT" ? activeCi : undefined,
      mediaUrl: emojiIcon,
      mediaType: "sticker",
      mediaName: stickerText
    };

    try {
      const response = await fetch(`/api/chat/rooms/${selectedRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      if (response.ok) {
        setShowStickersMenu(false);
        await fetchMessages(selectedRoom.id, true);
        fetchAllMessages(true);
        scrollToBottom("smooth");
      } else {
        const errData = await response.json();
        setChatError(errData.error || "No se pudo entregar el sticker.");
      }
    } catch (err) {
      setChatError("Falla de red temporal al enviar sticker.");
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRoom) return;

    setIsFileUploading(true);
    setChatError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Error al subir archivo");
      }

      const uploadData = await uploadRes.json();
      
      let selectedMediaType: "video" | "image" | "document" = "document";
      if (file.type.startsWith("video/")) {
        selectedMediaType = "video";
      } else if (file.type.startsWith("image/")) {
        selectedMediaType = "image";
      }

      const bodyPayload = {
        message: `Compartió un archivo: ${file.name}`,
        senderRole: role,
        senderName: role === "TEACHER" ? "Profesora Anuvis Medina 👩‍🏫" : (resolvedName || "Estudiante"),
        senderCi: role === "STUDENT" ? activeCi : undefined,
        mediaUrl: uploadData.url,
        mediaType: selectedMediaType,
        mediaName: file.name
      };

      const msgRes = await fetch(`/api/chat/rooms/${selectedRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      if (msgRes.ok) {
        await fetchMessages(selectedRoom.id, true);
        fetchAllMessages(true);
        scrollToBottom("smooth");
      } else {
        const errData = await msgRes.json();
        setChatError(errData.error || "No se pudo entregar el archivo.");
      }

    } catch (err) {
      console.error(err);
      setChatError("Error al subir o enviar el archivo.");
    } finally {
      setIsFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const [localCiInput, setLocalCiInput] = useState("");
  const [showLocalSuggestions, setShowLocalSuggestions] = useState(false);
  const [localError, setLocalError] = useState("");

  // Auto-detect student details from students directory if they entered a CI but name/section are empty
  const activeCi = studentCi ? studentCi.replace(/\D/g, "") : "";
  const matchedStudent = students.find(s => s.ci.replace(/\D/g, "") === activeCi);
  
  const resolvedName = matchedStudent ? matchedStudent.name : (studentName || "Estudiante");
  const resolvedSection = matchedStudent ? matchedStudent.section : (studentSection || "");

  const isCurrentStudentRestricted = role === "STUDENT" && activeCi ? restrictions.restrictedCis.includes(activeCi) : false;
  const isCurrentRoomMuted = role === "STUDENT" && selectedRoom ? restrictions.mutedRooms.includes(selectedRoom.id) : false;

  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [allMessagesLoading, setAllMessagesLoading] = useState(false);
  const [lastViewedTimes, setLastViewedTimes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`chat_last_viewed_${role}_${activeCi || "teacher"}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Fetch all messages relevant to the user for global unread counting
  const fetchAllMessages = async (silent = false) => {
    if (!silent) setAllMessagesLoading(true);
    try {
      let url = `/api/chat/messages?role=${role}`;
      if (role === "STUDENT") {
        url += `&ci=${encodeURIComponent(activeCi || "")}&section=${encodeURIComponent(resolvedSection || "")}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAllMessages(data);
      }
    } catch (err) {
      console.error("Error fetching all messages:", err);
    } finally {
      if (!silent) setAllMessagesLoading(false);
    }
  };

  // Sync last viewed timestamp for the currently active room
  useEffect(() => {
    if (selectedRoom) {
      const nowStr = new Date().toISOString();
      setLastViewedTimes(prev => {
        const next = { ...prev, [selectedRoom.id]: nowStr };
        try {
          localStorage.setItem(
            `chat_last_viewed_${role}_${activeCi || "teacher"}`,
            JSON.stringify(next)
          );
        } catch (e) {
          console.error(e);
        }
        return next;
      });
    }
  }, [selectedRoom?.id, messages]);

  // Calculate unread message count for a room
  const getUnreadCount = (roomId: string) => {
    if (selectedRoom?.id === roomId) return 0;

    const lastViewed = lastViewedTimes[roomId];
    const roomMsgs = allMessages.filter(m => m.roomId === roomId);
    if (roomMsgs.length === 0) return 0;

    const incomingMsgs = roomMsgs.filter(m => {
      const isMe = role === "TEACHER"
        ? m.senderRole === "TEACHER"
        : m.senderRole === "STUDENT" && m.senderCi === activeCi;
      return !isMe;
    });

    if (incomingMsgs.length === 0) return 0;

    if (!lastViewed) {
      return incomingMsgs.length;
    }

    return incomingMsgs.filter(m => m.createdAt > lastViewed).length;
  };

  // Group creation states (Teacher only)
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedStudentsForGroup, setSelectedStudentsForGroup] = useState<string[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [groupSectionFilter, setGroupSectionFilter] = useState("Primer Grado");

  // Chat rooms tabs filter
  const [roomsTab, setRoomsTab] = useState<"ALL" | "GRADE" | "ASSIGNMENT" | "PRIVATE" | "GROUP" | "MODERATOR">("ALL");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const roomsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto scroll to bottom
  const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }, 100);
  };

  // Fetch rooms list
  const fetchRooms = async (silent = false) => {
    if (!silent) setRoomsLoading(true);
    try {
      let url = `/api/chat/rooms?role=${role}`;
      if (role === "STUDENT") {
        url += `&ci=${encodeURIComponent(activeCi || "")}&section=${encodeURIComponent(resolvedSection || "")}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        // Sort rooms: Private first, then Groups, then Grade, then Assignments
        const sorted = data.sort((a: ChatRoom, b: ChatRoom) => {
          const score = (r: ChatRoom) => {
            if (r.type === "PRIVATE") return 4;
            if (r.type === "GROUP") return 3;
            if (r.type === "GRADE") return 2;
            return 1;
          };
          return score(b) - score(a);
        });
        setRooms(sorted);
      }
    } catch (err) {
      console.error("Error fetching chat rooms:", err);
    } finally {
      if (!silent) setRoomsLoading(false);
    }
  };

  // Fetch student directory 
  const fetchStudents = async () => {
    try {
      const response = await fetch("/api/authorized-students");
      if (response.ok) {
        const data = await response.json();
        setStudents(data);
      }
    } catch (err) {
      console.error("Error fetching students directory:", err);
    }
  };

  // Fetch messages inside the selected room
  const fetchMessages = async (roomId: string, silent = false) => {
    if (!silent) setMessagesLoading(true);
    try {
      const response = await fetch(`/api/chat/rooms/${roomId}/messages`);
      if (response.ok) {
        const data = await response.json();
        
        // Only update if changes occurred to prevent re-render flickering
        if (JSON.stringify(data) !== JSON.stringify(messages)) {
          setMessages(data);
          scrollToBottom(silent ? "smooth" : "auto");
        }
      }
    } catch (err) {
      console.error("Error fetching workspace messages:", err);
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  };

  // Trigger loading directory when workspace starts
  useEffect(() => {
    fetchStudents();
    fetchRestrictions();
  }, []);

  // Polling room messages
  useEffect(() => {
    if (rooms.length > 0) {
      if (initialSelectedRoomId) {
        const found = rooms.find(r => r.id === initialSelectedRoomId);
        if (found) {
          setSelectedRoom(found);
          fetchMessages(found.id, true);
        }
      } else if (initialSelectedRoomName) {
        const matchedStudent = students.find(s => s.name.toLowerCase().includes(initialSelectedRoomName.toLowerCase()));
        if (matchedStudent) {
          const studentCi = matchedStudent.ci.replace(/\D/g, "");
          const matchedRoom = rooms.find(r => r.type === "PRIVATE" && r.memberCis && r.memberCis.some(c => c.replace(/\D/g, "") === studentCi));
          if (matchedRoom) {
            setSelectedRoom(matchedRoom);
            fetchMessages(matchedRoom.id, true);
          }
        } else {
          // General room matching by name
          const matchedRoom = rooms.find(r => r.name.toLowerCase().includes(initialSelectedRoomName.toLowerCase()));
          if (matchedRoom) {
            setSelectedRoom(matchedRoom);
            fetchMessages(matchedRoom.id, true);
          }
        }
      }
    }
  }, [rooms, students, initialSelectedRoomId, initialSelectedRoomName]);

  // Initial rooms fetch and updates when section changes dynamically
  useEffect(() => {
    fetchRooms();
    fetchAllMessages();
    fetchRestrictions();

    // Poll rooms list and all messages list every 8 seconds
    roomsIntervalRef.current = setInterval(() => {
      fetchRooms(true);
      fetchAllMessages(true);
      fetchRestrictions();
    }, 8000);

    return () => {
      if (roomsIntervalRef.current) clearInterval(roomsIntervalRef.current);
    };
  }, [resolvedSection, activeCi]);

  // Active room messages polling
  useEffect(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    if (selectedRoom) {
      fetchMessages(selectedRoom.id);

      // Poll messages inside the active room every 3 seconds
      pollingIntervalRef.current = setInterval(() => {
        fetchMessages(selectedRoom.id, true);
      }, 3000);
    } else {
      setMessages([]);
    }

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [selectedRoom?.id]);

  const handleSendMessage = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!typedMessage.trim() || !selectedRoom) return;

    setIsSending(true);
    setChatError("");
    const bodyPayload = {
      message: typedMessage.trim(),
      senderRole: role,
      senderName: role === "TEACHER" ? "Profesora Anuvis Medina 👩‍🏫" : (resolvedName || "Estudiante"),
      senderCi: role === "STUDENT" ? activeCi : undefined
    };

    try {
      const response = await fetch(`/api/chat/rooms/${selectedRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      if (response.ok) {
        setTypedMessage("");
        // Immediately fetch to show the message with neat transition
        await fetchMessages(selectedRoom.id, true);
        fetchAllMessages(true);
        scrollToBottom("smooth");
      } else {
        const errData = await response.json();
        setChatError(errData.error || "No se pudo entregar el mensaje.");
      }
    } catch (err) {
      setChatError("Falla de red temporal al enviar.");
    } finally {
      setIsSending(false);
    }
  };

  // Handle custom group creation (Teacher only)
  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      alert("Por favor ingresa un nombre para el grupo.");
      return;
    }
    if (selectedStudentsForGroup.length === 0) {
      alert("Por favor selecciona al menos un alumno.");
      return;
    }

    try {
      const response = await fetch("/api/chat/rooms/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          memberCis: selectedStudentsForGroup,
          section: groupSectionFilter
        })
      });

      if (response.ok) {
        const data = await response.json();
        setNewGroupName("");
        setSelectedStudentsForGroup([]);
        setShowCreateGroup(false);
        await fetchRooms();
        // Automatically select the newly created room
        setSelectedRoom(data.room);
      } else {
        const errData = await response.json();
        alert(errData.error || "Error al crear el grupo.");
      }
    } catch (err) {
      alert("Error de conexión al guardar el grupo.");
    }
  };

  // Toggle student selection for custom group
  const handleToggleStudentSelection = (ciVal: string) => {
    setSelectedStudentsForGroup(prev => {
      if (prev.includes(ciVal)) {
        return prev.filter(c => c !== ciVal);
      } else {
        return [...prev, ciVal];
      }
    });
  };

  // Filtered rooms list
  const filteredRooms = rooms.filter(room => {
    if (roomsTab === "ALL") return true;
    return room.type === roomsTab;
  });

  // Filter students for group picker
  const filteredStudentsForGroup = students.filter(student => {
    const matchesSection = student.section === groupSectionFilter;
    const matchesSearch = student.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) || 
                          student.ci.includes(groupSearchQuery);
    return matchesSection && matchesSearch;
  });

  // Room type details badge helper
  const getRoomIconAndColor = (type: "GRADE" | "ASSIGNMENT" | "PRIVATE" | "GROUP") => {
    switch (type) {
      case "GRADE":
        return { icon: <Users size={12} />, className: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200/40" };
      case "ASSIGNMENT":
        return { icon: <BookOpen size={12} />, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/40" };
      case "PRIVATE":
        return { icon: <User size={12} />, className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/40" };
      case "GROUP":
        return { icon: <Sparkles size={12} />, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/40" };
    }
  };

  if (role === "STUDENT" && activeCi && students.length > 0 && !matchedStudent) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 bg-slate-50/20 dark:bg-slate-900/10 min-h-[450px]">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-rose-500/10 dark:bg-rose-950/20 flex items-center justify-center mx-auto text-rose-500">
            <Lock size={24} className="stroke-[2]" />
          </div>
          
          <div>
            <h3 className="text-base font-black text-rose-600 uppercase tracking-tight">
              Acceso Denegado 🔒
            </h3>
            <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-100 mt-2">
              Cédula: {studentCi}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">
              Esta Cédula de Identidad no se encuentra registrada o autorizada por la Profesora Anuvis Medina en ninguna sección.
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
              El chat es de uso seguro y exclusivo para alumnos autorizados. Si eres estudiante de esta aula, por favor solicita a la profesora que registre tu número de cédula para habilitar tu acceso.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onIdentify) {
                onIdentify("", "", "");
              }
            }}
            className="w-full mt-2 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-850 rounded-xl font-bold text-xs uppercase tracking-wider transition active:scale-[0.98] cursor-pointer"
          >
            Corregir o Cambiar Cédula
          </button>
        </div>
      </div>
    );
  }

  if (role === "STUDENT" && !activeCi) {
    const cleanInputCi = localCiInput.replace(/\D/g, "");
    const localSuggestions = cleanInputCi.length >= 3
      ? students.filter(s => s.ci.replace(/\D/g, "").includes(cleanInputCi))
      : [];

    const handleLocalSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!cleanInputCi) {
        setLocalError("Por favor ingresa tu cédula de identidad.");
        return;
      }
      const match = students.find(s => s.ci.replace(/\D/g, "") === cleanInputCi);
      if (match) {
        if (onIdentify) {
          onIdentify(match.ci, match.name, match.section);
        }
      } else {
        setLocalError("Cédula no registrada como alumno autorizado.");
      }
    };

    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 bg-slate-50/20 dark:bg-slate-900/10 min-h-[450px]">
        <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-brand-teal/10 dark:bg-teal-900/20 flex items-center justify-center mx-auto text-brand-teal dark:text-teal-400">
            <MessageSquare size={24} className="stroke-[2]" />
          </div>
          
          <div>
            <h3 className="text-base font-black text-[#004d4d] dark:text-teal-400 uppercase tracking-tight">
              Identificación del Alumno 💬
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">
              Por favor ingresa tu número de cédula para verificar tu inscripción y poder chatear con la profesora Anuvis Medina y tu clase.
            </p>
          </div>

          {localError && (
            <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl text-[10px] font-bold text-rose-600 dark:bg-rose-950/20 dark:border-rose-900/30">
              ⚠️ {localError}
            </div>
          )}

          <form onSubmit={handleLocalSubmit} className="space-y-4 text-left relative">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                Cédula de Identidad
              </label>
              <div className="relative">
                <input
                  type="text"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  required
                  placeholder="Ej: 24123456"
                  value={localCiInput}
                  onChange={(e) => {
                    setLocalCiInput(e.target.value.replace(/\D/g, ""));
                    setShowLocalSuggestions(true);
                    setLocalError("");
                  }}
                  onFocus={() => setShowLocalSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowLocalSuggestions(false), 200)}
                  className="w-full p-3 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-teal text-slate-800 dark:text-slate-100"
                />

                {cleanInputCi !== "" && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none select-none">
                    {students.some(s => s.ci.replace(/\D/g, "") === cleanInputCi) ? (
                      <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                        ✓ Registrado
                      </span>
                    ) : (
                      <span className="text-[8px] font-bold text-slate-400">Buscando...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Suggestions auto-complete dropdown */}
              <AnimatePresence>
                {showLocalSuggestions && localSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute z-50 left-0 right-0 top-14 max-h-40 overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl divide-y divide-slate-100 dark:divide-slate-900/50"
                  >
                    {localSuggestions.map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onMouseDown={() => {
                          setLocalCiInput(st.ci.replace(/\D/g, ""));
                          setShowLocalSuggestions(false);
                          setLocalError("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 flex flex-col gap-0.5"
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[11px] font-black text-slate-800 dark:text-slate-100">
                            {st.name}
                          </span>
                          <span className="text-[8.5px] font-black uppercase text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                            {st.section}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">C.I: {st.ci}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-brand-teal hover:bg-[#004d4d] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition active:scale-[0.98] select-none text-center shadow-md cursor-pointer"
            >
              Cargar Chats e Ingresar 💬
            </button>
          </form>

          <p className="text-[9.5px] text-slate-400 dark:text-slate-500 italic mt-1 leading-normal">
            * Al identificarte aquí, también quedarás identificado en las pestañas para entregar tus tareas y revisar tus calificaciones.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[650px] relative text-slate-800 dark:text-slate-100 select-none overflow-hidden rounded-2xl border border-slate-150 dark:border-slate-800/80 bg-white dark:bg-slate-900/40">
      
      {/* If creation modal is visible */}
      <AnimatePresence>
        {showCreateGroup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 p-4 overflow-y-auto flex flex-col items-center justify-center animate-fade-in"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[30px] p-5 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90%]"
            >
              <div className="flex justify-between items-center mb-4 shrink-0 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-black text-sm text-[#004d4d] dark:text-teal-400 uppercase tracking-wide">
                  Crear Grupo de Alumnos 👥
                </h3>
                <button 
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition text-xs font-bold font-mono"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleCreateGroupSubmit} className="space-y-4 flex-1 flex flex-col overflow-hidden">
                <div className="space-y-1 shrink-0">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Nombre del Grupo *
                  </label>
                  <input 
                    type="text"
                    required
                    maxLength={30}
                    placeholder="Ej: Grupo de Refuerzo Matemático"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl outline-none focus:ring-1 focus:ring-brand-teal"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 shrink-0">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                      Filtrar Grado
                    </label>
                    <select
                      value={groupSectionFilter}
                      onChange={(e) => {
                        setGroupSectionFilter(e.target.value);
                        setSelectedStudentsForGroup([]); // clear selected on change
                      }}
                      className="w-full text-[11px] font-bold p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl outline-none cursor-pointer"
                    >
                      <option value="Primer Grado">Primer Grado</option>
                      <option value="Segundo Grado">Segundo Grado</option>
                      <option value="Tercer Grado">Tercer Grado</option>
                      <option value="Cuarto Grado">Cuarto Grado</option>
                      <option value="Quinto Grado">Quinto Grado</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                      Buscar Alumno
                    </label>
                    <input
                      type="text"
                      placeholder="Nombre o CI..."
                      value={groupSearchQuery}
                      onChange={(e) => setGroupSearchQuery(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl outline-none"
                    />
                  </div>
                </div>

                {/* Checklist area */}
                <div className="flex-1 overflow-y-auto border border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl p-2 min-h-[140px] space-y-1">
                  <p className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest border-b border-dashed border-slate-200 pb-1.5 mb-2 select-none px-1">
                    Selecciona Alumnos ({selectedStudentsForGroup.length} elegidos):
                  </p>
                  {filteredStudentsForGroup.length === 0 ? (
                    <p className="text-[9px] font-bold text-slate-400 text-center py-6">
                      No hay alumnos que coincidan con la búsqueda.
                    </p>
                  ) : (
                    filteredStudentsForGroup.map(student => {
                      const isSelected = selectedStudentsForGroup.includes(student.ci);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => handleToggleStudentSelection(student.ci)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg transition ${
                            isSelected 
                              ? "bg-brand-teal/10 border border-brand-teal/20 text-[#004d4d] dark:text-teal-300" 
                              : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350"
                          }`}
                        >
                          <div className="text-left">
                            <p className="text-[10px] font-black truncate">{student.name}</p>
                            <p className="text-[8.5px] font-mono text-slate-400 font-bold">C.I: {student.ci}</p>
                          </div>
                          <div>
                            {isSelected ? (
                              <CheckSquare size={13} className="text-brand-teal dark:text-teal-400" />
                            ) : (
                              <Square size={13} className="text-slate-300 dark:text-slate-600" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCreateGroup(false)}
                    className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer text-center"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-brand-teal text-white hover:bg-[#004d4d] rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer text-center"
                  >
                    Crear Grupo
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat layout split: Sidebar or chat thread */}
      <div className="flex-1 flex h-full overflow-hidden bg-slate-100/50 dark:bg-slate-900/50">
        
        {/* ROOMS SIDEBAR: Hidden on mobile if a room is active */}
        <div className={`w-full sm:w-[280px] bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0 transition-transform ${selectedRoom ? "hidden sm:flex" : "flex"}`}>
          
          {/* Header */}
          <div className="p-3 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-[#004d4d] dark:text-teal-400 tracking-wider">
              Buzón de Chat ({rooms.length})
            </span>
            <button
              onClick={() => fetchRooms()}
              disabled={roomsLoading}
              className="p-1 rounded-lg text-slate-450 hover:text-slate-800 dark:hover:text-slate-100 font-bold transition duration-150 shrink-0"
              title="Actualizar chats"
            >
              <RefreshCw size={11} className={roomsLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Quick tabs filters */}
          <div className="flex px-2 py-1.5 border-b border-slate-150 dark:border-slate-850 gap-1 bg-slate-50/30 overflow-x-auto shrink-0 scrollbar-none scroll-smooth">
            {((role === "TEACHER" 
                ? ["ALL", "GRADE", "ASSIGNMENT", "PRIVATE", "GROUP", "MODERATOR"] 
                : ["ALL", "GRADE", "ASSIGNMENT", "PRIVATE", "GROUP"]
              ) as ("ALL" | "GRADE" | "ASSIGNMENT" | "PRIVATE" | "GROUP" | "MODERATOR")[]).map(tab => (
              <button
                key={tab}
                onClick={() => setRoomsTab(tab)}
                className={`px-2 py-0.5 text-[8.5px] font-bold rounded-lg uppercase tracking-wide border transition shrink-0 cursor-pointer ${
                  roomsTab === tab
                    ? "bg-[#004d4d] text-white border-[#004d4d]"
                    : "bg-white text-slate-450 hover:text-slate-700 dark:bg-slate-900 border-slate-150 dark:border-slate-800"
                }`}
              >
                {tab === "ALL" ? "Todos" : 
                 tab === "GRADE" ? "Salón" : 
                 tab === "ASSIGNMENT" ? "Tareas" : 
                 tab === "PRIVATE" ? "Inbx" : 
                 tab === "GROUP" ? "Grup" : "🚫 Moderar"}
              </button>
            ))}
          </div>

          {/* Teacher Group Creation Fast Link */}
          {role === "TEACHER" && (
            <div className="p-2 shrink-0 border-b border-dashed border-slate-150 dark:border-slate-800 bg-amber-500/5 select-none">
              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-brand-gold hover:opacity-95 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition active:scale-95 shadow-sm cursor-pointer"
              >
                <Plus size={10} className="stroke-[3]" />
                <span>Crear Grupo 👥</span>
              </button>
            </div>
          )}

          {/* List area */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1 bg-slate-50/10 max-h-[580px]">
            {roomsTab === "MODERATOR" ? (
              <div className="p-1.5 space-y-3">
                <div className="p-2 border border-slate-200/60 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 rounded-xl">
                  <h5 className="text-[9.5px] font-black uppercase text-[#004d4d] dark:text-teal-400">Control de Alumnos 🚫</h5>
                  <p className="text-[8.5px] font-medium text-slate-400 mt-0.5 leading-normal">Silencia o reactiva alumnos de forma global para prevenir vocabulario obsceno o conductas inadecuadas.</p>
                </div>

                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={moderatorSearchQuery || ""}
                    onChange={(e) => setModeratorSearchQuery(e.target.value)}
                    placeholder="Filtrar por nombre o cédula..."
                    className="w-full pl-7 pr-3 py-1.5 text-[10px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder-slate-450 rounded-lg outline-none focus:ring-1 focus:ring-brand-teal"
                  />
                </div>

                <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                  {students
                    .filter(s => {
                      if (!moderatorSearchQuery) return true;
                      return s.name.toLowerCase().includes(moderatorSearchQuery.toLowerCase()) || s.ci.includes(moderatorSearchQuery);
                    })
                    .map(student => {
                      const cleanCi = student.ci.replace(/\D/g, "");
                      const isMuted = restrictions.restrictedCis.includes(cleanCi);
                      return (
                        <div key={student.id} className="p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-xl flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[9.5px] font-bold text-slate-800 dark:text-slate-100 truncate">{student.name}</span>
                            <span className="block text-[8px] font-mono text-slate-400">C.I. {student.ci} • {student.section}</span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => toggleStudentMute(cleanCi, isMuted)}
                            className={`px-1.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider transition cursor-pointer border shrink-0 ${
                              isMuted
                                ? "bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/15"
                                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-200/50 dark:border-slate-700"
                            }`}
                          >
                            {isMuted ? "🔓 Permitir" : "🚫 Bloquear"}
                          </button>
                        </div>
                      );
                    })
                  }
                  {students.length === 0 && (
                    <p className="text-center text-[9px] text-slate-400 py-4 font-bold">No hay estudiantes cargados en el directorio.</p>
                  )}
                </div>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="py-12 px-3 text-center text-slate-400 dark:text-slate-500">
                <MessageSquare size={18} className="mx-auto mb-1 opacity-50" />
                <p className="text-[10px] font-bold leading-normal">
                  No hay chats de esta categoría en tu lista.
                </p>
              </div>
            ) : (
              filteredRooms.map(room => {
                const isSelected = selectedRoom?.id === room.id;
                const { icon, className } = getRoomIconAndColor(room.type);
                const unreadCount = getUnreadCount(room.id);
                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    className={`w-full text-left p-2 rounded-xl border flex flex-col gap-1 transition relative ${
                      isSelected 
                        ? "bg-[#004d4d]/10 border-brand-teal/40 shadow-sm" 
                        : "bg-white dark:bg-slate-900 border-slate-150 hover:border-slate-205 dark:border-slate-800 dark:hover:border-slate-750"
                    }`}
                  >
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-extrabold text-[8.5px] h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center animate-pulse border border-white dark:border-slate-950 shadow-sm z-10">
                        {unreadCount}
                      </span>
                    )}
                    <div className="flex justify-between items-start gap-1 min-w-0">
                      <span className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200 truncate leading-tight block pr-1">
                        {getRoomDisplayName(room)}
                      </span>
                      <span className={`px-1 py-0.5 rounded text-[7px] font-bold border leading-none shrink-0 uppercase flex items-center gap-0.5 ${className}`}>
                        {icon}
                        {room.type === "GRADE" ? "Salón" : 
                         room.type === "ASSIGNMENT" ? "Tarea" : 
                         room.type === "PRIVATE" ? "Privado" : "Grupo"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[8px] text-slate-450 dark:text-slate-500 font-bold">
                      <span className="truncate">
                        {room.type === "GRADE" ? "Sección activa" : 
                         room.type === "ASSIGNMENT" ? "Inquietudes" : 
                         room.type === "PRIVATE" ? "Plática Privada" : `${room.memberCis?.length || 0} alumnos`}
                      </span>
                      <ChevronRight size={10} className="shrink-0 text-slate-400" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ACTIVE CONVERSATION WINDOW */}
        <div className={`flex-grow flex flex-col h-full bg-slate-50/20 dark:bg-slate-900/10 ${!selectedRoom ? "hidden sm:flex items-center justify-center p-8 text-center" : "flex"}`}>
          
          {selectedRoom ? (
            <>
              {/* Header inside thread */}
              <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button 
                    onClick={() => setSelectedRoom(null)}
                    className="p-1 -ml-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition sm:hidden shrink-0"
                    title="Atrás a chats"
                  >
                    ◀️
                  </button>
                  <div className="min-w-0">
                    <h4 className="text-[11px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200 truncate">
                      {getRoomDisplayName(selectedRoom)}
                    </h4>
                    <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Canal de consultas • Actualización Automática</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Restrict room toggle */}
                  {selectedRoom && (
                    role === "TEACHER" ? (
                      <button
                        onClick={() => toggleRoomMute(selectedRoom.id, restrictions.mutedRooms.includes(selectedRoom.id))}
                        className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition cursor-pointer border ${
                          restrictions.mutedRooms.includes(selectedRoom.id)
                            ? "bg-rose-500/15 text-rose-600 border-rose-500/30 hover:bg-rose-500/25 animate-pulse"
                            : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15"
                        }`}
                        title={restrictions.mutedRooms.includes(selectedRoom.id) ? "Habilitar chat para alumnos" : "Silenciar chat para alumnos (Anuncios)"}
                      >
                        {restrictions.mutedRooms.includes(selectedRoom.id) ? <Lock size={9} className="stroke-[3]" /> : <Unlock size={9} />}
                        <span>{restrictions.mutedRooms.includes(selectedRoom.id) ? "Canal Silenciado" : "Silenciar Canal"}</span>
                      </button>
                    ) : (
                      restrictions.mutedRooms.includes(selectedRoom.id) && (
                        <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 border border-amber-500/30">
                          <Lock size={9} className="stroke-[3]" />
                          <span>Sólo Lectura</span>
                        </span>
                      )
                    )
                  )}

                  <button
                    onClick={() => fetchMessages(selectedRoom.id)}
                    disabled={messagesLoading}
                    className="p-1 rounded-lg text-slate-450 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition shrink-0"
                    title="Recargar conversación"
                  >
                    <RefreshCw size={11} className={messagesLoading ? "animate-spin text-brand-teal" : ""} />
                  </button>
                  <button 
                    onClick={() => setSelectedRoom(null)}
                    className="text-[9px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hidden sm:block uppercase tracking-wider shrink-0"
                    title="Cerrar chat"
                  >
                    Cerrar ×
                  </button>
                </div>
              </div>

              {/* Chat messages stream */}
              <div 
                className="flex-grow overflow-y-auto p-4 space-y-3.5 flex flex-col chat-scroll min-h-[300px]"
                style={{
                  backgroundImage: "url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')",
                  backgroundSize: "cover",
                  backgroundAttachment: "fixed",
                  backgroundBlendMode: theme === "dark" ? "multiply" : "soft-light",
                  backgroundColor: theme === "dark" ? "rgba(15, 23, 42, 0.95)" : "rgba(240, 244, 244, 0.9)"
                }}
              >
                {messagesLoading && messages.length === 0 ? (
                  <div className="my-auto flex flex-col items-center justify-center gap-2">
                    <RefreshCw size={22} className="animate-spin text-brand-teal" />
                    <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                      Cargando mensajes...
                    </span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="my-auto text-center px-4">
                    <MessageSquare size={24} className="mx-auto mb-1.5 opacity-35 text-slate-450" />
                    <h5 className="text-[10px] font-black text-slate-450 uppercase tracking-wider">
                      ¡Comienza la plática!
                    </h5>
                    <p className="text-[9px] text-slate-400 leading-normal max-w-xs mx-auto mt-0.5">
                      Describe tus comentarios o consultas para la profesora. Recuerda mantener un vocabulario educado y formal.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    // Check if sent by current user
                    const isMe = role === "TEACHER" 
                      ? msg.senderRole === "TEACHER" 
                      : msg.senderRole === "STUDENT" && msg.senderCi === studentCi;

                    return (
                      <div 
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${
                          isMe ? "self-end items-end" : "self-start items-start"
                        }`}
                      >
                        {/* Name label */}
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5 select-none px-1 drop-shadow-sm">
                          {isMe ? "Tú" : msg.senderName} 
                          {msg.senderRole === "TEACHER" && !isMe && " 👩‍🏫"}
                        </span>

                        {/* WhatsApp Style Bubble */}
                        <div 
                          className={`relative p-2 px-3 rounded-2xl text-[13px] leading-relaxed font-sans shadow-sm ${
                            isMe 
                              ? "bg-[#dcf8c6] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none" 
                              : msg.senderName === "SISTEMA" 
                                ? "bg-[#fff3c4] dark:bg-[#3d3319] text-[#5c4a16] dark:text-[#f8e6a0] rounded-tl-none self-center max-w-[95%] text-center border border-amber-200/50 dark:border-amber-900/50"
                                : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none"
                          }`}
                        >
                          {/* Chat Tail SVG for WhatsApp effect */}
                          {msg.senderName !== "SISTEMA" && (
                            <svg viewBox="0 0 8 13" width="8" height="13" className={`absolute top-0 ${isMe ? "-right-[7px] text-[#dcf8c6] dark:text-[#005c4b]" : "-left-[7px] text-white dark:text-[#202c33]"}`}>
                              <path opacity=".13" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z" fill="currentColor"></path>
                              <path fill="currentColor" d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z"></path>
                            </svg>
                          )}

                          {msg.mediaType === "sticker" ? (
                            <div className="flex flex-col items-center justify-center p-1 text-center select-none min-w-[80px]">
                              <div className="text-[64px] leading-none mb-1 hover:scale-110 transition-transform cursor-pointer drop-shadow-md">{msg.mediaUrl}</div>
                              <span className={`text-[10px] font-semibold italic ${isMe ? "text-emerald-800 dark:text-emerald-200" : "text-slate-500 dark:text-slate-400"}`}>{msg.mediaName}</span>
                            </div>
                          ) : msg.mediaType === "image" ? (
                            <div className="space-y-1">
                              <img 
                                src={msg.mediaUrl} 
                                alt={msg.mediaName || "Imagen adjunta"} 
                                className="rounded-xl max-w-full max-h-[220px] object-cover cursor-pointer hover:opacity-95"
                                referrerPolicy="no-referrer"
                                onClick={() => window.open(msg.mediaUrl, "_blank")}
                              />
                              {msg.mediaName && <p className="text-[10px] opacity-75 font-bold truncate max-w-[200px]">{msg.mediaName}</p>}
                            </div>
                          ) : msg.mediaType === "video" ? (
                            <div className="space-y-1 justify-center flex flex-col">
                              <video 
                                src={msg.mediaUrl} 
                                controls 
                                className="rounded-xl w-full max-w-[260px] max-h-[200px] bg-black outline-none"
                              />
                              {msg.mediaName && <p className="text-[10px] opacity-75 font-bold truncate max-w-[200px]">{msg.mediaName}</p>}
                            </div>
                          ) : msg.mediaType === "document" ? (
                            <div className={`flex items-center gap-2 p-2 rounded-xl max-w-[260px] ${isMe ? "bg-[#c8e6b3] dark:bg-[#004a3c]" : "bg-slate-50 dark:bg-[#2a3942]"}`}>
                              <div className="p-2 bg-rose-500 text-white rounded-lg shrink-0">
                                <FileText size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-bold truncate leading-tight">
                                  {msg.mediaName || "Documento"}
                                </p>
                                <p className="text-[9px] opacity-75 font-bold uppercase tracking-wider mt-0.5 select-none">
                                  Archivo PDF / Doc
                                </p>
                              </div>
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-2 rounded-lg transition shrink-0 ${isMe ? "bg-[#b8d8a3] hover:bg-[#a8c893] dark:bg-[#003a2c]" : "bg-slate-200 hover:bg-slate-300 dark:bg-[#36444d]"}`}
                                title="Abrir o Descargar"
                              >
                                <Download size={14} />
                              </a>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap">{msg.message}</div>
                          )}

                          {/* Date label inside bubble */}
                          <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] font-semibold ${isMe ? "text-[#54656f] dark:text-[#8696a0]" : "text-[#8696a0]"}`}>
                            <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {isMe && <Check size={12} className="text-[#53bdeb]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat typing box */}
              {chatError && (
                <div className="px-4 py-1.5 text-[9px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/15 border-t border-rose-100 dark:border-rose-900/20 select-none">
                  ⚠️ Error: {chatError}
                </div>
              )}

              {/* Warnings and mute status flags */}
              {isCurrentStudentRestricted && (
                <div className="px-4 py-2 border-t border-rose-150 bg-rose-50 dark:bg-rose-950/10 text-rose-650 dark:text-rose-450 text-[10px] font-semibold leading-relaxed flex items-center gap-2 select-none shrink-0">
                  <ShieldAlert size={14} className="text-rose-500 shrink-0" />
                  <span>Tu cuenta ha sido restringida de participar en el chat por la Profesora Anuvis Medina debido al uso de vocabulario inadecuado o comportamiento indebido.</span>
                </div>
              )}

              {isCurrentRoomMuted && !isCurrentStudentRestricted && (
                <div className="px-4 py-2 border-t border-amber-150 bg-amber-50 dark:bg-amber-950/10 text-amber-650 dark:text-amber-450 text-[10px] font-semibold leading-relaxed flex items-center gap-2 select-none shrink-0">
                  <Lock size={12} className="text-amber-500 shrink-0 animate-bounce mr-1" />
                  <span>La Profesora Anuvis Medina ha pausado temporalmente el envío de mensajes en esta sala. Solo lectura de avisos.</span>
                </div>
              )}

              {/* Study Sticker Drawer Popover */}
              <AnimatePresence>
                {showStickersMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="p-3 bg-slate-50 border-t border-slate-150 dark:bg-slate-950/95 dark:border-slate-850 flex flex-col gap-2 shrink-0 select-none relative z-10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[#004d4d] dark:text-teal-400 flex items-center gap-1.5">
                        <Smile size={11} className="stroke-[2.5]" />
                        Stickers Educativos (WhatsApp-style)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowStickersMenu(false)}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Cerrar ×
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {STUDY_STICKERS.map((stk, sidx) => (
                        <button
                          key={sidx}
                          type="button"
                          onClick={() => handleSendSticker(stk.text, stk.icon)}
                          className="p-1.5 rounded-xl bg-white border border-slate-250 hover:border-brand-teal/40 dark:bg-slate-900 dark:border-slate-800 hover:bg-slate-50 flex flex-col items-center gap-1 cursor-pointer transition active:scale-95 text-center text-xs group"
                        >
                          <div className="text-2xl group-hover:scale-110 transition duration-150">{stk.icon}</div>
                          <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate w-full">{stk.text.replace(/[\!\¡\🌟\🏆\👍\📝\📚\💡\🎨\🤔]/g, "").trim()}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Standard HTML File input for uploads */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain"
              />

              <form 
                onSubmit={handleSendMessage}
                className="p-2 sm:p-3 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 flex items-end gap-2 shrink-0 select-none z-20"
              >
                {/* Sticker Smile button */}
                <button
                  type="button"
                  disabled={isSending || isFileUploading || (role === "STUDENT" && !studentCi) || isCurrentStudentRestricted || isCurrentRoomMuted}
                  onClick={() => setShowStickersMenu(!showStickersMenu)}
                  className={`p-2.5 rounded-full transition shrink-0 cursor-pointer disabled:opacity-40 flex items-center justify-center h-10 w-10 ${
                    showStickersMenu
                      ? "bg-slate-200 dark:bg-slate-700 text-[#54656f] dark:text-[#8696a0]"
                      : "text-[#54656f] hover:bg-slate-200 dark:text-[#8696a0] dark:hover:bg-slate-800"
                  }`}
                  title="Stickers y Emojis"
                >
                  <Smile size={22} className="stroke-[2]" />
                </button>

                {/* Paperclip Action button */}
                <button
                  type="button"
                  disabled={isSending || isFileUploading || (role === "STUDENT" && !studentCi) || isCurrentStudentRestricted || isCurrentRoomMuted}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-full text-[#54656f] hover:bg-slate-200 dark:text-[#8696a0] dark:hover:bg-slate-800 transition shrink-0 cursor-pointer disabled:opacity-40 flex items-center justify-center h-10 w-10"
                  title="Adjuntar archivo"
                >
                  {isFileUploading ? (
                    <RefreshCw size={20} className="animate-spin text-brand-teal" />
                  ) : (
                    <Paperclip size={20} className="stroke-[2]" />
                  )}
                </button>

                <div className="flex-grow bg-white dark:bg-[#2a3942] rounded-2xl border border-transparent focus-within:border-brand-teal transition min-h-[40px] flex items-center px-4">
                  <textarea 
                    value={typedMessage}
                    required={!showStickersMenu}
                    onChange={(e) => {
                      setTypedMessage(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    rows={1}
                    placeholder={
                      role === "STUDENT" && !studentCi 
                        ? "Inicia sesión con tu cédula primero" 
                        : isCurrentStudentRestricted
                          ? "🚫 Participación restringida en el aula"
                          : isCurrentRoomMuted
                            ? "🔒 Canal silenciado"
                            : "Escribe un mensaje"
                    }
                    disabled={isSending || isFileUploading || (role === "STUDENT" && !studentCi) || isCurrentStudentRestricted || isCurrentRoomMuted}
                    className="w-full py-2.5 bg-transparent text-[14px] text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none disabled:opacity-50 resize-none max-h-[120px] overflow-y-auto chat-scroll"
                    style={{ lineHeight: "1.4" }}
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSending || isFileUploading || !typedMessage.trim() || (role === "STUDENT" && !studentCi) || isCurrentStudentRestricted || isCurrentRoomMuted}
                  className="p-2.5 bg-[#00a884] text-white rounded-full shadow-sm transition active:scale-95 disabled:opacity-40 flex items-center justify-center shrink-0 cursor-pointer h-10 w-10 self-end hover:bg-[#008f6f]"
                  title="Enviar"
                >
                  {isSending ? (
                    <RefreshCw size={18} className="animate-spin text-white" />
                  ) : (
                    <Send size={18} className="stroke-[2] -ml-0.5" />
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 select-none">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center mb-4 border border-slate-200/50 dark:border-slate-800 text-brand-teal animate-pulse">
                <MessageSquare size={26} className="text-brand-teal dark:text-teal-400 shrink-0" />
              </div>
              <h4 className="text-xs font-black uppercase text-[#004d4d] dark:text-teal-400 tracking-wider">
                Selecciona un chat de la lista
              </h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-xs mt-1 leading-relaxed">
                {role === "STUDENT" 
                  ? "Escoge un canal de plática a la izquierda para interactuar con tus compañeros, profesor y aclarar dudas de tus tareas."
                  : "Selecciona un salón de clases, una tarea específica, chat directo con alumnos o crea grupos para asesorarles."}
              </p>
              
              {role === "STUDENT" && !studentCi && (
                <div className="mt-4 p-3 border border-dashed border-amber-300 dark:border-amber-800 bg-amber-500/5 rounded-xl text-center text-amber-700 dark:text-amber-400 text-[10px] font-bold max-w-xs flex gap-2">
                  <Info size={14} className="shrink-0 text-amber-500 mt-0.5" />
                  <span>Por favor ingresa tu número de cédula en la pestaña "Enviar" o "Notas" para verificar tu identidad y habilitar el chat con tu sección.</span>
                </div>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
