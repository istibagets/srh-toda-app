const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function extractDocx(fileName, outName) {
    const docxPath = path.resolve('paper', fileName);
    const tempDir = path.resolve('paper', '_temp_' + outName);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
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
        fs.writeFileSync(path.resolve('paper', outName + '.txt'), textOutput, 'utf8');
        console.log(`Saved ${outName}.txt with ${paragraphs.length} paragraphs.`);
    }
}

extractDocx('UserStories.docx', 'user_stories_extracted');
extractDocx('Chapter3-4.docx', 'chapter3_4_extracted');
