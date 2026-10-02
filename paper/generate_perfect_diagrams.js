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
    <mxGraphModel dx="1400" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${content}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. CONTEXT DIAGRAM (Figure 27 Style: 4 Corners, Process 0 Center)
// ══════════════════════════════════════════════════════════════════════════
function generateContextDiagram() {
  let cells = [];
  let id = 2;

  // Process 0 Center Box
  const pX = 540, pY = 360, pW = 320, pH = 160;
  
  cells.push(`        <mxCell id="${id++}" value="0" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=14;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="${pX}" y="${pY}" width="${pW}" height="32" as="geometry" />
        </mxCell>`);
  cells.push(`        <mxCell id="${id++}" value="SRH LINK-TODA System" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=16;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="${pX}" y="${pY + 32}" width="${pW}" height="${pH - 32}" as="geometry" />
        </mxCell>`);

  // 4 Entity Boxes
  const tlX = 50, tlY = 60, tlW = 200, tlH = 110;
  cells.push(`        <mxCell id="${id++}" value="PASSENGER /&#xa;COMMUTER" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${tlX}" y="${tlY}" width="${tlW}" height="${tlH}" as="geometry" />
        </mxCell>`);

  const trX = 1150, trY = 60, trW = 200, trH = 110;
  cells.push(`        <mxCell id="${id++}" value="TRICYCLE DRIVER" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${trX}" y="${trY}" width="${trW}" height="${trH}" as="geometry" />
        </mxCell>`);

  const blX = 50, blY = 700, blW = 200, blH = 110;
  cells.push(`        <mxCell id="${id++}" value="SUPERADMINISTRATOR" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${blX}" y="${blY}" width="${blW}" height="${blH}" as="geometry" />
        </mxCell>`);

  const brX = 1150, brY = 700, brW = 200, brH = 110;
  cells.push(`        <mxCell id="${id++}" value="TODA ADMINISTRATOR&#xa;(TODA OFFICER)" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${brX}" y="${brY}" width="${brW}" height="${brH}" as="geometry" />
        </mxCell>`);

  function addOrthogonalEdge(x1, y1, x2, y2, x3, y3, label) {
    cells.push(`        <mxCell id="${id++}" value="${escapeXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10.5;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${x1}" y="${y1}" as="sourcePoint" />
            <mxPoint x="${x3}" y="${y3}" as="targetPoint" />
            <Array as="points">
              <mxPoint x="${x2}" y="${y2}" />
            </Array>
          </mxGeometry>
        </mxCell>`);
  }

  // Passenger Inputs (Passenger -> Top edge of Process 0)
  const passInputs = [
    'Account & Profile Information',
    'Ride Request & Destination Coordinates',
    'In-App Coordination Messages',
    'Passenger Ratings & Incident Reports',
  ];
  passInputs.forEach((label, idx) => {
    const yOut = tlY + 18 + idx * 22;
    const xTurn = pX + 25 + idx * 26;
    addOrthogonalEdge(tlX + tlW, yOut, xTurn, yOut, xTurn, pY, label);
  });

  // Passenger Outputs (Process 0 Left -> Bottom edge of Passenger)
  const passOutputs = [
    'Account Access Confirmation',
    'Matched Driver & Vehicle Details',
    'Live Driver Geolocation & Route Tracking',
    'Computed Tariff Summary & Electronic Receipt',
    'Incident Status & Resolution Notice',
  ];
  passOutputs.forEach((label, idx) => {
    const yOut = pY + 36 + idx * 24;
    const xTurn = tlX + tlW - 18 - idx * 26;
    addOrthogonalEdge(pX, yOut, xTurn, yOut, xTurn, tlY + tlH, label);
  });

  // Driver Inputs (Driver -> Top edge of Process 0)
  const driverInputs = [
    'Account, License & MTOP Application Files',
    '6-Digit Gmail OTP Verification Code',
    'Terminal Geofence Check-in & Queue Request',
    'Dispatch Response (Accept / Decline)',
    'Live Geolocation Telemetry & Heading Bearing',
    'Trip Completion & Fare Settle Confirmation',
  ];
  driverInputs.forEach((label, idx) => {
    const yOut = trY + 12 + idx * 16;
    const xTurn = pX + pW - 25 - idx * 22;
    addOrthogonalEdge(trX, yOut, xTurn, yOut, xTurn, pY, label);
  });

  // Driver Outputs (Process 0 Right -> Bottom edge of Driver)
  const driverOutputs = [
    'Account Access Confirmation',
    'MTOP Compliance & Verification Status',
    'Real-Time FIFO Queue Position Number',
    'Automated Dispatch Alert & Passenger Details',
    'Turn-by-Turn Pickup & Destination Route',
    'Daily Remittance Ledger & Earnings Ledger',
  ];
  driverOutputs.forEach((label, idx) => {
    const yOut = pY + 30 + idx * 22;
    const xTurn = trX + 18 + idx * 26;
    addOrthogonalEdge(pX + pW, yOut, xTurn, yOut, xTurn, trY + trH, label);
  });

  // SuperAdmin Inputs (SuperAdmin -> Bottom edge of Process 0)
  const superInputs = [
    'System Configuration & Security Parameters',
    'Tariff & Penalty Ordinance Rules',
    'Administrative Account & Role Controls',
    'Association Master Management Directives',
  ];
  superInputs.forEach((label, idx) => {
    const yOut = blY + 18 + idx * 22;
    const xTurn = pX + 25 + idx * 26;
    addOrthogonalEdge(blX + blW, yOut, xTurn, yOut, xTurn, pY + pH, label);
  });

  // SuperAdmin Outputs (Process 0 Left -> Top edge of SuperAdmin)
  const superOutputs = [
    'SuperAdmin Access Confirmation',
    'System Pulse & Financial Analytics',
    'Cross-Association Audit Trail Logs',
    'Database Health & Infrastructure Metrics',
  ];
  superOutputs.forEach((label, idx) => {
    const yOut = pY + pH + 28 + idx * 24;
    const xTurn = blX + blW - 18 - idx * 26;
    addOrthogonalEdge(pX, yOut, xTurn, yOut, xTurn, blY, label);
  });

  // Toda Admin Inputs (Toda Admin -> Bottom edge of Process 0)
  const adminInputs = [
    'Driver MTOP Document Verification Actions',
    'Terminal Dispatch & Queue Override Directives',
    'Incident Dispute Resolution & Sanction Orders',
    'Official TODA Association Announcements',
  ];
  adminInputs.forEach((label, idx) => {
    const yOut = brY + 18 + idx * 22;
    const xTurn = pX + pW - 25 - idx * 26;
    addOrthogonalEdge(brX, yOut, xTurn, yOut, xTurn, pY + pH, label);
  });

  // Toda Admin Outputs (Process 0 Right -> Top edge of Toda Admin)
  const adminOutputs = [
    'Admin Access Confirmation',
    'Pending Driver Applications & Uploaded Files',
    'Live Terminal Queue Status & Driver List',
    'Incident Reports & Passenger Complaints',
    'Daily Remittance Ledger & Association Fee Reports',
  ];
  adminOutputs.forEach((label, idx) => {
    const yOut = pY + pH + 20 + idx * 22;
    const xTurn = brX + 18 + idx * 26;
    addOrthogonalEdge(pX + pW, yOut, xTurn, yOut, xTurn, brY, label);
  });

  return wrapDrawio('Context_Diagram_SRH_LINK_TODA', 1400, 880, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// 2. DFD LEVEL 1 (Figure 28 Breaking Silence Standard: 3 Clear Columns)
// ══════════════════════════════════════════════════════════════════════════
function generateDfdLevel1() {
  let cells = [];
  let id = 2;

  // 3 COLUMNS:
  // Col 1 (Left, x = 60): 4 Entities stacked vertically
  // Col 2 (Center, x = 740): 6 Processes stacked vertically
  // Col 3 (Right, x = 1460): 6 Data Stores stacked vertically

  // 1. Column 1: External Entities
  const entities = [
    { name: 'PASSENGER /&#xa;COMMUTER', y: 80, h: 120 },
    { name: 'TRICYCLE DRIVER', y: 360, h: 120 },
    { name: 'TODA ADMINISTRATOR&#xa;(TODA OFFICER)', y: 660, h: 120 },
    { name: 'SUPERADMINISTRATOR', y: 960, h: 120 },
  ];

  entities.forEach((e) => {
    cells.push(`        <mxCell id="${id++}" value="${e.name}" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="60" y="${e.y}" width="180" height="${e.h}" as="geometry" />
        </mxCell>`);
  });

  // 2. Column 2: Processes (1.0 to 6.0)
  const procs = [
    { num: '1.0', name: 'Manage Authentication&#xa;& User Profiles', y: 80 },
    { num: '2.0', name: 'Verify Driver Credentials&#xa;& Compliance Status', y: 260 },
    { num: '3.0', name: 'Manage Terminal Geofence&#xa;& FIFO Queue', y: 440 },
    { num: '4.0', name: 'Dispatch Ride, Meter Fare&#xa;& Track Route Telemetry', y: 620 },
    { num: '5.0', name: 'Manage Incident Reports&#xa;& Dispute Moderation', y: 800 },
    { num: '6.0', name: 'Manage TODA Remittance,&#xa;Ledger & System Audits', y: 980 },
  ];

  procs.forEach((p) => {
    // Header Compartment
    cells.push(`        <mxCell id="${id++}" value="${p.num}" style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.3;" vertex="1" parent="1">
          <mxGeometry x="740" y="${p.y}" width="260" height="24" as="geometry" />
        </mxCell>`);
    // Body Compartment
    cells.push(`        <mxCell id="${id++}" value="${p.name}" style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11.5;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.3;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="740" y="${p.y + 24}" width="260" height="56" as="geometry" />
        </mxCell>`);
  });

  // 3. Column 3: Data Stores (D1 to D6) - Open-ended Gane-Sarson standard
  const stores = [
    { idTag: 'D1', name: 'User & Profile Records', y: 80 },
    { idTag: 'D2', name: 'Driver & Compliance Records', y: 260 },
    { idTag: 'D3', name: 'Terminal Queue & FIFO Records', y: 440 },
    { idTag: 'D4', name: 'Ride, Route & Telemetry Records', y: 620 },
    { idTag: 'D5', name: 'Incident & Dispute Records', y: 800 },
    { idTag: 'D6', name: 'Remittance & Audit Trail Records', y: 980 },
  ];

  stores.forEach((s) => {
    // Left ID box
    cells.push(`        <mxCell id="${id++}" value="${s.idTag}" style="shape=partialRectangle;top=0;left=0;right=1;bottom=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="1460" y="${s.y + 15}" width="40" height="50" as="geometry" />
        </mxCell>`);
    // Right Name box
    cells.push(`        <mxCell id="${id++}" value="${s.name}" style="shape=partialRectangle;top=0;left=0;right=1;bottom=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=left;spacingLeft=8;" vertex="1" parent="1">
          <mxGeometry x="1500" y="${s.y + 15}" width="200" height="50" as="geometry" />
        </mxCell>`);
  });

  function addLeftBusFlow(x1, y1, xTurn, yTarget, label) {
    cells.push(`        <mxCell id="${id++}" value="${escapeXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${x1}" y="${y1}" as="sourcePoint" />
            <mxPoint x="740" y="${yTarget}" as="targetPoint" />
            <Array as="points">
              <mxPoint x="${xTurn}" y="${y1}" />
              <mxPoint x="${xTurn}" y="${yTarget}" />
            </Array>
          </mxGeometry>
        </mxCell>`);
  }

  function addLeftBusReturnFlow(yProc, xTurn, yEntity, label) {
    cells.push(`        <mxCell id="${id++}" value="${escapeXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="740" y="${yProc}" as="sourcePoint" />
            <mxPoint x="240" y="${yEntity}" as="targetPoint" />
            <Array as="points">
              <mxPoint x="${xTurn}" y="${yProc}" />
              <mxPoint x="${xTurn}" y="${yEntity}" />
            </Array>
          </mxGeometry>
        </mxCell>`);
  }

  function addRightStoreFlow(yProc, xTurn, yStore, label, isRead = false) {
    const startPoint = isRead ? `x="1460" y="${yStore}"` : `x="1000" y="${yProc}"`;
    const targetPoint = isRead ? `x="1000" y="${yProc}"` : `x="1460" y="${yStore}"`;
    const startX = isRead ? 1460 : 1000;
    const startY = isRead ? yStore : yProc;
    const endY = isRead ? yProc : yStore;

    cells.push(`        <mxCell id="${id++}" value="${escapeXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint ${startPoint} as="sourcePoint" />
            <mxPoint ${targetPoint} as="targetPoint" />
            <Array as="points">
              <mxPoint x="${xTurn}" y="${startY}" />
              <mxPoint x="${xTurn}" y="${endY}" />
            </Array>
          </mxGeometry>
        </mxCell>`);
  }

  // ── LEFT BUS CORRIDOR FLOWS (Entities <-> Processes) ──
  // Passenger Flows
  addLeftBusFlow(240, 100, 300, 100, 'Registration & Login Credentials');
  addLeftBusReturnFlow(120, 320, 120, 'Account Access Confirmation');
  addLeftBusFlow(240, 140, 340, 640, 'Ride Request & Lat/Lng Coordinates');
  addLeftBusReturnFlow(660, 360, 160, 'Live Driver Map & Fare Receipt');
  addLeftBusFlow(240, 180, 380, 820, 'Incident Report & Rating Feedback');

  // Driver Flows
  addLeftBusFlow(240, 380, 400, 280, 'License & MTOP Application Files');
  addLeftBusFlow(240, 400, 420, 140, '6-Digit Gmail OTP Code');
  addLeftBusFlow(240, 420, 440, 460, 'GPS Geofence Ping & Queue Request');
  addLeftBusReturnFlow(480, 460, 440, 'Queue Number & Rank Notice');
  addLeftBusFlow(240, 460, 480, 680, 'Dispatch Response & Trip Settle');

  // TODA Admin Flows
  addLeftBusFlow(240, 680, 500, 300, 'Driver Verification Approval/Rejection');
  addLeftBusReturnFlow(320, 520, 700, 'Pending Applicants & File Details');
  addLeftBusFlow(240, 720, 540, 480, 'Terminal Dispatch Override Directives');
  addLeftBusFlow(240, 740, 560, 840, 'Dispute Resolution & Sanction Orders');

  // SuperAdmin Flows
  addLeftBusFlow(240, 980, 580, 160, 'User Role & Access Configuration');
  addLeftBusFlow(240, 1020, 600, 1020, 'Association Remittance Audit Query');
  addLeftBusReturnFlow(1040, 620, 1040, 'Cross-System Analytics & Audit Logs');

  // ── RIGHT BUS CORRIDOR FLOWS (Processes <-> Data Stores) ──
  // 1.0 <-> D1
  addRightStoreFlow(100, 1100, 95, 'Save User Credentials & Role');
  addRightStoreFlow(130, 1120, 125, 'Fetch Account Credentials', true);

  // 2.0 <-> D2
  addRightStoreFlow(280, 1140, 275, 'Store License & MTOP Metadata');
  addRightStoreFlow(310, 1160, 305, 'Query Compliance Status', true);

  // 3.0 <-> D3
  addRightStoreFlow(460, 1180, 455, 'Update FIFO Queue State');
  addRightStoreFlow(490, 1200, 485, 'Read Terminal Active Drivers', true);

  // 4.0 <-> D4
  addRightStoreFlow(640, 1220, 635, 'Record Ride Details & Fare');
  addRightStoreFlow(670, 1240, 665, 'Fetch Live GPS Telemetry', true);

  // 5.0 <-> D5
  addRightStoreFlow(820, 1260, 815, 'Log Incident & Admin Sanction');
  addRightStoreFlow(850, 1280, 845, 'Query Case History', true);

  // 6.0 <-> D6
  addRightStoreFlow(1000, 1300, 995, 'Store Remittance & Audit Trail');
  addRightStoreFlow(1030, 1320, 1025, 'Generate Daily Association Ledger', true);

  return wrapDrawio('DFD_Level_1_SRH_LINK_TODA', 1780, 1180, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// 3. USE CASE DIAGRAM (Clean Actor & System Boundary Layout)
// ══════════════════════════════════════════════════════════════════════════
function generateUseCaseDiagram() {
  let cells = [];
  let id = 2;

  // System Boundary Box
  cells.push(`        <mxCell id="${id++}" value="SRH LINK-TODA System Boundary" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=14;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.8;verticalAlign=top;align=center;spacingTop=12;" vertex="1" parent="1">
          <mxGeometry x="260" y="40" width="760" height="820" as="geometry" />
        </mxCell>`);

  // Actors
  // Left: Passenger
  cells.push(`        <mxCell id="${id++}" value="PASSENGER /&#xa;COMMUTER" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="90" y="240" width="50" height="100" as="geometry" />
        </mxCell>`);
  const aPassId = id - 1;

  // Left-Bottom: Tricycle Driver
  cells.push(`        <mxCell id="${id++}" value="TRICYCLE DRIVER" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="90" y="560" width="50" height="100" as="geometry" />
        </mxCell>`);
  const aDrvId = id - 1;

  // Right-Top: TODA Administrator
  cells.push(`        <mxCell id="${id++}" value="TODA ADMINISTRATOR&#xa;(TODA OFFICER)" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="1140" y="240" width="50" height="100" as="geometry" />
        </mxCell>`);
  const aAdminId = id - 1;

  // Right-Bottom: Superadministrator
  cells.push(`        <mxCell id="${id++}" value="SUPERADMINISTRATOR" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="1140" y="560" width="50" height="100" as="geometry" />
        </mxCell>`);
  const aSuperId = id - 1;

  // Use Cases Inside Boundary
  const useCases = [
    { idTag: 'uc1', name: 'UC01: Register & Authenticate User Account', x: 320, y: 80, w: 260, h: 50 },
    { idTag: 'uc2', name: 'UC02: Verify 6-Digit Gmail OTP Code', x: 680, y: 80, w: 240, h: 50 },
    { idTag: 'uc3', name: 'UC03: Submit MTOP & Driver License Credentials', x: 680, y: 150, w: 250, h: 50 },
    { idTag: 'uc4', name: 'UC04: Review & Moderate Driver Compliance Status', x: 680, y: 220, w: 260, h: 50 },
    { idTag: 'uc5', name: 'UC05: Terminal Geofence Check-in & Join FIFO Queue', x: 320, y: 290, w: 270, h: 50 },
    { idTag: 'uc6', name: 'UC06: Request Tricycle Ride with Drop-Off Pin', x: 320, y: 370, w: 260, h: 50 },
    { idTag: 'uc7', name: 'UC07: Compute Regulated Distance-Tiered Tariff', x: 680, y: 370, w: 250, h: 50 },
    { idTag: 'uc8', name: 'UC08: Automated Dispatch to Front FIFO Driver', x: 680, y: 440, w: 250, h: 50 },
    { idTag: 'uc9', name: 'UC09: Live In-Transit GPS Telemetry & Route Tracking', x: 320, y: 510, w: 280, h: 50 },
    { idTag: 'uc10', name: 'UC10: Complete Trip & Settle Fare Remittance', x: 320, y: 580, w: 260, h: 50 },
    { idTag: 'uc11', name: 'UC11: Submit Incident Report & Commuter Rating', x: 320, y: 650, w: 260, h: 50 },
    { idTag: 'uc12', name: 'UC12: Moderate Incident Disputes & Issue Sanctions', x: 680, y: 650, w: 260, h: 50 },
    { idTag: 'uc13', name: 'UC13: Oversee Master Data & System Audit Logs', x: 500, y: 740, w: 270, h: 50 },
  ];

  const ucMap = {};
  useCases.forEach((uc) => {
    const ucCellId = id++;
    ucMap[uc.idTag] = ucCellId;
    cells.push(`        <mxCell id="${ucCellId}" value="${escapeXml(uc.name)}" style="ellipse;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.3;align=center;" vertex="1" parent="1">
          <mxGeometry x="${uc.x}" y="${uc.y}" width="${uc.w}" height="${uc.h}" as="geometry" />
        </mxCell>`);
  });

  function addActorLink(actorId, ucId) {
    cells.push(`        <mxCell id="${id++}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeColor=#000000;strokeWidth=1.2;" edge="1" parent="1" source="${actorId}" target="${ucId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);
  }

  function addIncludeExtend(sourceId, targetId, stereotype) {
    cells.push(`        <mxCell id="${id++}" value="&lt;&lt;${stereotype}&gt;&gt;" style="edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;dashPattern=4 4;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;endSize=8;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1" source="${sourceId}" target="${targetId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);
  }

  // Actor Associations
  addActorLink(aPassId, ucMap['uc1']);
  addActorLink(aPassId, ucMap['uc6']);
  addActorLink(aPassId, ucMap['uc9']);
  addActorLink(aPassId, ucMap['uc11']);

  addActorLink(aDrvId, ucMap['uc1']);
  addActorLink(aDrvId, ucMap['uc3']);
  addActorLink(aDrvId, ucMap['uc5']);
  addActorLink(aDrvId, ucMap['uc9']);
  addActorLink(aDrvId, ucMap['uc10']);
  addActorLink(aDrvId, ucMap['uc11']);

  addActorLink(aAdminId, ucMap['uc4']);
  addActorLink(aAdminId, ucMap['uc12']);

  addActorLink(aSuperId, ucMap['uc13']);

  // <<extend>> and <<include>>
  addIncludeExtend(ucMap['uc2'], ucMap['uc1'], 'extend');
  addIncludeExtend(ucMap['uc6'], ucMap['uc7'], 'include');
  addIncludeExtend(ucMap['uc6'], ucMap['uc8'], 'include');

  return wrapDrawio('Use_Case_Diagram_SRH_LINK_TODA', 1300, 920, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// 4. ENTITY-RELATIONSHIP DIAGRAM (ERD Crow's Foot Standard)
// ══════════════════════════════════════════════════════════════════════════
function generateErdDiagram() {
  let cells = [];
  let id = 2;

  function createErdTable(title, fields, x, y, width = 240) {
    const tableId = id++;
    const height = 30 + fields.length * 20;
    const bodyHtml = fields.map(f => {
      const type = f.pk ? '<b>PK</b> ' : f.fk ? '<i>FK</i> ' : '';
      return `${type}${f.name}: ${f.type}`;
    }).join('<br/>');

    cells.push(`        <mxCell id="${tableId}" value="&lt;b&gt;${title}&lt;/b&gt;&lt;hr/&gt;${bodyHtml}" style="shape=swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=28;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;fontFamily=Helvetica;fontSize=11;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=left;spacingLeft=8;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />
        </mxCell>`);
    return tableId;
  }

  // 1. USERS
  const tUsers = createErdTable('USERS', [
    { pk: true, name: 'id', type: 'BIGINT UNSIGNED' },
    { name: 'name', type: 'VARCHAR(255)' },
    { name: 'email', type: 'VARCHAR(255) UNIQUE' },
    { name: 'phone_number', type: 'VARCHAR(20) UNIQUE' },
    { name: 'role', type: 'ENUM(passenger, driver, admin)' },
    { name: 'email_verified_at', type: 'TIMESTAMP NULL' },
    { name: 'password', type: 'VARCHAR(255)' },
    { name: 'is_active', type: 'BOOLEAN' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 80, 80, 260);

  // 2. DRIVERS
  const tDrivers = createErdTable('DRIVERS', [
    { pk: true, name: 'id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'user_id', type: 'BIGINT UNSIGNED' },
    { name: 'full_name', type: 'VARCHAR(255)' },
    { name: 'mtop_number', type: 'VARCHAR(20)' },
    { name: 'mtop_certificate_url', type: 'VARCHAR(500)' },
    { name: 'drivers_license_url', type: 'VARCHAR(500)' },
    { name: 'compliance_status', type: 'VARCHAR(20)' },
    { name: 'is_online', type: 'BOOLEAN' },
    { name: 'queue_position', type: 'INT NULL' },
    { name: 'rating', type: 'DECIMAL(3,2)' },
  ], 480, 80, 270);

  // 3. RIDES
  const tRides = createErdTable('RIDES', [
    { pk: true, name: 'id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'passenger_id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'driver_id', type: 'BIGINT UNSIGNED NULL' },
    { name: 'pickup_location', type: 'VARCHAR(255)' },
    { name: 'destination', type: 'VARCHAR(255)' },
    { name: 'pickup_lat', type: 'DECIMAL(10,7)' },
    { name: 'pickup_lng', type: 'DECIMAL(10,7)' },
    { name: 'fare', type: 'DECIMAL(8,2)' },
    { name: 'status', type: 'VARCHAR(30)' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 480, 420, 270);

  // 4. MESSAGES
  const tMessages = createErdTable('MESSAGES', [
    { pk: true, name: 'id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'ride_id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'sender_id', type: 'BIGINT UNSIGNED' },
    { name: 'message', type: 'TEXT' },
    { name: 'is_read', type: 'BOOLEAN' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 80, 420, 260);

  // 5. REPORTS
  const tReports = createErdTable('REPORTS', [
    { pk: true, name: 'id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'reporter_id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'reported_id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'ride_id', type: 'BIGINT UNSIGNED NULL' },
    { name: 'category', type: 'VARCHAR(100)' },
    { name: 'description', type: 'TEXT' },
    { name: 'status', type: 'VARCHAR(30)' },
    { name: 'resolution_notes', type: 'TEXT NULL' },
  ], 890, 420, 260);

  // 6. ACTIVITY_LOGS
  const tLogs = createErdTable('ACTIVITY_LOGS', [
    { pk: true, name: 'id', type: 'BIGINT UNSIGNED' },
    { fk: true, name: 'user_id', type: 'BIGINT UNSIGNED NULL' },
    { name: 'action', type: 'VARCHAR(100)' },
    { name: 'ip_address', type: 'VARCHAR(45)' },
    { name: 'user_agent', type: 'VARCHAR(255)' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 890, 80, 260);

  function addErdRelation(sourceId, targetId) {
    cells.push(`        <mxCell id="${id++}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=ERmany;startArrow=ERone;strokeColor=#000000;strokeWidth=1.3;" edge="1" parent="1" source="${sourceId}" target="${targetId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);
  }

  addErdRelation(tUsers, tDrivers);
  addErdRelation(tUsers, tRides);
  addErdRelation(tDrivers, tRides);
  addErdRelation(tRides, tMessages);
  addErdRelation(tRides, tReports);
  addErdRelation(tUsers, tLogs);

  return wrapDrawio('ERD_SRH_LINK_TODA', 1240, 750, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// 5. CLASS DIAGRAM (UML Standard Clean Layout)
// ══════════════════════════════════════════════════════════════════════════
function generateClassDiagram() {
  let cells = [];
  let id = 2;

  function createUmlClass(title, attributes, methods, x, y, width = 230) {
    const classId = id++;
    const attrHtml = attributes.map(a => `+ ${a}`).join('<br/>');
    const methHtml = methods.map(m => `+ ${m}()`).join('<br/>');
    const height = 30 + attributes.length * 18 + methods.length * 18 + 16;

    cells.push(`        <mxCell id="${classId}" value="&lt;b&gt;${title}&lt;/b&gt;&lt;hr/&gt;${attrHtml}&lt;hr/&gt;${methHtml}" style="shape=swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=28;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;fontFamily=Helvetica;fontSize=10.5;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.4;align=left;spacingLeft=8;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />
        </mxCell>`);
    return classId;
  }

  const cUser = createUmlClass('User', [
    'id: int',
    'name: string',
    'email: string',
    'phoneNumber: string',
    'role: string',
    'emailVerifiedAt: DateTime',
  ], [
    'isVerified(): bool',
    'hasRole(role): bool',
    'driverProfile(): Driver',
  ], 60, 60, 220);

  const cDriver = createUmlClass('Driver', [
    'id: int',
    'userId: int',
    'mtopNumber: string',
    'complianceStatus: string',
    'isOnline: bool',
    'queuePosition: int',
  ], [
    'joinQueue(): void',
    'leaveQueue(): void',
    'updateBearing(heading): void',
  ], 360, 60, 240);

  const cRide = createUmlClass('Ride', [
    'id: int',
    'passengerId: int',
    'driverId: int',
    'pickupLocation: string',
    'destination: string',
    'fare: float',
    'status: string',
  ], [
    'assignDriver(driverId): void',
    'startTransit(): void',
    'completeTrip(): void',
  ], 680, 60, 240);

  const cQueueSvc = createUmlClass('QueueService', [
    'terminalLat: float',
    'terminalLng: float',
    'geofenceRadius: int',
  ], [
    'checkin(driver, lat, lng): bool',
    'getNextDriver(): Driver',
    'reorderQueue(): void',
  ], 360, 420, 240);

  const cFareSvc = createUmlClass('FareCalculatorService', [
    'baseFare: float',
    'perKmRate: float',
    'extraPaxFee: float',
  ], [
    'computeTariff(dist, pax): float',
    'getLandmarkFare(dest): float',
  ], 680, 420, 240);

  const cOtpSvc = createUmlClass('OtpService', [
    'expiryMinutes: int',
  ], [
    'generateAndSend(user): string',
    'verify(user, otp): bool',
  ], 60, 420, 220);

  function addUmlAssociation(sourceId, targetId, label) {
    cells.push(`        <mxCell id="${id++}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;strokeColor=#000000;strokeWidth=1.3;fontFamily=Helvetica;fontSize=10;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="${sourceId}" target="${targetId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);
  }

  addUmlAssociation(cUser, cDriver, '1:1');
  addUmlAssociation(cDriver, cRide, '1:N');
  addUmlAssociation(cDriver, cQueueSvc, 'uses');
  addUmlAssociation(cRide, cFareSvc, 'calculates');
  addUmlAssociation(cUser, cOtpSvc, 'verifies');

  return wrapDrawio('Class_Diagram_SRH_LINK_TODA', 1000, 720, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// 6. CONCEPTUAL FRAMEWORK (IPO Model with Feedback Loop)
// ══════════════════════════════════════════════════════════════════════════
function generateConceptualFramework() {
  let cells = [];
  let id = 2;

  const bW = 340, bH = 520;
  const y = 80;

  // INPUT
  const inHtml = `&lt;b&gt;INPUT&lt;/b&gt;&lt;hr/&gt;
&lt;b&gt;1. Legal &amp; Regulatory Framework:&lt;/b&gt;&lt;br/&gt;
• Republic Act No. 7160 (Local Government Code)&lt;br/&gt;
• Santa Rosa City Ordinance No. 04-2022 (Tricycle Franchising &amp; Tariff Rules)&lt;br/&gt;
• Santa Rosa Homes TODA Association By-Laws&lt;br/&gt;&lt;br/&gt;
&lt;b&gt;2. Stakeholder Requirements:&lt;/b&gt;&lt;br/&gt;
• Commuter Wait Times &amp; Demand Imbalances&lt;br/&gt;
• TODA Driver FIFO Queue Transparency&lt;br/&gt;
• Terminal Remittance &amp; Fee Accounting&lt;br/&gt;&lt;br/&gt;
&lt;b&gt;3. Technical &amp; Infrastructure Baseline:&lt;/b&gt;&lt;br/&gt;
• GPS Mobile Telemetry &amp; MapLibre GL API&lt;br/&gt;
• Laravel 11 Backend &amp; MySQL Database&lt;br/&gt;
• Ionic Angular Mobile Application&lt;br/&gt;
• Pusher / Laravel Reverb WebSocket Protocols`;

  cells.push(`        <mxCell id="${id++}" value="${inHtml}" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11.5;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.6;align=left;spacing=12;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="60" y="${y}" width="${bW}" height="${bH}" as="geometry" />
        </mxCell>`);
  const inBoxId = id - 1;

  // PROCESS
  const procHtml = `&lt;b&gt;PROCESS&lt;/b&gt;&lt;hr/&gt;
&lt;b&gt;1. Software Engineering Methodology:&lt;/b&gt;&lt;br/&gt;
• Agile Scrum Framework (Sprint Planning, Daily Standups, Review, Retrospective)&lt;br/&gt;&lt;br/&gt;
&lt;b&gt;2. System Development Lifecycle:&lt;/b&gt;&lt;br/&gt;
• Requirements Gathering &amp; User Story Mapping&lt;br/&gt;
• System Architecture &amp; Database Schema Design&lt;br/&gt;
• Fullstack Component Implementation&lt;br/&gt;&lt;br/&gt;
&lt;b&gt;3. Core Algorithmic Engines:&lt;/b&gt;&lt;br/&gt;
• Geofenced Proximity Terminal Check-in&lt;br/&gt;
• Automated FIFO Queue State Machine&lt;br/&gt;
• Regulated Multi-Factor Tariff Metering&lt;br/&gt;
• 6-Digit Gmail OTP Identity Verification&lt;br/&gt;&lt;br/&gt;
&lt;b&gt;4. Quality &amp; Security Evaluation:&lt;/b&gt;&lt;br/&gt;
• ISO/IEC 25010 Software Quality Standards&lt;br/&gt;
• Commuter &amp; Driver Acceptance Testing`;

  cells.push(`        <mxCell id="${id++}" value="${procHtml}" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11.5;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.6;align=left;spacing=12;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="460" y="${y}" width="${bW}" height="${bH}" as="geometry" />
        </mxCell>`);
  const procBoxId = id - 1;

  // OUTPUT
  const outHtml = `&lt;b&gt;OUTPUT&lt;/b&gt;&lt;hr/&gt;
&lt;b&gt;SRH LINK-TODA:&lt;/b&gt;&lt;br/&gt;
A Web and Mobile-Based Tricycle Dispatching and Terminal Management System for Santa Rosa Homes TODA.&lt;br/&gt;&lt;br/&gt;
&lt;b&gt;Key System Deliverables:&lt;/b&gt;&lt;br/&gt;
• On-Demand Commuter Ride Dispatching&lt;br/&gt;
• Transparent Geofenced FIFO Queue Engine&lt;br/&gt;
• Live GPS Vehicle Route &amp; Heading Tracking&lt;br/&gt;
• Standardized Ordinance Fare Calculation&lt;br/&gt;
• Driver MTOP Compliance Moderation&lt;br/&gt;
• Digitized Incident Reporting &amp; Dispute Logs&lt;br/&gt;
• Real-Time Financial Remittance Ledger`;

  cells.push(`        <mxCell id="${id++}" value="${outHtml}" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11.5;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.6;align=left;spacing=12;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="860" y="${y}" width="${bW}" height="${bH}" as="geometry" />
        </mxCell>`);
  const outBoxId = id - 1;

  // Forward Arrows (Input -> Process -> Output)
  cells.push(`        <mxCell id="${id++}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=2;" edge="1" parent="1" source="${inBoxId}" target="${procBoxId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);

  cells.push(`        <mxCell id="${id++}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=2;" edge="1" parent="1" source="${procBoxId}" target="${outBoxId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);

  // Feedback Loop
  cells.push(`        <mxCell id="${id++}" value="FEEDBACK LOOP&lt;br/&gt;Continuous User Evaluation, TODA Officer Feedback &amp; System Optimization" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.8;fontFamily=Helvetica;fontSize=11;fontStyle=1;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="${outBoxId}" target="${inBoxId}">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="1030" y="660" />
              <mxPoint x="230" y="660" />
            </Array>
          </mxGeometry>
        </mxCell>`);

  return wrapDrawio('Conceptual_Framework_SRH_LINK_TODA', 1280, 750, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// EXECUTE
// ══════════════════════════════════════════════════════════════════════════
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_context_diagram.drawio'), generateContextDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_data_flow_diagram_level_1.drawio'), generateDfdLevel1(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_use_case_diagram.drawio'), generateUseCaseDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_erd.drawio'), generateErdDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_class_diagram.drawio'), generateClassDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_conceptual_framework.drawio'), generateConceptualFramework(), 'utf8');

console.log('✅ Generated all 6 drawio diagrams matching Breaking Silence 3-column architecture!');
