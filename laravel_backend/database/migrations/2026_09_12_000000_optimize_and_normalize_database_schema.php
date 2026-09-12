<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations for database normalization and index optimization.
     */
    public function up(): void
    {
        $indexes = [
            'users' => [
                'idx_users_role_active' => 'ALTER TABLE `users` ADD INDEX `idx_users_role_active` (`role`, `is_active`)',
                'idx_users_phone' => 'ALTER TABLE `users` ADD INDEX `idx_users_phone` (`phone_number`)',
            ],
            'drivers' => [
                'idx_drivers_queue_lookup' => 'ALTER TABLE `drivers` ADD INDEX `idx_drivers_queue_lookup` (`is_online`, `queue_position`)',
                'idx_drivers_compliance' => 'ALTER TABLE `drivers` ADD INDEX `idx_drivers_compliance` (`compliance_status`)',
                'idx_drivers_user_id' => 'ALTER TABLE `drivers` ADD INDEX `idx_drivers_user_id` (`user_id`)',
            ],
            'rides' => [
                'idx_rides_status_created' => 'ALTER TABLE `rides` ADD INDEX `idx_rides_status_created` (`status`, `created_at`)',
                'idx_rides_driver_status' => 'ALTER TABLE `rides` ADD INDEX `idx_rides_driver_status` (`driver_id`, `status`)',
                'idx_rides_passenger_id' => 'ALTER TABLE `rides` ADD INDEX `idx_rides_passenger_id` (`passenger_id`)',
            ],
            'reports' => [
                'idx_reports_status_created' => 'ALTER TABLE `reports` ADD INDEX `idx_reports_status_created` (`status`, `created_at`)',
                'idx_reports_driver_id' => 'ALTER TABLE `reports` ADD INDEX `idx_reports_driver_id` (`driver_id`)',
                'idx_reports_reporter_id' => 'ALTER TABLE `reports` ADD INDEX `idx_reports_reporter_id` (`reporter_id`)',
            ],
            'chat_messages' => [
                'idx_chat_ride_created' => 'ALTER TABLE `chat_messages` ADD INDEX `idx_chat_ride_created` (`ride_id`, `created_at`)',
            ],
        ];

        foreach ($indexes as $table => $tableIndexes) {
            if (Schema::hasTable($table)) {
                foreach ($tableIndexes as $indexName => $sql) {
                    try {
                        DB::statement($sql);
                    } catch (\Throwable $e) {}
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                try { $table->dropIndex('idx_users_role_active'); } catch (\Throwable $e) {}
                try { $table->dropIndex('idx_users_phone'); } catch (\Throwable $e) {}
            });
        }

        if (Schema::hasTable('drivers')) {
            Schema::table('drivers', function (Blueprint $table) {
                try { $table->dropIndex('idx_drivers_queue_lookup'); } catch (\Throwable $e) {}
                try { $table->dropIndex('idx_drivers_compliance'); } catch (\Throwable $e) {}
                try { $table->dropIndex('idx_drivers_user_id'); } catch (\Throwable $e) {}
            });
        }

        if (Schema::hasTable('rides')) {
            Schema::table('rides', function (Blueprint $table) {
                try { $table->dropIndex('idx_rides_status_created'); } catch (\Throwable $e) {}
                try { $table->dropIndex('idx_rides_driver_status'); } catch (\Throwable $e) {}
                try { $table->dropIndex('idx_rides_passenger_id'); } catch (\Throwable $e) {}
            });
        }

        if (Schema::hasTable('reports')) {
            Schema::table('reports', function (Blueprint $table) {
                try { $table->dropIndex('idx_reports_status_created'); } catch (\Throwable $e) {}
                try { $table->dropIndex('idx_reports_driver_id'); } catch (\Throwable $e) {}
                try { $table->dropIndex('idx_reports_reporter_id'); } catch (\Throwable $e) {}
            });
        }

        if (Schema::hasTable('chat_messages')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                try { $table->dropIndex('idx_chat_ride_created'); } catch (\Throwable $e) {}
            });
        }

        if (Schema::hasTable('saved_locations')) {
            Schema::table('saved_locations', function (Blueprint $table) {
                try { $table->dropIndex('idx_saved_locations_user_default'); } catch (\Throwable $e) {}
            });
        }
    }
};
