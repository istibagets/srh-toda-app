import { Injectable, signal } from '@angular/core';

export interface AttachmentItem {
  title: string;
  url: string;
  category?: string;
  filename?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AttachmentViewerService {
  isOpen = signal<boolean>(false);
  activeAttachment = signal<AttachmentItem | null>(null);

  open(title: string, url?: string | null, category: string = 'OFFICIAL ATTACHMENT'): void {
    if (!url) return;
    this.activeAttachment.set({
      title,
      url,
      category,
      filename: title.replace(/\s+/g, '_').toLowerCase(),
    });
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.activeAttachment.set(null);
  }

  downloadCurrent(): void {
    const item = this.activeAttachment();
    if (!item?.url) return;

    try {
      const a = document.createElement('a');
      a.href = item.url;
      a.download = `${item.filename || 'attachment'}.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(item.url, '_blank');
    }
  }

  openInBrowser(event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const item = this.activeAttachment();
    if (item?.url) {
      window.open(item.url, '_blank');
    }
  }

  printCurrent(): void {
    const item = this.activeAttachment();
    if (!item?.url) return;

    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.open(item.url, '_blank');
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${item.title || 'Official Document'}</title>
          <style>
            @page { margin: 10mm; size: auto; }
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #fff; font-family: system-ui, sans-serif; }
            .header { text-align: center; margin-bottom: 20px; }
            .title { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 4px; }
            .sub { font-size: 12px; color: #64748b; }
            img { max-width: 92vw; max-height: 85vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="sub">SANTA ROSA HOMES TODA MANAGEMENT SYSTEM</div>
            <div class="title">${item.title}</div>
          </div>
          <img src="${item.url}" alt="${item.title}" onload="window.print();" />
        </body>
      </html>
    `);
    printWin.document.close();
  }
}
