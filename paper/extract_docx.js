const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Let's use PowerShell to extract archive to a temp folder
const docxPath = path.resolve('paper/latest 8;25.docx');
const tempDir = path.resolve('paper/_temp_latest');

if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${docxPath.replace(/\\/g, '\\\\')}', '${tempDir.replace(/\\/g, '\\\\')}')"`);

const docXmlPath = path.join(tempDir, 'word', 'document.xml');
if (fs.existsSync(docXmlPath)) {
    const xml = fs.readFileSync(docXmlPath, 'utf8');
    
    // Simple XML parser to get text per paragraph
    // Replace <w:p> tags with newline
    // Extract text from <w:t> tags
    const paragraphs = [];
    const pMatches = xml.split(/<\/w:p>/);
    for (const p of pMatches) {
        const textMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
        if (textMatches) {
            const line = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join('');
            paragraphs.push(line);
        } else {
            // Check if empty paragraph or break
            if (p.includes('<w:pPr>') || p.includes('<w:r>')) {
                // blank line
            }
        }
    }
    
    const textOutput = paragraphs.join('\n');
    fs.writeFileSync(path.resolve('paper/latest_extracted_text.txt'), textOutput, 'utf8');
    console.log('Saved latest_extracted_text.txt with', paragraphs.length, 'paragraphs.');
} else {
    console.error('document.xml not found');
}
