<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdmin
{
    /**
     * Gate for the standalone /superadmin panel (separate session flag).
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->session()->get('srh_superadmin_authed', false)) {
            return redirect()->route('superadmin.login');
        }

        return $next($request);
    }
}
