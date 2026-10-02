const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const docxPath = path.resolve('paper/SRH_LINK_TODA_Manuscript_Chapters_1_to_4.docx');
const tempDir = path.resolve('paper/_temp_ch1_to_4');

if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${docxPath.replace(/\\/g, '\\\\')}', '${tempDir.replace(/\\/g, '\\\\')}')"`);

const docXmlPath = path.join(tempDir, 'word', 'document.xml');
if (fs.existsSync(docXmlPath)) {
    const xml = fs.readFileSync(docXmlPath, 'utf8');
    const paragraphs = [];
    const pMatches = xml.split(/<\/w:p>/);
    for (const p of pMatches) {
        const textMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
        if (textMatches) {
            const line = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join('');
            paragraphs.push(line);
        }
    }
    const textOutput = paragraphs.join('\n');
    fs.writeFileSync(path.resolve('paper/ch1_to_4_extracted_text.txt'), textOutput, 'utf8');
    console.log('Saved ch1_to_4_extracted_text.txt with', paragraphs.length, 'paragraphs.');
} else {
    console.error('document.xml not found');
}
