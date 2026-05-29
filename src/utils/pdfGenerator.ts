import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Submission, AuthorizedStudent, Assignment } from "../types";

export interface GeneratePdfOptions {
  submissions: Submission[];
  allowedStudents: AuthorizedStudent[];
  assignments: Assignment[];
  selectedSection: string;
}

export function generateGradesReport({
  submissions,
  allowedStudents,
  assignments,
  selectedSection,
}: GeneratePdfOptions): void {
  // 1. Filter students based on section selection
  const filteredStudents = selectedSection === "ALL"
    ? allowedStudents
    : allowedStudents.filter(s => s.section === selectedSection);

  // Sort students alphabetically
  filteredStudents.sort((a, b) => a.name.localeCompare(b.name, "es-ES"));

  // 2. Filter assignments based on section selection
  const filteredAssignments = selectedSection === "ALL"
    ? assignments
    : assignments.filter(a => a.section === selectedSection || a.section === "TODOS");

  // Sort assignments chronologically (older first to keep a natural timeline progress)
  filteredAssignments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Determine page orientation based on columns
  // If we have more than 3 assignments, use landscape to make sure text is not truncated
  const useLandscape = selectedSection !== "ALL" && filteredAssignments.length > 2;
  const doc = new jsPDF({
    orientation: useLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Primary Theme Colors (Teal / Anuvis's palette)
  const primaryColor = [0, 77, 77]; // #004d4d (Teal)
  const secondaryColor = [197, 160, 89]; // #c5a059 (Gold/Amber)
  const textDark = [30, 41, 59]; // Slate 800
  const bgLight = [248, 250, 252]; // Slate 50

  // 3. Draw Beautiful Aesthetic Header Banner
  // Solid color elegant thin bar
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(15, 12, pageWidth - 30, 4, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("AULA DE LA PROFESORA ANUVIS MEDINA", 15, 23);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text("Sistema de Gestión Primaria • Reporte Técnico de Calificaciones", 15, 28);

  // Report details box
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.rect(15, 33, pageWidth - 30, 20, "F");
  
  doc.setLineWidth(0.2);
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.rect(15, 33, pageWidth - 30, 20, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text("PARÁMETROS DEL REPORTE", 20, 39);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Grado/Sección: ${selectedSection === "ALL" ? "Todos los Grados" : selectedSection}`, 20, 45);
  doc.text(`Docente: Profa. Anuvis Medina`, 20, 49);

  doc.text(`Fecha Impresión: ${dateStr}`, pageWidth - 105, 45);
  const totalSubmissions = submissions.filter(sub => {
    if (selectedSection === "ALL") return true;
    return sub.section === selectedSection;
  }).length;
  doc.text(`Entregas Canalizadas: ${totalSubmissions} tareas`, pageWidth - 105, 49);

  // 4. Section Math & Summary Analytics Cards
  // Draw summary boxes for key indicators under parameters
  let startY = 58;

  const colWidth = (pageWidth - 30) / 4;
  const metrics = [
    { title: "ALUMNOS REGISTRADOS", value: `${filteredStudents.length}`, sub: "Inscritos en aula" },
    { title: "TAREAS PUBLICADAS", value: `${filteredAssignments.length}`, sub: "Asignaciones totales" },
    { title: "TASA DE ENTREGA", value: filteredStudents.length > 0 && filteredAssignments.length > 0 
        ? `${Math.round((totalSubmissions / (filteredStudents.length * filteredAssignments.length)) * 100)}%` 
        : "0%", 
      sub: "Deberes sumitidos" },
    { 
      title: "TAREAS CALIFICADAS", 
      value: `${submissions.filter(s => (selectedSection === "ALL" || s.section === selectedSection) && s.grade).length}`, 
      sub: "Revisadas con nota" 
    }
  ];

  metrics.forEach((m, idx) => {
    const xPos = 15 + idx * colWidth;
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.rect(xPos + 1, startY, colWidth - 2, 14, "F");
    doc.rect(xPos + 1, startY, colWidth - 2, 14, "S");

    // Decorative tiny line to make it pop
    doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.rect(xPos + 1, startY, 1.5, 14, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(m.title, xPos + 5, startY + 4.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(m.value, xPos + 5, startY + 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(m.sub, xPos + colWidth - 28, startY + 10, { align: "right" });
  });

  // Table header selection
  const headers: string[] = [];
  const rows: any[][] = [];

  if (selectedSection === "ALL") {
    // Report columns for overall overview across all grades
    headers.push("Cédula", "Nombre del Estudiante", "Grado / Sección", "Tareas Entregadas", "Calificadas", "Estado");
    
    filteredStudents.forEach(st => {
      const studentSubs = submissions.filter(s => s.ci.replace(/\D/g, "") === st.ci.replace(/\D/g, ""));
      const gradedSubs = studentSubs.filter(s => s.grade);
      
      const stAssignments = assignments.filter(a => a.section === st.section || a.section === "TODOS");
      const submissionRate = `${studentSubs.length} / ${stAssignments.length}`;
      const gradedStr = `${gradedSubs.length} / ${studentSubs.length}`;
      
      let status = "Al Día";
      if (studentSubs.length < stAssignments.length) {
        status = `${stAssignments.length - studentSubs.length} Pendiente(s)`;
      } else if (gradedSubs.length < studentSubs.length) {
        status = "Por Calificar";
      }

      rows.push([
        st.ci,
        st.name,
        st.section,
        submissionRate,
        gradedStr,
        status
      ]);
    });
  } else {
    // Dynamic Columns for Specific Section! Includes each assignment!
    headers.push("Cédula", "Nombre del Alumno");
    
    // Add truncated titles as headers
    filteredAssignments.forEach(asg => {
      const displayTitle = asg.title.length > 22 ? `${asg.title.slice(0, 20)}...` : asg.title;
      headers.push(displayTitle);
    });
    
    headers.push("Entregas de Grado");

    filteredStudents.forEach(st => {
      const stRow: any[] = [st.ci, st.name];
      let submittedCount = 0;

      filteredAssignments.forEach(asg => {
        // Find if student has submitted this specific assignment
        const matchSub = submissions.find(sub => 
          sub.assignmentId === asg.id && 
          sub.ci.replace(/\D/g, "") === st.ci.replace(/\D/g, "")
        );

        if (matchSub) {
          submittedCount++;
          if (matchSub.grade) {
            stRow.push(matchSub.grade);
          } else {
            stRow.push("Entregado (s/n)"); // No note yet
          }
        } else {
          stRow.push("No entregó");
        }
      });

      stRow.push(`${submittedCount} de ${filteredAssignments.length}`);
      rows.push(stRow);
    });
  }

  // 5. Draw Table using autoTable
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: startY + 20,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.8,
      lineWidth: 0.1,
      lineColor: [226, 232, 240], // Slate 200
    },
    headStyles: {
      fillColor: primaryColor as [number, number, number],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: bgLight as [number, number, number],
    },
    columnStyles: {
      0: { fontStyle: "bold", font: "courier" }, // C.I. nicely aligned
      1: { cellWidth: "auto" },
    },
    margin: { top: 20, left: 15, right: 15, bottom: 20 },
    didDrawPage: (data) => {
      // Add standard footer to each page to keep it clean and professional
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // Slate 400
      
      const str = `Página ${data.pageNumber}`;
      doc.text(
        "Aula de la Profesora Anuvis Medina • Caracas, Venezuela",
        15,
        pageHeight - 10
      );
      doc.text(str, pageWidth - 15, pageHeight - 10, { align: "right" });
    }
  });

  // Save the PDF
  const filename = `Calificaciones_${selectedSection.replace(/\s+/g, "_")}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.pdf`;
  doc.save(filename);
}
