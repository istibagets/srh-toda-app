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

// ══════════════════════════════════════════════════════════════════════════
// 1. CONTEXT DIAGRAM (Figure 27 style from Breaking Silence)
// ══════════════════════════════════════════════════════════════════════════
function generateContextDiagram() {
  let cells = [];
  let id = 2;

  // Process 0 Center Box
  const pX = 520, pY = 360, pW = 320, pH = 160;
  
  // Header Badge (0)
  cells.push(`        <mxCell id="${id++}" value="0" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=14;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="${pX}" y="${pY}" width="${pW}" height="32" as="geometry" />
        </mxCell>`);
  // Main Body (SRH LINK-TODA System)
  cells.push(`        <mxCell id="${id++}" value="SRH LINK-TODA System" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=16;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="${pX}" y="${pY + 32}" width="${pW}" height="${pH - 32}" as="geometry" />
        </mxCell>`);

  // Entity Boxes
  // 1. Top-Left: PASSENGER / COMMUTER
  const tlX = 50, tlY = 60, tlW = 200, tlH = 110;
  cells.push(`        <mxCell id="${id++}" value="PASSENGER /&#xa;COMMUTER" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${tlX}" y="${tlY}" width="${tlW}" height="${tlH}" as="geometry" />
        </mxCell>`);

  // 2. Top-Right: TRICYCLE DRIVER
  const trX = 1110, trY = 60, trW = 200, trH = 110;
  cells.push(`        <mxCell id="${id++}" value="TRICYCLE DRIVER" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${trX}" y="${trY}" width="${trW}" height="${trH}" as="geometry" />
        </mxCell>`);

  // 3. Bottom-Left: SUPERADMINISTRATOR
  const blX = 50, blY = 700, blW = 200, blH = 110;
  cells.push(`        <mxCell id="${id++}" value="SUPERADMINISTRATOR" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${blX}" y="${blY}" width="${blW}" height="${blH}" as="geometry" />
        </mxCell>`);

  // 4. Bottom-Right: TODA ADMINISTRATOR
  const brX = 1110, brY = 700, brW = 200, brH = 110;
  cells.push(`        <mxCell id="${id++}" value="TODA ADMINISTRATOR&#xa;(TODA OFFICER)" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=13;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
          <mxGeometry x="${brX}" y="${brY}" width="${brW}" height="${brH}" as="geometry" />
        </mxCell>`);

  function addOrthogonalEdge(x1, y1, x2, y2, x3, y3, label, labelAlign = 'center') {
    const edgeId = id++;
    cells.push(`        <mxCell id="${edgeId}" value="${escapeXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10.5;fontColor=#000000;labelBackgroundColor=#ffffff;labelBorderColor=none;align=${labelAlign};" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${x1}" y="${y1}" as="sourcePoint" />
            <mxPoint x="${x3}" y="${y3}" as="targetPoint" />
            <Array as="points">
              <mxPoint x="${x2}" y="${y2}" />
            </Array>
          </mxGeometry>
        </mxCell>`);
  }

  // ── TOP-LEFT: PASSENGER FLOWS ──
  // Inputs: Passenger -> Process 0 (Exit right edge of Passenger, turn down into top edge of Process 0)
  const passInputs = [
    'Account & Profile Information',
    'Ride Request & Destination Coordinates',
    'In-App Coordination Messages',
    'Passenger Ratings & Incident Reports',
  ];
  passInputs.forEach((label, idx) => {
    const yOut = tlY + 20 + idx * 22; // 80, 102, 124, 146
    const xTurn = pX + 25 + idx * 24; // 545, 569, 593, 617
    addOrthogonalEdge(tlX + tlW, yOut, xTurn, yOut, xTurn, pY, label, 'center');
  });

  // Outputs: Process 0 -> Passenger (Exit left edge of Process 0, turn up into bottom edge of Passenger)
  const passOutputs = [
    'Account Access Confirmation',
    'Matched Driver & Vehicle Details',
    'Live Driver Geolocation & Route Tracking',
    'Computed Tariff Summary & Electronic Receipt',
    'Incident Status & Resolution Notice',
  ];
  passOutputs.forEach((label, idx) => {
    const yOut = pY + 40 + idx * 24; // 400, 424, 448, 472, 496
    const xTurn = tlX + tlW - 20 - idx * 26; // 230, 204, 178, 152, 126
    addOrthogonalEdge(pX, yOut, xTurn, yOut, xTurn, tlY + tlH, label, 'center');
  });

  // ── TOP-RIGHT: TRICYCLE DRIVER FLOWS ──
  // Inputs: Driver -> Process 0 (Exit left edge of Driver, turn down into top edge of Process 0)
  const driverInputs = [
    'Account, License & MTOP Application Files',
    '6-Digit Gmail OTP Verification Code',
    'Terminal Geofence Check-in & Queue Request',
    'Dispatch Response (Accept / Decline)',
    'Live Geolocation Telemetry & Heading Bearing',
    'Trip Completion & Fare Settle Confirmation',
  ];
  driverInputs.forEach((label, idx) => {
    const yOut = trY + 14 + idx * 16; // 74, 90, 106, 122, 138, 154
    const xTurn = pX + pW - 25 - idx * 20; // 815, 795, 775, 755, 735, 715
    addOrthogonalEdge(trX, yOut, xTurn, yOut, xTurn, pY, label, 'center');
  });

  // Outputs: Process 0 -> Driver (Exit right edge of Process 0, turn up into bottom edge of Driver)
  const driverOutputs = [
    'Account Access Confirmation',
    'MTOP Compliance & Verification Status',
    'Real-Time FIFO Queue Position Number',
    'Automated Dispatch Alert & Passenger Details',
    'Turn-by-Turn Pickup & Destination Route',
    'Daily Remittance Ledger & Earnings Ledger',
  ];
  driverOutputs.forEach((label, idx) => {
    const yOut = pY + 32 + idx * 22; // 392, 414, 436, 458, 480, 502
    const xTurn = trX + 20 + idx * 26; // 1130, 1156, 1182, 1208, 1234, 1260
    addOrthogonalEdge(pX + pW, yOut, xTurn, yOut, xTurn, trY + trH, label, 'center');
  });

  // ── BOTTOM-LEFT: SUPERADMINISTRATOR FLOWS ──
  // Inputs: SuperAdmin -> Process 0 (Exit right edge of SuperAdmin, turn up into bottom edge of Process 0)
  const superInputs = [
    'System Configuration & Security Parameters',
    'Tariff & Penalty Ordinance Rules',
    'Administrative Account & Role Controls',
    'Association Master Management Directives',
  ];
  superInputs.forEach((label, idx) => {
    const yOut = blY + 20 + idx * 22; // 720, 742, 764, 786
    const xTurn = pX + 25 + idx * 24; // 545, 569, 593, 617
    addOrthogonalEdge(blX + blW, yOut, xTurn, yOut, xTurn, pY + pH, label, 'center');
  });

  // Outputs: Process 0 -> SuperAdmin (Exit left edge of Process 0, turn down into top edge of SuperAdmin)
  const superOutputs = [
    'SuperAdmin Access Confirmation',
    'System Pulse & Financial Analytics',
    'Cross-Association Audit Trail Logs',
    'Database Health & Infrastructure Metrics',
  ];
  superOutputs.forEach((label, idx) => {
    const yOut = pY + pH + 30 + idx * 24; // 550, 574, 598, 622
    const xTurn = blX + blW - 20 - idx * 26; // 230, 204, 178, 152
    addOrthogonalEdge(pX, yOut, xTurn, yOut, xTurn, blY, label, 'center');
  });

  // ── BOTTOM-RIGHT: TODA ADMINISTRATOR FLOWS ──
  // Inputs: Toda Admin -> Process 0 (Exit left edge of Toda Admin, turn up into bottom edge of Process 0)
  const adminInputs = [
    'Driver MTOP Document Verification Actions',
    'Terminal Dispatch & Queue Override Directives',
    'Incident Dispute Resolution & Sanction Orders',
    'Official TODA Association Announcements',
  ];
  adminInputs.forEach((label, idx) => {
    const yOut = brY + 20 + idx * 22; // 720, 742, 764, 786
    const xTurn = pX + pW - 25 - idx * 24; // 815, 791, 767, 743
    addOrthogonalEdge(brX, yOut, xTurn, yOut, xTurn, pY + pH, label, 'center');
  });

  // Outputs: Process 0 -> Toda Admin (Exit right edge of Process 0, turn down into top edge of Toda Admin)
  const adminOutputs = [
    'Admin Access Confirmation',
    'Pending Driver Applications & Uploaded Files',
    'Live Terminal Queue Status & Driver List',
    'Incident Reports & Passenger Complaints',
    'Daily Remittance Ledger & Association Fee Reports',
  ];
  adminOutputs.forEach((label, idx) => {
    const yOut = pY + pH + 20 + idx * 22; // 540, 562, 584, 606, 628
    const xTurn = brX + 20 + idx * 26; // 1130, 1156, 1182, 1208, 1234
    addOrthogonalEdge(pX + pW, yOut, xTurn, yOut, xTurn, brY, label, 'center');
  });

  return wrapDrawio('Context_Diagram_SRH_LINK_TODA', 1380, 880, cells.join('\n'));
}

// ══════════════════════════════════════════════════════════════════════════
// 2. DATA FLOW DIAGRAM LEVEL 1 (Clean Gane-Sarson with Non-Crossing Routes)
// ══════════════════════════════════════════════════════════════════════════
function generateDfdLevel1() {
  let cells = [];
  let id = 2;

  // External Entities (Top and Bottom)
  // Left: Passenger
  cells.push(`        <mxCell id="${id++}" value="PASSENGER /&#xa;COMMUTER" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="40" y="240" width="160" height="90" as="geometry" />
        </mxCell>`);
  // Top: Tricycle Driver
  cells.push(`        <mxCell id="${id++}" value="TRICYCLE DRIVER" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="40" y="520" width="160" height="90" as="geometry" />
        </mxCell>`);
  // Right Top: TODA Administrator
  cells.push(`        <mxCell id="${id++}" value="TODA ADMINISTRATOR&#xa;(TODA OFFICER)" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="1160" y="240" width="170" height="90" as="geometry" />
        </mxCell>`);
  // Right Bottom: Superadministrator
  cells.push(`        <mxCell id="${id++}" value="SUPERADMINISTRATOR" style="rounded=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=12;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="1">
          <mxGeometry x="1160" y="520" width="170" height="90" as="geometry" />
        </mxCell>`);

  // 6 Processes (Gane-Sarson Rounded Double Rectangles)
  const procs = [
    { num: '1.0', name: 'User Authentication &&#xa;Profile Management', x: 280, y: 80 },
    { num: '2.0', name: 'Driver Credential Verification&#xa;& Compliance Moderation', x: 740, y: 80 },
    { num: '3.0', name: 'Terminal Geofencing &&#xa;FIFO Queue Dispatch', x: 280, y: 380 },
    { num: '4.0', name: 'Ride Booking, Fare Metering&#xa;& Live GPS Telemetry', x: 740, y: 380 },
    { num: '5.0', name: 'Incident Reporting &&#xa;Dispute Resolution', x: 280, y: 680 },
    { num: '6.0', name: 'TODA Financial Remittance&#xa;& Audit Analytics', x: 740, y: 680 },
  ];

  procs.forEach((p) => {
    // Header
    cells.push(`        <mxCell id="${id++}" value="${p.num}" style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.2;" vertex="1" parent="1">
            <mxGeometry x="${p.x}" y="${p.y}" width="220" height="24" as="geometry" />
          </mxCell>`);
    // Body
    cells.push(`        <mxCell id="${id++}" value="${p.name}" style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=11.5;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.2;verticalAlign=middle;" vertex="1" parent="1">
            <mxGeometry x="${p.x}" y="${p.y + 24}" width="220" height="56" as="geometry" />
          </mxCell>`);
  });

  // Data Stores (D1 to D6) in center column
  const stores = [
    { idTag: 'D1', name: 'Users & Auth Store', x: 530, y: 80 },
    { idTag: 'D2', name: 'Driver Documents & Compliance Store', x: 530, y: 180 },
    { idTag: 'D3', name: 'Terminal Queue & FIFO State Store', x: 530, y: 380 },
    { idTag: 'D4', name: 'Rides, Telemetry & Metering Store', x: 530, y: 480 },
    { idTag: 'D5', name: 'Incident Reports & Sanctions Store', x: 530, y: 680 },
    { idTag: 'D6', name: 'Remittance Ledger & Audit Logs Store', x: 530, y: 780 },
  ];

  stores.forEach((s) => {
    cells.push(`        <mxCell id="${id++}" value="${s.idTag} | ${s.name}" style="shape=partialRectangle;top=0;left=0;right=1;bottom=0;whiteSpace=wrap;html=1;fontFamily=Helvetica;fontSize=10.5;fontStyle=1;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;align=center;" vertex="1" parent="1">
            <mxGeometry x="${s.x}" y="${s.y}" width="180" height="40" as="geometry" />
          </mxCell>`);
  });

  function addDfdFlow(x1, y1, x2, y2, label) {
    cells.push(`        <mxCell id="${id++}" value="${escapeXml(label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${x1}" y="${y1}" as="sourcePoint" />
            <mxPoint x="${x2}" y="${y2}" as="targetPoint" />
          </mxGeometry>
        </mxCell>`);
  }

  // Key Orthogonal Non-Colliding Flows
  addDfdFlow(200, 260, 280, 120, 'Credentials & Reg Info');
  addDfdFlow(280, 140, 200, 280, 'Auth Token & Profile');
  addDfdFlow(500, 120, 530, 100, 'Store User Record');

  addDfdFlow(200, 540, 280, 420, 'GPS Coords & Check-in');
  addDfdFlow(280, 440, 200, 560, 'Queue Number & Rank');
  addDfdFlow(500, 420, 530, 400, 'Update Queue Order');

  addDfdFlow(200, 300, 740, 420, 'Ride Request & Lat/Lng');
  addDfdFlow(740, 440, 200, 580, 'Dispatch Alert to Front Driver');
  addDfdFlow(740, 460, 200, 320, 'Trip Status & Live Driver Map');

  addDfdFlow(1160, 260, 960, 120, 'Review MTOP Documents');
  addDfdFlow(960, 140, 1160, 280, 'Driver Compliance Status');

  addDfdFlow(1160, 300, 500, 720, 'Resolve Incident & Issue Order');
  addDfdFlow(1160, 560, 960, 720, 'Audit Queries & Ledger Review');

  return wrapDrawio('DFD_Level_1_SRH_LINK_TODA', 1400, 880, cells.join('\n'));
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
    cells.push(`        <mxCell id="${id++}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeColor=#000000;strokeWidth=1.2;" edge="1" parent="1" source="${actorId}" target="${ucId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);
  }

  function addIncludeExtend(sourceId, targetId, stereotype) {
    cells.push(`        <mxCell id="${id++}" value="&lt;&lt;${stereotype}&gt;&gt;" style="edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;dashPattern=4 4;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;endSize=8;strokeColor=#000000;strokeWidth=1.2;fontFamily=Helvetica;fontSize=10;fontColor=#000000;labelBackgroundColor=#ffffff;align=center;" edge="1" parent="1" source="${sourceId}" target="${targetId}">
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

  function addErdRelation(sourceId, targetId, startLabel, endLabel) {
    cells.push(`        <mxCell id="${id++}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=ERmany;startArrow=ERone;strokeColor=#000000;strokeWidth=1.3;" edge="1" parent="1" source="${sourceId}" target="${targetId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);
  }

  addErdRelation(tUsers, tDrivers, '1', '0..1');
  addErdRelation(tUsers, tRides, '1', '0..N');
  addErdRelation(tDrivers, tRides, '1', '0..N');
  addErdRelation(tRides, tMessages, '1', '0..N');
  addErdRelation(tRides, tReports, '1', '0..1');
  addErdRelation(tUsers, tLogs, '1', '0..N');

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
    cells.push(`        <mxCell id="${id++}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;strokeColor=#000000;strokeWidth=1.3;fontFamily=Helvetica;fontSize=10;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="${sourceId}" target="${targetId}">
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

  // 3 Boxes: INPUT - PROCESS - OUTPUT
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
  cells.push(`        <mxCell id="${id++}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=2;" edge="1" parent="1" source="${inBoxId}" target="${procBoxId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);

  cells.push(`        <mxCell id="${id++}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=2;" edge="1" parent="1" source="${procBoxId}" target="${outBoxId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`);

  // Feedback Loop (Output -> Input/Process at bottom)
  cells.push(`        <mxCell id="${id++}" value="FEEDBACK LOOP&lt;br/&gt;Continuous User Evaluation, TODA Officer Feedback &amp; System Optimization" style="edgeStyle=orthogonalEdgeStyle;rounded=0;jumpStyle=arc;jumpSize=6;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#000000;strokeWidth=1.8;fontFamily=Helvetica;fontSize=11;fontStyle=1;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="${outBoxId}" target="${inBoxId}">
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
// WRITE ALL 6 FILES
// ══════════════════════════════════════════════════════════════════════════
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_context_diagram.drawio'), generateContextDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_data_flow_diagram_level_1.drawio'), generateDfdLevel1(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_use_case_diagram.drawio'), generateUseCaseDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_erd.drawio'), generateErdDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_class_diagram.drawio'), generateClassDiagram(), 'utf8');
fs.writeFileSync(path.join(diagramsDir, 'srh_link_toda_conceptual_framework.drawio'), generateConceptualFramework(), 'utf8');

console.log('✅ Successfully generated all 6 Draw.io diagrams in diagrams/ folder matching Breaking Silence standard!');
