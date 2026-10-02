const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const src = path.resolve('paper/Chapter3-4.docx');
const copy = path.resolve('paper/_temp_ch34_copy.docx');
const tempDir = path.resolve('paper/_temp_ch34_unzip');

// Copy file using fs stream with read share flag
try {
    fs.copyFileSync(src, copy);
    console.log('Copied Chapter3-4.docx successfully');
} catch (e) {
    console.log('Copy failed, trying PowerShell...');
    execSync(`powershell -Command "Copy-Item -LiteralPath '${src.replace(/\\/g, '\\\\')}' -Destination '${copy.replace(/\\/g, '\\\\')}' -Force"`);
}

if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });

execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${copy.replace(/\\/g, '\\\\')}', '${tempDir.replace(/\\/g, '\\\\')}')"`);

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
    fs.writeFileSync(path.resolve('paper/chapter3_4_extracted.txt'), textOutput, 'utf8');
    console.log('Saved chapter3_4_extracted.txt with', paragraphs.length, 'paragraphs.');
} else {
    console.error('document.xml not found');
}
