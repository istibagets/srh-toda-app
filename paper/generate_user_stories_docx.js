const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Let's create a builder for Word document.xml
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

function cellXml(text, width = 1500, align = 'left', bold = false, gridSpan = 1, bg = '') {
    const alignXml = align === 'center' ? '<w:jc w:val="center"/>' : (align === 'right' ? '<w:jc w:val="right"/>' : '<w:jc w:val="left"/>');
    const boldXml = bold ? '<w:b/><w:bCs/>' : '';
    const spanXml = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
    const shdXml = bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>` : '';
    
    // Split text by newlines if any
    const lines = text.split('\n');
    const paragraphs = lines.map(line => `
        <w:p>
            <w:pPr>
                ${alignXml}
                <w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:sz w:val="20"/>
                    <w:szCs w:val="20"/>
                    ${boldXml}
                </w:rPr>
                <w:t xml:space="preserve">${escapeXml(line)}</w:t>
            </w:r>
        </w:p>
    `).join('');

    return `
        <w:tc>
            <w:tcPr>
                <w:tcW w:w="${width}" w:type="dxa"/>
                ${spanXml}
                ${shdXml}
                <w:tcMar>
                    <w:top w:w="120" w:type="dxa"/>
                    <w:left w:w="140" w:type="dxa"/>
                    <w:bottom w:w="120" w:type="dxa"/>
                    <w:right w:w="140" w:type="dxa"/>
                </w:tcMar>
                <w:vAlign w:val="center"/>
            </w:tcPr>
            ${paragraphs}
        </w:tc>
    `;
}

function headerCellXml(text, width = 1500) {
    return cellXml(text, width, 'center', true, 1, 'F2F2F2');
}

function categoryBannerRow(title) {
    return `
        <w:tr>
            <w:trPr>
                <w:cantSplit/>
            </w:trPr>
            ${cellXml(title, 9360, 'left', true, 6, 'EAEAEA')}
        </w:tr>
    `;
}

function dataRow(col1, col2, col3, col4, col5, col6) {
    return `
        <w:tr>
            <w:trPr>
                <w:cantSplit/>
            </w:trPr>
            ${cellXml(col1, 2400, 'left', false)}
            ${cellXml(col2, 1200, 'center', false)}
            ${cellXml(col3, 1900, 'left', false)}
            ${cellXml(col4, 1860, 'left', false)}
            ${cellXml(col5, 1000, 'center', false)}
            ${cellXml(col6, 1000, 'center', false)}
        </w:tr>
    `;
}

const tableData = [
    {
        category: "Authentication, Profile, and Account Access",
        rows: [
            [
                `"As a Passenger, I want to create an account using my mobile phone number and password so that I can immediately access the ride-hailing platform."`,
                `Resident / Passenger`,
                `The system shall provide self-registration and authentication forms for passenger accounts.`,
                `Authentication data shall be encrypted using Bcrypt and authenticated via Sanctum bearer tokens.`,
                `Passenger Registration Form`,
                `Self-Register Passenger Account`
            ],
            [
                `"As a Tricycle Driver, I want to register an account and upload digitized copies of my MTOP certificate and driver's license so that I can apply for terminal queue dispatch."`,
                `Tricycle Driver`,
                `The system shall allow drivers to submit registration data alongside image file uploads.`,
                `Image uploads shall enforce a 2MB file limit and execute secure directory hashing.`,
                `Driver Registration & Upload Screen`,
                `Register & Upload Documents`
            ],
            [
                `"As a TODA Official, I want to review pending driver registrations and inspect uploaded documents so that I can verify compliance before activating accounts."`,
                `TODA Official / Super Admin`,
                `The system shall provide an administrative interface to review pending applications and toggle account approval status.`,
                `Document images shall render clearly and status changes shall execute with real-time audit logging.`,
                `Driver Verification Dashboard`,
                `Review & Verify Driver Applications`
            ]
        ]
    },
    {
        category: "Driver Geolocation and Queue Management",
        rows: [
            [
                `"As a Tricycle Driver, I want to automatically enter the dispatch queue when I arrive within the 35-meter terminal radius so that my arrival is recorded hands-free."`,
                `Tricycle Driver`,
                `The system shall capture coordinates via the HTML5 Geolocation API and trigger an automated queue check-in event.`,
                `Geolocation tracking shall be active-session dependent to conserve battery life and maintain coordinate accuracy.`,
                `Driver Queue Dashboard`,
                `Automated 35m Terminal Geofence Entry`
            ],
            [
                `"As a Tricycle Driver, I want the system to temporarily pause geofence tracking while I am on an active trip so that I am not prematurely re-added to the queue when driving near the terminal."`,
                `Tricycle Driver`,
                `The system shall suspend geofencing entry triggers while a trip session is active.`,
                `The driver shall remain flagged as in-transit to preserve queue state integrity during passenger drop-offs.`,
                `Active Trip Transit Screen`,
                `Active Transit Geofence Deactivation`
            ],
            [
                `"As a Tricycle Driver, I want to manually end my session when going off-duty so that the system halts location tracking."`,
                `Tricycle Driver`,
                `The system shall allow drivers to toggle off-duty status to terminate active sessions.`,
                `Termination shall immediately halt all geolocation API polling to ensure user location privacy.`,
                `Driver On-Duty / Off-Duty Toggle`,
                `End Driver Session`
            ],
            [
                `"As a Tricycle Driver, I want to be immediately restored to the first queue slot if a passenger cancels so that I am not penalized for canceled trips."`,
                `Tricycle Driver`,
                `The system shall execute a Priority-Based Queue Algorithm to reinstate the driver to position one.`,
                `Reinstatement shall execute deterministically via WebSockets with millisecond-level responsiveness.`,
                `Driver Notification Panel`,
                `Queue Recovery Execution`
            ],
            [
                `"As a Tricycle Driver, I want to receive real-time dispatch alerts with sound and visual prompts so that I know when it is my turn to accept a passenger."`,
                `Tricycle Driver`,
                `The system shall push real-time dispatch prompts to the next compliant driver in the FIFO sequence.`,
                `Notifications shall deliver asynchronously with an audio chime and a 30-second response timeout.`,
                `Incoming Dispatch Dialog`,
                `Receive Dispatch Alert`
            ],
            [
                `"As a Tricycle Driver, I want to record terminal walk-in passengers directly so that offline passenger boardings are logged in the queue sequence."`,
                `Tricycle Driver`,
                `The system shall allow drivers to initiate a walk-in ride directly from the terminal interface.`,
                `Initiating a walk-in trip shall immediately update the terminal queue count and mark the driver in-transit.`,
                `Walk-In Ride Action Button`,
                `Log Terminal Walk-In Ride`
            ],
            [
                `"As a Tricycle Driver, I want to log completed trips, drop-off locations, and collected fares so that I can track my daily productivity and earnings."`,
                `Tricycle Driver`,
                `The system shall allow drivers to record trip completion and compute cumulative cash earnings.`,
                `Trip records and fare aggregates shall be stored securely and remain accessible offline.`,
                `Trip Completion Modal & Earnings Portal`,
                `Log Completed Ride & View Earnings`
            ]
        ]
    },
    {
        category: "Passenger Ride Hailing and Real-Time Tracking",
        rows: [
            [
                `"As a Passenger, I want to request a tricycle by specifying my Block and Lot pickup address so that an assigned driver picks me up at my doorstep."`,
                `Resident / Passenger`,
                `The system shall allow passengers to submit ride requests with validated pickup addresses within the subdivision.`,
                `Ride requests shall be processed asynchronously and assigned to the current Next-in-Line driver.`,
                `Passenger Ride Booking Drawer`,
                `Request Subdivision Ride`
            ],
            [
                `"As a Passenger, I want to bookmark frequently used locations such as my Home Block and Lot or the Main Gate so that I can book rides with a single tap."`,
                `Resident / Passenger`,
                `The system shall provide saved location management allowing users to store custom pickup points.`,
                `Saved addresses shall be cached locally in browser storage and synchronized with user account records.`,
                `Saved Locations Bookmarking Screen`,
                `Save & Select Custom Address`
            ],
            [
                `"As a Passenger, I want to view the live terminal queue count and an interactive map so that I know tricycle availability and reduce waiting anxiety."`,
                `Resident / Passenger`,
                `The system shall broadcast real-time queue counts and driver positions to the passenger interface.`,
                `Map rendering shall utilize hardware-accelerated MapLibre GL vector tiles with low data latency.`,
                `Passenger Home & Map Viewport`,
                `Track Terminal Queue & Vehicle Status`
            ],
            [
                `"As a Passenger, I want to see the fare calculated automatically from the official TODA matrix with custom fare proposals for special trips so that pricing is transparent."`,
                `Resident / Passenger`,
                `The system shall calculate standard route fares dynamically and allow custom fare proposals for negotiated out-of-subdivision trips.`,
                `Fare calculations shall conform to the TODA fare matrix and present itemized breakdowns.`,
                `Fare Breakdown & Proposal Modal`,
                `Review & Confirm Ride Fare`
            ],
            [
                `"As a Passenger, I want to cancel my ride request if plans change so that the driver is freed and restored to the queue."`,
                `Resident / Passenger`,
                `The system shall provide a ride cancellation protocol that alerts the assigned driver.`,
                `Cancellation shall execute in real-time and immediately trigger the driver priority recovery logic.`,
                `Ride Cancellation Button`,
                `Cancel Active Ride Request`
            ]
        ]
    },
    {
        category: "Administrative Governance and Compliance",
        rows: [
            [
                `"As a TODA Official, I want to monitor MTOP validity and driver licenses so that only authorized and compliant drivers can enter the dispatch queue."`,
                `TODA Official / Super Admin`,
                `The system shall enforce document compliance verification before granting queue access.`,
                `Compliance status shall act as a strict boolean gatekeeper preventing non-compliant drivers from going on-duty.`,
                `Admin Compliance Table`,
                `Enforce Driver Compliance Verification`
            ],
            [
                `"As a TODA Official, I want to record daily driver contribution fees digitally so that paper logbooks are replaced with transparent financial records."`,
                `TODA Official`,
                `The system shall provide modules to log and audit daily driver membership dues and cash collections.`,
                `Financial ledgers shall automatically compute daily, weekly, and monthly totals with downloadable PDF receipts.`,
                `Contribution Fee Management Module`,
                `Track & Log Daily Contribution Fees`
            ],
            [
                `"As a TODA Official, I want to manually override the dispatch queue so that I can resolve real-world disruptions like flat tires or emergency re-orderings."`,
                `TODA Official`,
                `The system shall provide administrative controls to reorder queue slots manually.`,
                `Queue modifications shall be broadcast instantly to all connected mobile clients with full audit logging.`,
                `Live Queue Manual Override Panel`,
                `Execute Manual Queue Override`
            ],
            [
                `"As a TODA Official, I want to broadcast community and emergency announcements so that important traffic or weather notices reach all users instantly."`,
                `TODA Official`,
                `The system shall push administrative announcement banners to passenger and driver interfaces.`,
                `Announcements shall deliver over WebSockets and display persistently until dismissed by the user.`,
                `Emergency Broadcast Control Tool`,
                `Publish Community Announcement`
            ],
            [
                `"As a Super Admin, I want to configure the terminal GPS coordinates and geofence radius dynamically so that parameters update without code redeployment."`,
                `Super Admin`,
                `The system shall provide a configuration panel to adjust terminal geographic parameters.`,
                `Parameter updates shall persist in the database and immediately update server-side distance calculations.`,
                `Super Admin Configuration Panel`,
                `Configure Dynamic System Parameters`
            ]
        ]
    },
    {
        category: "System Accessibility, Security, and Offline Resilience",
        rows: [
            [
                `"As a User, I want to access the platform via my mobile browser without downloading a large app store file so that my phone storage is preserved."`,
                `All Users`,
                `The system shall be engineered and delivered as an installable Progressive Web Application.`,
                `The platform shall function universally across standard modern web browsers without app store dependency.`,
                `Web Browser Interface`,
                `Access Platform as PWA`
            ],
            [
                `"As a User, I want the application interface to remain functional during brief cellular data drops so that active sessions and queue records are preserved."`,
                `All Users`,
                `The system shall implement Service Workers and client caching to support offline UI resilience.`,
                `Cached assets shall load instantaneously and active states shall synchronize upon network reconnection.`,
                `PWA Offline Mode & Sync Handler`,
                `Maintain Session Across Network Drops`
            ]
        ]
    }
];

let tableRowsXml = `
    <w:tr>
        <w:trPr>
            <w:tblHeader/>
            <w:cantSplit/>
        </w:trPr>
        ${headerCellXml('User Stories', 2400)}
        ${headerCellXml('Actor(s)', 1200)}
        ${headerCellXml('Functional Requirement', 1900)}
        ${headerCellXml('Non-Functional Requirement', 1860)}
        ${headerCellXml('Needed UI', 1000)}
        ${headerCellXml('Scenario', 1000)}
    </w:tr>
`;

for (const cat of tableData) {
    tableRowsXml += categoryBannerRow(cat.category);
    for (const r of cat.rows) {
        tableRowsXml += dataRow(r[0], r[1], r[2], r[3], r[4], r[5]);
    }
}

const tableXml = `
    <w:tbl>
        <w:tblPr>
            <w:tblW w:w="9360" w:type="dxa"/>
            <w:jc w:val="center"/>
            <w:tblBorders>
                <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                <w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                <w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                <w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            </w:tblBorders>
            <w:tblCellMar>
                <w:top w:w="120" w:type="dxa"/>
                <w:left w:w="140" w:type="dxa"/>
                <w:bottom w:w="120" w:type="dxa"/>
                <w:right w:w="140" w:type="dxa"/>
            </w:tblCellMar>
        </w:tblPr>
        <w:tblGrid>
            <w:gridCol w:w="2400"/>
            <w:gridCol w:w="1200"/>
            <w:gridCol w:w="1900"/>
            <w:gridCol w:w="1860"/>
            <w:gridCol w:w="1000"/>
            <w:gridCol w:w="1000"/>
        </w:tblGrid>
        ${tableRowsXml}
    </w:tbl>
`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" 
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" 
            xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" 
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" 
            xmlns:v="urn:schemas-microsoft-com:vml" 
            xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" 
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" 
            xmlns:w10="urn:schemas-microsoft-com:office:word" 
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" 
            xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" 
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" 
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" 
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" 
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" 
            mc:Ignorable="w14 w15 wp14">
    <w:body>
        <!-- Heading 1.1 Plan -->
        <w:p>
            <w:pPr>
                <w:pStyle w:val="Heading2"/>
                <w:spacing w:before="240" w:after="120"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:b/>
                    <w:bCs/>
                    <w:sz w:val="24"/>
                    <w:szCs w:val="24"/>
                </w:rPr>
                <w:t>1.1 Plan</w:t>
            </w:r>
        </w:p>

        <!-- Paragraph 1 -->
        <w:p>
            <w:pPr>
                <w:ind w:firstLine="720"/>
                <w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/>
                <w:jc w:val="both"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:sz w:val="24"/>
                    <w:szCs w:val="24"/>
                </w:rPr>
                <w:t>During the Plan phase, requirements elicitation was conducted with transport stakeholders, including TODA administrative officers, registered tricycle drivers, and community residents of the Santa Rosa Homes subdivision. Consultative interviews and on-site terminal workflow observations were carried out to identify the operational pain points of the existing manual dispatching system, specifically the communication bottlenecks of the single keypad phone, the lack of terminal queue visibility for commuters, and the opacity of handwritten contribution ledgers.</w:t>
            </w:r>
        </w:p>

        <!-- Paragraph 2 -->
        <w:p>
            <w:pPr>
                <w:ind w:firstLine="720"/>
                <w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/>
                <w:jc w:val="both"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:sz w:val="24"/>
                    <w:szCs w:val="24"/>
                </w:rPr>
                <w:t>To operationalize the identified needs, the researchers formulated user stories and corresponding functional and non-functional requirements for the major system roles and workflows. The requirements were grouped according to authentication and account access, driver geolocation and queue management, passenger ride hailing and tracking, administrative governance and compliance, and system accessibility, security, and offline resilience. Each user story identified the intended actor, expected system behavior, quality or security consideration, required interface, and related scenario. Table 12 presents the consolidated planning requirements that guided the succeeding design and development activities.</w:t>
            </w:r>
        </w:p>

        <!-- Table Label (APA Format) -->
        <w:p>
            <w:pPr>
                <w:spacing w:before="180" w:after="60"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:b/>
                    <w:bCs/>
                    <w:sz w:val="24"/>
                    <w:szCs w:val="24"/>
                </w:rPr>
                <w:t>Table 12</w:t>
            </w:r>
        </w:p>
        <w:p>
            <w:pPr>
                <w:spacing w:before="0" w:after="120"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:i/>
                    <w:iCs/>
                    <w:sz w:val="24"/>
                    <w:szCs w:val="24"/>
                </w:rPr>
                <w:t>User Stories, Functional Requirements, and Non-Functional Requirements of SRH LINK-TODA</w:t>
            </w:r>
        </w:p>

        <!-- TABLE INSERTION -->
        ${tableXml}

        <!-- Table Note -->
        <w:p>
            <w:pPr>
                <w:spacing w:before="120" w:after="240"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:i/>
                    <w:iCs/>
                    <w:sz w:val="20"/>
                    <w:szCs w:val="20"/>
                </w:rPr>
                <w:t>Note.</w:t>
            </w:r>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:sz w:val="20"/>
                    <w:szCs w:val="20"/>
                </w:rPr>
                <w:t xml:space="preserve"> Requirements and user stories structured according to the NEUST CICT software development standard.</w:t>
            </w:r>
        </w:p>

        <!-- Concluding Paragraph of 1.1 -->
        <w:p>
            <w:pPr>
                <w:ind w:firstLine="720"/>
                <w:spacing w:before="0" w:after="240" w:line="360" w:lineRule="auto"/>
                <w:jc w:val="both"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                    <w:sz w:val="24"/>
                    <w:szCs w:val="24"/>
                </w:rPr>
                <w:t>The user stories established in Table 12 served as the definitive functional benchmark for the subsequent design, implementation, and testing phases of the SRH LINK-TODA system.</w:t>
            </w:r>
        </w:p>

        <w:sectPr>
            <w:pgSz w:w="12240" w:h="15840"/>
            <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/>
        </w:sectPr>
    </w:body>
</w:document>
`;

// Base docx template to pack into
const baseDir = path.resolve('paper/_temp_userstories_gen');
if (fs.existsSync(baseDir)) fs.rmSync(baseDir, { recursive: true, force: true });
fs.mkdirSync(baseDir, { recursive: true });

// Copy UserStories.docx contents to baseDir
const srcDocx = path.resolve('paper/UserStories.docx');
execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${srcDocx.replace(/\\/g, '\\\\')}', '${baseDir.replace(/\\/g, '\\\\')}')"`);

// Overwrite word/document.xml with our newly built documentXml
fs.writeFileSync(path.join(baseDir, 'word', 'document.xml'), documentXml, 'utf8');

// Repack into paper/SRH_LINK_TODA_User_Stories_Table.docx
const destDocx = path.resolve('paper/SRH_LINK_TODA_User_Stories_Table.docx');
if (fs.existsSync(destDocx)) fs.unlinkSync(destDocx);

execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${baseDir.replace(/\\/g, '\\\\')}', '${destDocx.replace(/\\/g, '\\\\')}')"`);

console.log('Successfully generated:', destDocx);
