<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AttachmentController extends Controller
{
    /**
     * Stream an appeal attachment straight from the public disk with the correct
     * MIME type so the browser can render it inline (images/PDFs) even when the
     * public/storage symlink is missing (e.g. shared hosting, copied folders).
     *
     * ?download=1 forces a browser download instead of inline rendering.
     */
    public function appeal(Request $request, string $filename)
    {
        if (
            $filename === '' ||
            str_contains($filename, '..') ||
            str_contains($filename, '/') ||
            str_contains($filename, '\\')
        ) {
            abort(404);
        }

        $disk = Storage::disk('public');
        $relativePath = 'appeals/' . $filename;

        $fullPath = null;
        if ($disk->exists($relativePath)) {
            $fullPath = $disk->path($relativePath);
        } elseif (file_exists(storage_path('app/public/appeals/' . $filename))) {
            $fullPath = storage_path('app/public/appeals/' . $filename);
        } elseif (file_exists(storage_path('app/appeals/' . $filename))) {
            $fullPath = storage_path('app/appeals/' . $filename);
        }

        if ($fullPath && file_exists($fullPath)) {
            $disposition = $request->boolean('download') ? 'attachment' : 'inline';
            $mimeType = mime_content_type($fullPath) ?: 'image/jpeg';
            return response()->file($fullPath, [
                'Content-Type' => $mimeType,
                'Content-Disposition' => $disposition . '; filename="' . $filename . '"',
            ]);
        }

        // Clean SVG document badge fallback for demo/dummy attachment links
        $cleanTitle = htmlspecialchars(pathinfo($filename, PATHINFO_FILENAME));
        $ext = strtoupper(pathinfo($filename, PATHINFO_EXTENSION) ?: 'DOC');
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="550" viewBox="0 0 800 550" fill="none">
            <rect width="800" height="550" fill="#090d16"/>
            <rect x="50" y="40" width="700" height="470" rx="20" fill="#1e293b" stroke="#334155" stroke-width="2"/>
            <rect x="350" y="90" width="100" height="120" rx="12" fill="#0284c7" opacity="0.2"/>
            <path d="M375 120h50M375 150h50M375 180h30" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
            <rect x="340" y="225" width="120" height="32" rx="8" fill="#2563eb"/>
            <text x="400" y="247" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="800">' . $ext . ' ATTACHMENT</text>
            <text x="400" y="300" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="800">OFFICIAL APPEAL PROOF</text>
            <text x="400" y="335" text-anchor="middle" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14">' . $cleanTitle . '</text>
            <text x="400" y="430" text-anchor="middle" fill="#64748b" font-family="system-ui, sans-serif" font-size="12">SANTA ROSA HOMES TODA ADMINISTRATION</text>
        </svg>';

        return response($svg, 200, [
            'Content-Type' => 'image/svg+xml',
            'Cache-Control' => 'no-cache',
        ]);
    }
}
