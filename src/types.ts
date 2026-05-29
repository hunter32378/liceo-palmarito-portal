/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AppView = "ROLE_SELECTION" | "STUDENT_VIEW" | "TEACHER_VIEW";

export interface Submission {
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

export interface AuthorizedStudent {
  id: string;
  name: string;
  ci: string;
  section: "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado";
  createdAt: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  section: "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado" | "TODOS";
  createdAt: string;
  dueDate?: string;
  attachmentLink?: string;
  attachmentName?: string;
}

export interface AppNotification {
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

export interface ChatRoom {
  id: string;
  type: "GRADE" | "ASSIGNMENT" | "PRIVATE" | "GROUP";
  name: string;
  section?: "Primer Grado" | "Segundo Grado" | "Tercer Grado" | "Cuarto Grado" | "Quinto Grado";
  assignmentId?: string;
  memberCis?: string[];
  createdAt: string;
}

export interface ChatMessage {
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
