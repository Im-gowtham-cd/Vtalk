import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Export a session as a styled PDF.
 *
 * @param {Object} session — the full session object from the backend
 */
export function exportSessionPDF(session) {
    const doc = new jsPDF();
    const olive = [85, 107, 47];      // #556B2F
    const oliveLight = [107, 142, 61]; // #6B8E3D
    const dark = [10, 10, 10];        // #0A0A0A

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;

    // ── PAGE 1: COVER ──────────────────────────────────────────────────────────

    // Header bar
    doc.setFillColor(...olive);
    doc.rect(0, 0, pageWidth, 50, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text('SpiceZ-Cam / Vtalk', margin, 32);

    // Meeting info
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(16);
    doc.text(`Meeting: Room ${session.roomId || 'Unknown'}`, margin, 75);

    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    const dateStr = session.date
        ? new Date(session.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Unknown date';

    const durationStr = session.duration
        ? `${Math.floor(session.duration / 60)} minutes`
        : 'Unknown';

    const participantNames = (session.participants || []).map((p) => p.name || 'Anonymous');
    const participantStr = participantNames.length > 0
        ? participantNames.slice(0, 4).join(', ') + (participantNames.length > 4 ? ` (+${participantNames.length - 4} more)` : '')
        : 'None';

    doc.text(`Date: ${dateStr}`, margin, 90);
    doc.text(`Duration: ${durationStr}`, margin, 100);
    doc.text(`Participants: ${participantStr}`, margin, 110);

    // Decorative line
    doc.setDrawColor(...olive);
    doc.setLineWidth(0.5);
    doc.line(margin, 120, pageWidth - margin, 120);

    // ── PAGE 2: TASK SUMMARY ───────────────────────────────────────────────────

    const tasks = session.tasks || [];
    if (tasks.length > 0) {
        doc.addPage();

        // Section header
        doc.setFillColor(...olive);
        doc.rect(0, 0, pageWidth, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('TASK SUMMARY', margin, 9);

        doc.setTextColor(60, 60, 60);
        doc.setFontSize(12);
        doc.text(`Total Tasks: ${tasks.length}`, margin, 28);

        // Task table
        const priorityColors = {
            HIGH: [255, 230, 230],
            MEDIUM: [255, 248, 225],
            LOW: [230, 255, 230],
        };

        const taskRows = tasks.map((t, i) => [
            i + 1,
            t.text || '',
            t.assignedTo || 'Unassigned',
            t.deadline || '—',
            t.priority || 'MEDIUM',
            t.status === 'completed' ? '✓ Done' : 'Pending',
        ]);

        doc.autoTable({
            startY: 35,
            head: [['#', 'Task', 'Assigned To', 'Deadline', 'Priority', 'Status']],
            body: taskRows,
            theme: 'grid',
            headStyles: {
                fillColor: olive,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8,
            },
            styles: {
                fontSize: 8,
                cellPadding: 4,
                textColor: [50, 50, 50],
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 60 },
                2: { cellWidth: 30 },
                3: { cellWidth: 25 },
                4: { cellWidth: 20, halign: 'center' },
                5: { cellWidth: 20, halign: 'center' },
            },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 4) {
                    const priority = data.cell.raw;
                    if (priority && priorityColors[priority]) {
                        data.cell.styles.fillColor = priorityColors[priority];
                    }
                }
            },
        });

        // Assignments by person summary
        const assignments = {};
        tasks.forEach((t) => {
            const name = t.assignedTo || 'Unassigned';
            assignments[name] = (assignments[name] || 0) + 1;
        });

        const summaryY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text('Assignments by Person:', margin, summaryY);

        doc.setFont('helvetica', 'normal');
        const assignmentStr = Object.entries(assignments)
            .map(([name, count]) => `${name}: ${count} task${count > 1 ? 's' : ''}`)
            .join('  |  ');
        doc.text(assignmentStr, margin, summaryY + 8);
    }

    // ── PAGE 3+: FULL TRANSCRIPT ───────────────────────────────────────────────

    const transcript = session.transcript || [];
    if (transcript.length > 0) {
        doc.addPage();

        doc.setFillColor(...olive);
        doc.rect(0, 0, pageWidth, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('FULL TRANSCRIPT', margin, 9);

        const transcriptRows = transcript.map((seg) => {
            const ts = new Date(seg.timestamp);
            const pad = (n) => String(n).padStart(2, '0');
            const time = `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
            return [seg.speaker || 'Unknown', time, seg.text || ''];
        });

        doc.autoTable({
            startY: 20,
            head: [['Speaker', 'Time', 'Text']],
            body: transcriptRows,
            theme: 'striped',
            headStyles: {
                fillColor: olive,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8,
            },
            styles: {
                fontSize: 7,
                cellPadding: 3,
                textColor: [60, 60, 60],
            },
            columnStyles: {
                0: { cellWidth: 28, fontStyle: 'bold' },
                1: { cellWidth: 22, halign: 'center' },
                2: { cellWidth: 'auto' },
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245],
            },
        });
    }

    // ── Save ───────────────────────────────────────────────────────────────────

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateFile = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const filename = `vtalk-${session.roomId || 'session'}-${dateFile}.pdf`;
    doc.save(filename);
}
