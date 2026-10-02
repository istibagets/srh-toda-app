const fs = require('fs');
const path = require('path');

const diagramsDir = path.join(__dirname, '..', 'diagrams');
if (!fs.existsSync(diagramsDir)) {
  fs.mkdirSync(diagramsDir, { recursive: true });
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapDrawio(name, width, height, content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="SRH-LINK-TODA" version="24.7.5">
  <diagram id="${name}" name="${name}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${content}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

function createProcBox(id, num, name, x, y, w = 240, h = 70) {
  return `        <mxCell id="${id}_h" value="${num}" style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.3;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="22" as="geometry" />
        </mxCell>
        <mxCell id="${id}" value="${name}" style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.3;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y + 22}" width="${w}" height="${h - 22}" as="geometry" />
        </mxCell>`;
}

function createStoreBox(id, tag, name, x, y, w = 220, h = 44) {
  return `        <mxCell id="${id}_t" value="${tag}" style="shape=partialRectangle;top=0;left=0;right=1;bottom=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="36" height="${h}" as="geometry" />
        </mxCell>
        <mxCell id="${id}" value="${name}" style="shape=partialRectangle;top=0;left=0;right=1;bottom=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=left;spacingLeft=8;" vertex="1" parent="1">
          <mxGeometry x="${x + 36}" y="${y}" width="${w - 36}" height="${h}" as="geometry" />
        </mxCell>`;
}

function createEntityBox(id, name, x, y, w = 170, h = 80) {
  return `        <mxCell id="${id}" value="${name}" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11.5;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />
        </mxCell>`;
}

function createEdge(id, label, x1, y1, x2, y2, points = []) {
  const ptsXml = points.length > 0 ? `<Array as="points">${points.map(p => `<mxPoint x="${p.x}" y="${p.y}" />`).join('')}</Array>` : '';
  return `        <mxCell id="${id}" value="${escapeXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=9.5;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${x1}" y="${y1}" as="sourcePoint" />
            <mxPoint x="${x2}" y="${y2}" as="targetPoint" />
            ${ptsXml}
          </mxGeometry>
        </mxCell>`;
}

// ══════════════════════════════════════════════════════════════════════════
// DFD LEVEL 2 - PROCESS 1.0 (Manage Authentication & User Profiles)
// ══════════════════════════════════════════════════════════════════════════
function genDfdL2_Proc1() {
  let cells = [];
  cells.push(createEntityBox(10, 'PASSENGER /&#xa;COMMUTER', 50, 60, 160, 90));
  cells.push(createEntityBox(11, 'TRICYCLE DRIVER', 50, 240, 160, 90));
  cells.push(createEntityBox(12, 'GMAIL SMTP&#xa;SERVICE (API)', 50, 420, 160, 90));

  cells.push(createProcBox(20, '1.1', 'Ingest Registration&#xa;&amp; Login Data', 340, 60, 240, 70));
  cells.push(createProcBox(21, '1.2', 'Dispatch 6-Digit&#xa;Gmail OTP Token', 340, 240, 240, 70));
  cells.push(createProcBox(22, '1.3', 'Verify OTP &amp; Issue&#xa;Sanctum Bearer Token', 340, 420, 240, 70));
  cells.push(createProcBox(23, '1.4', 'Manage User Profile&#xa;&amp; Saved Locations', 340, 600, 240, 70));

  cells.push(createStoreBox(30, 'D1', 'User &amp; Profile Records', 740, 250, 240, 46));

  // Flows
  cells.push(createEdge(100, 'Registration / Login Credentials', 210, 85, 340, 85));
  cells.push(createEdge(101, 'Driver Credentials &amp; Gmail', 210, 265, 340, 265));
  cells.push(createEdge(102, 'Generate 6-Digit OTP', 460, 130, 460, 240));
  cells.push(createEdge(103, 'Send OTP via SMTP', 340, 285, 210, 445, [{ x: 260, y: 285 }, { x: 260, y: 445 }]));
  cells.push(createEdge(104, 'Driver Enters 6-Digit OTP', 210, 310, 340, 440, [{ x: 280, y: 310 }, { x: 280, y: 440 }]));
  cells.push(createEdge(105, 'Store Verified User Record', 580, 455, 740, 270, [{ x: 660, y: 455 }, { x: 660, y: 270 }]));
  cells.push(createEdge(106, 'Return Sanctum Bearer Token', 340, 470, 210, 115, [{ x: 240, y: 470 }, { x: 240, y: 115 }]));
  cells.push(createEdge(107, 'Save Custom Pickup / Profile', 210, 135, 340, 635, [{ x: 220, y: 135 }, { x: 220, y: 635 }]));
  cells.push(createEdge(108, 'Update Profile &amp; Bookmarks', 580, 635, 740, 290, [{ x: 680, y: 635 }, { x: 680, y: 290 }]));

  return wrapDrawio('DFD_Level_2_Process_1_0', 1060, 720, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// DFD LEVEL 2 - PROCESS 2.0 (Verify Driver Credentials & Compliance Status)
// ══════════════════════════════════════════════════════════════════════════
function genDfdL2_Proc2() {
  let cells = [];
  cells.push(createEntityBox(10, 'TRICYCLE DRIVER', 50, 80, 160, 90));
  cells.push(createEntityBox(11, 'TODA ADMINISTRATOR&#xa;(TODA OFFICER)', 50, 320, 160, 90));

  cells.push(createProcBox(20, '2.1', 'Upload Driver License&#xa;&amp; MTOP Scans', 340, 80, 240, 70));
  cells.push(createProcBox(21, '2.2', 'Moderate &amp; Verify&#xa;Compliance Status', 340, 260, 240, 70));
  cells.push(createProcBox(22, '2.3', 'Audit Municipal Franchise&#xa;&amp; Expiry Dates', 340, 440, 240, 70));

  cells.push(createStoreBox(30, 'D2', 'Driver &amp; Compliance Records', 740, 270, 240, 46));

  cells.push(createEdge(100, 'Submit License &amp; MTOP Images', 210, 115, 340, 115));
  cells.push(createEdge(101, 'Store Document File Paths', 580, 115, 740, 280, [{ x: 660, y: 115 }, { x: 660, y: 280 }]));
  cells.push(createEdge(102, 'Fetch Pending Applicant Files', 740, 295, 580, 285));
  cells.push(createEdge(103, 'Review Documents in Portal', 340, 285, 210, 345));
  cells.push(createEdge(104, 'Approve / Reject Action', 210, 375, 340, 310, [{ x: 260, y: 375 }, { x: 260, y: 310 }]));
  cells.push(createEdge(105, 'Update Verified Compliance Flag', 580, 310, 740, 310));
  cells.push(createEdge(106, 'Franchise Expiration Alert', 340, 465, 210, 145, [{ x: 250, y: 465 }, { x: 250, y: 145 }]));
  cells.push(createEdge(107, 'Log Franchise Validity Status', 580, 465, 740, 315, [{ x: 680, y: 465 }, { x: 680, y: 315 }]));

  return wrapDrawio('DFD_Level_2_Process_2_0', 1060, 560, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// DFD LEVEL 2 - PROCESS 3.0 (Manage Terminal Geofence & FIFO Queue)
// ══════════════════════════════════════════════════════════════════════════
function genDfdL2_Proc3() {
  let cells = [];
  cells.push(createEntityBox(10, 'TRICYCLE DRIVER', 50, 70, 160, 80));
  cells.push(createEntityBox(11, 'COMMUTER /&#xa;PASSENGER', 50, 250, 160, 80));
  cells.push(createEntityBox(12, 'TODA ADMINISTRATOR', 50, 430, 160, 80));

  cells.push(createProcBox(20, '3.1', 'Validate GPS Proximity&#xa;&lt;= 35m Terminal Geofence', 340, 50, 240, 70));
  cells.push(createProcBox(21, '3.2', 'Check-in &amp; Assign&#xa;FIFO Queue Rank Number', 340, 210, 240, 70));
  cells.push(createProcBox(22, '3.3', 'Broadcast Real-Time&#xa;Queue State via WebSockets', 340, 370, 240, 70));
  cells.push(createProcBox(23, '3.4', 'Execute Manual Queue&#xa;Override Directive', 340, 530, 240, 70));

  cells.push(createStoreBox(30, 'D3', 'Terminal Queue &amp; FIFO Records', 740, 300, 240, 46));

  cells.push(createEdge(100, 'HTML5 GPS Coordinates Ping', 210, 85, 340, 85));
  cells.push(createEdge(101, 'Geofence Entry Validated', 460, 120, 460, 210));
  cells.push(createEdge(102, 'Commit Enqueue Timestamp', 580, 235, 740, 310, [{ x: 650, y: 235 }, { x: 650, y: 310 }]));
  cells.push(createEdge(103, 'Return Assigned Queue # (e.g. #1)', 340, 255, 210, 120, [{ x: 260, y: 255 }, { x: 260, y: 120 }]));
  cells.push(createEdge(104, 'Fetch Active Roster Count', 740, 330, 580, 395, [{ x: 670, y: 330 }, { x: 670, y: 395 }]));
  cells.push(createEdge(105, 'Broadcast Queue Ticker', 340, 395, 210, 280, [{ x: 270, y: 395 }, { x: 270, y: 280 }]));
  cells.push(createEdge(106, 'Manual Override Command', 210, 465, 340, 555, [{ x: 250, y: 465 }, { x: 250, y: 555 }]));
  cells.push(createEdge(107, 'Update Queue Sequence &amp; Log', 580, 555, 740, 345, [{ x: 690, y: 555 }, { x: 690, y: 345 }]));

  return wrapDrawio('DFD_Level_2_Process_3_0', 1060, 660, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// DFD LEVEL 2 - PROCESS 4.0 (Dispatch Ride, Meter Fare & Telemetry)
// ══════════════════════════════════════════════════════════════════════════
function genDfdL2_Proc4() {
  let cells = [];
  cells.push(createEntityBox(10, 'PASSENGER /&#xa;COMMUTER', 50, 70, 160, 90));
  cells.push(createEntityBox(11, 'TRICYCLE DRIVER', 50, 440, 160, 90));

  cells.push(createProcBox(20, '4.1', 'Ingest Ride Request&#xa;&amp; Drop-Off Pin', 340, 50, 240, 65));
  cells.push(createProcBox(21, '4.2', 'Compute Regulated&#xa;Distance-Tiered Tariff', 340, 160, 240, 65));
  cells.push(createProcBox(22, '4.3', 'Automated Dispatch to&#xa;Front (#1) FIFO Driver', 340, 270, 240, 65));
  cells.push(createProcBox(23, '4.4', 'Stream Live GPS&#xa;Route &amp; Heading Telemetry', 340, 380, 240, 65));
  cells.push(createProcBox(24, '4.5', 'Execute Priority Queue&#xa;Recovery on Cancellation', 340, 490, 240, 65));
  cells.push(createProcBox(25, '4.6', 'Settle Fare Remittance&#xa;&amp; Complete Trip', 340, 600, 240, 65));

  cells.push(createStoreBox(30, 'D3', 'Terminal Queue &amp; FIFO Records', 740, 300, 240, 44));
  cells.push(createStoreBox(31, 'D4', 'Ride, Route &amp; Telemetry Records', 740, 500, 240, 44));

  cells.push(createEdge(100, 'Submit Pickup &amp; Destination', 210, 95, 340, 80));
  cells.push(createEdge(101, 'Query Base Tariff Matrix', 740, 515, 580, 185, [{ x: 670, y: 515 }, { x: 670, y: 185 }]));
  cells.push(createEdge(102, 'Display Computed Fare Preview', 340, 195, 210, 120, [{ x: 260, y: 195 }, { x: 260, y: 120 }]));
  cells.push(createEdge(103, 'Confirm Booking Request', 210, 140, 340, 285, [{ x: 280, y: 140 }, { x: 280, y: 285 }]));
  cells.push(createEdge(104, 'Pop #1 Front Driver', 740, 315, 580, 290));
  cells.push(createEdge(105, 'Push Dispatch Alert Modal', 340, 315, 210, 465, [{ x: 250, y: 315 }, { x: 250, y: 465 }]));
  cells.push(createEdge(106, 'Driver Accepts &amp; Streams GPS', 210, 490, 340, 405, [{ x: 270, y: 490 }, { x: 270, y: 405 }]));
  cells.push(createEdge(107, 'Broadcast Live Driver Position', 340, 420, 210, 155, [{ x: 230, y: 420 }, { x: 230, y: 155 }]));
  cells.push(createEdge(108, 'Passenger Cancels Trip', 210, 170, 340, 515, [{ x: 220, y: 170 }, { x: 220, y: 515 }]));
  cells.push(createEdge(109, 'Restore Driver to Slot #1', 580, 515, 740, 335, [{ x: 680, y: 515 }, { x: 680, y: 335 }]));
  cells.push(createEdge(110, 'Trip Completion &amp; Cash Settle', 210, 515, 340, 625, [{ x: 260, y: 515 }, { x: 260, y: 625 }]));
  cells.push(createEdge(111, 'Commit Completed Ride Record', 580, 625, 740, 535, [{ x: 690, y: 625 }, { x: 690, y: 535 }]));

  return wrapDrawio('DFD_Level_2_Process_4_0', 1060, 720, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// DFD LEVEL 2 - PROCESS 5.0 (Manage Incident Reports & Dispute Moderation)
// ══════════════════════════════════════════════════════════════════════════
function genDfdL2_Proc5() {
  let cells = [];
  cells.push(createEntityBox(10, 'PASSENGER / DRIVER', 50, 80, 160, 90));
  cells.push(createEntityBox(11, 'TODA ADMINISTRATOR', 50, 320, 160, 90));

  cells.push(createProcBox(20, '5.1', 'File Incident Complaint&#xa;&amp; Service Rating', 340, 80, 240, 70));
  cells.push(createProcBox(21, '5.2', 'Review &amp; Moderate&#xa;Incident Evidence', 340, 260, 240, 70));
  cells.push(createProcBox(22, '5.3', 'Issue Administrative&#xa;Sanction / Resolution', 340, 440, 240, 70));

  cells.push(createStoreBox(30, 'D5', 'Incident &amp; Dispute Records', 740, 270, 240, 46));

  cells.push(createEdge(100, 'Submit Complaint &amp; Rating', 210, 115, 340, 115));
  cells.push(createEdge(101, 'Store Incident &amp; Rating Log', 580, 115, 740, 280, [{ x: 660, y: 115 }, { x: 660, y: 280 }]));
  cells.push(createEdge(102, 'Fetch Pending Complaints', 740, 295, 580, 285));
  cells.push(createEdge(103, 'Review Incident Case Details', 340, 285, 210, 345));
  cells.push(createEdge(104, 'Record Sanction / Resolution Notes', 210, 375, 340, 465, [{ x: 260, y: 375 }, { x: 260, y: 465 }]));
  cells.push(createEdge(105, 'Update Case Resolution State', 580, 465, 740, 310, [{ x: 680, y: 465 }, { x: 680, y: 310 }]));
  cells.push(createEdge(106, 'Resolution Notice to User', 340, 485, 210, 145, [{ x: 240, y: 485 }, { x: 240, y: 145 }]));

  return wrapDrawio('DFD_Level_2_Process_5_0', 1060, 560, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// DFD LEVEL 2 - PROCESS 6.0 (Manage TODA Remittance, Ledger & Audits)
// ══════════════════════════════════════════════════════════════════════════
function genDfdL2_Proc6() {
  let cells = [];
  cells.push(createEntityBox(10, 'TRICYCLE DRIVER', 50, 70, 160, 80));
  cells.push(createEntityBox(11, 'TODA ADMINISTRATOR', 50, 240, 160, 80));
  cells.push(createEntityBox(12, 'SUPERADMINISTRATOR', 50, 410, 160, 80));

  cells.push(createProcBox(20, '6.1', 'Record Daily Terminal&#xa;Fee Remittance', 340, 60, 240, 70));
  cells.push(createProcBox(21, '6.2', 'Generate Financial &amp;&#xa;Fare Summary Ledgers', 340, 230, 240, 70));
  cells.push(createProcBox(22, '6.3', 'Oversee System Audit&#xa;Logs &amp; Platform Health', 340, 400, 240, 70));

  cells.push(createStoreBox(30, 'D6', 'Remittance &amp; Audit Trail Records', 740, 240, 240, 46));

  cells.push(createEdge(100, 'Remit Daily Terminal Due (Cash)', 210, 100, 340, 90));
  cells.push(createEdge(101, 'Commit Remittance Entry', 580, 95, 740, 250, [{ x: 660, y: 95 }, { x: 660, y: 250 }]));
  cells.push(createEdge(102, 'Generate Daily Remittance Report', 740, 265, 580, 255));
  cells.push(createEdge(103, 'Deliver Association Fee Summary', 340, 255, 210, 270));
  cells.push(createEdge(104, 'Audit Query &amp; Health Inspect', 210, 440, 340, 425));
  cells.push(createEdge(105, 'Fetch Cross-System Audit Trails', 740, 280, 580, 435, [{ x: 680, y: 280 }, { x: 680, y: 435 }]));
  cells.push(createEdge(106, 'System Telemetry &amp; Log Report', 340, 445, 210, 460));

  return wrapDrawio('DFD_Level_2_Process_6_0', 1060, 540, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// EXECUTE
// ══════════════════════════════════════════════════════════════════════════
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_dfd_level_2_process_1.drawio'), genDfdL2_Proc1(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_dfd_level_2_process_2.drawio'), genDfdL2_Proc2(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_dfd_level_2_process_3.drawio'), genDfdL2_Proc3(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_dfd_level_2_process_4.drawio'), genDfdL2_Proc4(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_dfd_level_2_process_5.drawio'), genDfdL2_Proc5(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_dfd_level_2_process_6.drawio'), genDfdL2_Proc6(), 'utf8');

console.log('✅ Generated all 6 DFD Level 2 drawio diagrams matching Dr. Olipas standards!');
