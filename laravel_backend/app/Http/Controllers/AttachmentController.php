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
        $path = 'appeals/' . $filename;

        if (!$disk->exists($path)) {
            abort(404);
        }

        $disposition = $request->boolean('download') ? 'attachment' : 'inline';

        return $disk->response($path, $filename, [
            'Content-Disposition' => $disposition . '; filename="' . $filename . '"',
        ]);
    }
}
