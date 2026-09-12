<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\AnnouncementRead;
use App\Models\Driver;
use App\Models\PushSubscription;
use App\Models\Report;
use App\Models\Ride;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class UsersController extends Controller
{
    private const ROLE_OPTIONS = ['passenger', 'driver', 'admin'];

    private static bool $schemaChecked = false;

    public function index(Request $request)
    {
        $this->ensureUsersSchema();

        $query = User::query();

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone_number', 'like', "%{$search}%");
            });
        }

        if ($request->filled('role') && $request->role !== 'all') {
            $query->where('role', $request->role);
        }

        $status = $request->input('status', 'all');
        if ($status === 'active') {
            $query->where('is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('is_active', false);
        }

        $users = $query->with('driverProfile')->latest()->paginate(15)->withQueryString();

        return view('superadmin.dashboard', [
            'activeTab' => 'users',
            'pageTitle' => 'Users',
            'users' => $users,
            'roleFilter' => $request->input('role', 'all'),
            'statusFilter' => $status,
            'search' => $request->input('search', ''),
        ]);
    }

    public function updateRole(Request $request, int $userId)
    {
        $request->validate([
            'role' => ['required', 'in:passenger,driver,admin'],
        ]);

        $user = User::findOrFail($userId);
        $oldRole = $user->role;
        $newRole = $request->role;

        $user->update(['role' => $newRole]);

        // Leaving the driver identity clears the driver profile & queue slot
        $driver = Driver::where('user_id', $user->id)->first();
        if ($newRole !== 'driver' && $driver) {
            $oldPosition = $driver->queue_position;
            $driver->update(['is_online' => false, 'queue_position' => null, 'queue_joined_at' => null]);
            if ($oldPosition !== null) {
                Driver::where('is_online', true)->where('queue_position', '>', $oldPosition)->decrement('queue_position');
            }
            Driver::where('user_id', $user->id)->delete();
        }

        ActivityLogger::log('role_changed', $user->id, ['from' => $oldRole, 'to' => $newRole]);

        return redirect()->route('superadmin.users')->with('status', "{$user->name}'s role changed from {$oldRole} to {$newRole}.");
    }

    public function toggleActive(int $userId)
    {
        $user = User::findOrFail($userId);
        $user->update(['is_active' => ! (bool) $user->is_active]);

        if (! $user->is_active) {
            $driver = Driver::where('user_id', $user->id)->first();
            if ($driver && $driver->is_online) {
                $oldPosition = $driver->queue_position;
                $driver->update(['is_online' => false, 'queue_position' => null, 'queue_joined_at' => null]);
                if ($oldPosition !== null) {
                    Driver::where('is_online', true)->where('queue_position', '>', $oldPosition)->decrement('queue_position');
                }
            }
        }

        ActivityLogger::log($user->is_active ? 'account_activated' : 'account_deactivated', $user->id);

        return redirect()->route('superadmin.users')->with('status', $user->is_active
            ? "{$user->name} has been re-activated."
            : "{$user->name} has been deactivated. They can no longer log in.");
    }

    public function destroy(int $userId)
    {
        $user = User::findOrFail($userId);
        $name = $user->name;

        Driver::where('user_id', $user->id)->delete();
        PushSubscription::where('user_id', $user->id)->delete();
        AnnouncementRead::where('user_id', $user->id)->delete();
        Announcement::where('created_by', $user->id)->delete();
        Report::where('reporter_id', $user->id)->delete();
        Report::where('driver_id', $user->id)->delete();
        Ride::where('passenger_id', $user->id)->update(['passenger_id' => null]);
        Ride::where('driver_id', $user->id)->update(['driver_id' => null]);

        ActivityLogger::log('account_deleted', $user->id, ['deleted_name' => $name]);

        $user->delete();

        return redirect()->route('superadmin.users')->with('status', "User '{$name}' (#{$userId}) deleted.");
    }

    /**
     * Shared-hosting DBs are dumps without migration history — self-heal the
     * is_active column exactly once per request cycle.
     */
    private function ensureUsersSchema(): void
    {
        if (self::$schemaChecked) {
            return;
        }

        self::$schemaChecked = true;

        try {
            if (! Schema::hasColumn('users', 'is_active')) {
                Schema::table('users', function ($table) {
                    $table->boolean('is_active')->default(true)->after('role');
                });
            }
        } catch (\Throwable $e) {
            // Fall back gracefully — inactive filtering simply won't apply.
        }
    }
}