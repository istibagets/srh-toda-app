<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Driver;
use App\Models\Ride;
use App\Models\Report;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\File;
use Carbon\Carbon;

class DummyDataSeeder extends Seeder
{
    public function run()
    {
        echo "=== SEEDING 10 PASSENGERS & 10 DRIVERS WITH REPORTS & RIDES ===" . PHP_EOL;

        // 1. Ensure logo exists in storage directories for attachments
        $logoSource = public_path('images/srh-logo.png');
        $docDir = storage_path('app/public/documents');
        $licDir = storage_path('app/public/drivers_license');
        $appealDir = storage_path('app/public/appeals');

        if (!File::isDirectory($docDir)) File::makeDirectory($docDir, 0755, true);
        if (!File::isDirectory($licDir)) File::makeDirectory($licDir, 0755, true);
        if (!File::isDirectory($appealDir)) File::makeDirectory($appealDir, 0755, true);

        if (File::exists($logoSource)) {
            File::copy($logoSource, $docDir . '/srh-logo.png');
            File::copy($logoSource, $licDir . '/srh-logo.png');
            File::copy($logoSource, $appealDir . '/srh-logo.png');
            echo "Copied srh-logo.png to documents, drivers_license, and appeals storage." . PHP_EOL;
        }

        // 2. Seed 10 Passengers: passenger1@gmail.com -> passenger10@gmail.com
        $passengerNames = [
            'Maria Clara Santos',
            'Juan Dela Cruz',
            'Bea Alonzo',
            'Joshua Garcia',
            'Kathryn Bernardo',
            'Daniel Padilla',
            'Coco Martin',
            'Dingdong Dantes',
            'Marian Rivera',
            'Alden Richards',
        ];

        $passengers = [];
        for ($i = 1; $i <= 10; $i++) {
            $email = "passenger{$i}@gmail.com";
            $name = $passengerNames[$i - 1];

            $user = User::updateOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'password' => Hash::make('admin123'),
                    'role' => 'passenger',
                    'email_verified_at' => now(),
                ]
            );
            $passengers[] = $user;
            echo "Created/Updated Passenger {$i}: {$name} ({$email})" . PHP_EOL;
        }

        // 3. Seed 10 Drivers: driver1@gmail.com -> driver10@gmail.com
        // 5 On Duty (1-5), 2 Pending (6-7), 3 Active Offline (8-10)
        $driverNames = [
            'Ricardo Dalisay',
            'Cardo Santos',
            'Ramon Bautista',
            'Danilo Reyes',
            'Eduardo Manalo',
            'Vicente Soriano',
            'Nestor Pineda',
            'Ferdinand Cruz',
            'Rolando Ramos',
            'Emilio Aguinaldo',
        ];

        $drivers = [];
        for ($i = 1; $i <= 10; $i++) {
            $email = "driver{$i}@gmail.com";
            $name = $driverNames[$i - 1];
            $mtop = str_pad((string)(500100 + $i), 6, '0', STR_PAD_LEFT);

            $user = User::updateOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'password' => Hash::make('admin123'),
                    'role' => 'driver',
                    'email_verified_at' => now(),
                ]
            );

            // Determine status breakdown
            if ($i <= 5) {
                // 5 on duty (Queue 1 to 5)
                $complianceStatus = 'Approved';
                $isOnline = true;
                $queuePos = $i;
            } elseif ($i <= 7) {
                // 2 pending applicants
                $complianceStatus = 'Pending';
                $isOnline = false;
                $queuePos = null;
            } else {
                // 3 active but offline
                $complianceStatus = 'Approved';
                $isOnline = false;
                $queuePos = null;
            }

            $driverRecord = Driver::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'full_name' => $name,
                    'mtop_number' => $mtop,
                    'compliance_status' => $complianceStatus,
                    'is_online' => $isOnline,
                    'queue_position' => $queuePos,
                    'mtop_certificate_url' => 'documents/srh-logo.png',
                    'drivers_license_url' => 'drivers_license/srh-logo.png',
                    'suspension_reason' => null,
                    'appeal_message' => null,
                    'appeal_status' => null,
                    'appealed_at' => null,
                    'appeal_attachments' => [],
                ]
            );

            $drivers[] = $driverRecord;
            echo "Created/Updated Driver {$i}: {$name} ({$email}) | MTOP: {$mtop} | Status: {$complianceStatus} | Online: " . ($isOnline ? 'YES (Pos: '.$queuePos.')' : 'NO') . PHP_EOL;
        }

        // 4. Seed Rich Ride History for Passengers and Drivers
        $routes = [
            ['pickup' => 'San Rafael Public Market', 'dest' => 'Cruz na Daan Junction', 'fare' => 30.00],
            ['pickup' => 'SRH TODA Main Terminal', 'dest' => 'San Roque Chapel', 'fare' => 25.00],
            ['pickup' => 'Caingin Barangay Hall', 'dest' => 'SM Center San Rafael', 'fare' => 45.00],
            ['pickup' => 'Victory Coliseum', 'dest' => 'Bulacan Agricultural State College', 'fare' => 50.00],
            ['pickup' => 'Mabalas-balas Crossing', 'dest' => 'San Rafael Town Center', 'fare' => 35.00],
            ['pickup' => 'Sampaloc Elementary School', 'dest' => 'Capihan Terminal', 'fare' => 40.00],
            ['pickup' => 'Lico Elementary School', 'dest' => 'San Rafael Municipal Hospital', 'fare' => 55.00],
            ['pickup' => 'Maasim Barangay Plaza', 'dest' => 'SRH Commercial Hub', 'fare' => 30.00],
        ];

        $tagsPool = ['Punctual', 'Polite Driver', 'Clean Tricycle', 'Safe Driving', 'Fair Fare', 'Great Route'];

        // Clear existing test rides if needed or append realistic rides
        for ($p = 0; $p < count($passengers); $p++) {
            $pax = $passengers[$p];
            // Give each passenger 3 to 6 rides spread over today, yesterday, and earlier
            $numRides = rand(3, 6);
            for ($r = 0; $r < $numRides; $r++) {
                $routeInfo = $routes[array_rand($routes)];
                $assignedDriver = $drivers[array_rand($drivers)];
                $daysAgo = rand(0, 5);
                $createdDate = Carbon::now()->subDays($daysAgo)->subHours(rand(1, 10))->subMinutes(rand(5, 55));

                $statusRandom = rand(1, 10);
                if ($statusRandom <= 7) {
                    $status = 'completed';
                    $rating = rand(4, 5);
                    $reviewComment = $rating === 5 ? 'Very courteous and safe driving!' : 'Good and fast trip.';
                    $feedbackTags = implode(', ', (array) array_rand(array_flip($tagsPool), rand(1, 3)));
                } elseif ($statusRandom <= 9) {
                    $status = 'cancelled';
                    $rating = null;
                    $reviewComment = null;
                    $feedbackTags = null;
                } else {
                    $status = 'in_transit';
                    $rating = null;
                    $reviewComment = null;
                    $feedbackTags = null;
                }

                Ride::create([
                    'passenger_id' => $pax->id,
                    'driver_id' => $assignedDriver->user_id,
                    'status' => $status,
                    'pickup_location' => $routeInfo['pickup'],
                    'pickup_lat' => 15.0210 + (rand(-50, 50) / 10000),
                    'pickup_lng' => 120.9400 + (rand(-50, 50) / 10000),
                    'destination' => $routeInfo['dest'],
                    'destination_lat' => 15.0320 + (rand(-50, 50) / 10000),
                    'destination_lng' => 120.9550 + (rand(-50, 50) / 10000),
                    'fare' => $routeInfo['fare'],
                    'rating' => $rating,
                    'review_comment' => $reviewComment,
                    'feedback_tags' => $feedbackTags,
                    'created_at' => $createdDate,
                    'updated_at' => $createdDate->copy()->addMinutes(rand(10, 25)),
                ]);
            }
        }
        echo "Seeded realistic ride history across passengers and drivers." . PHP_EOL;

        // 5. Seed Diverse Reports with Different Statuses
        $sampleReports = [
            [
                'reporter_index' => 0, // Maria Clara
                'driver_index' => 0,   // Ricardo Dalisay
                'category' => 'Overcharging',
                'subject' => 'Excessive fare charged for short distance',
                'description' => 'Driver demanded ₱80 instead of standard matrix fare of ₱35 from Market to Cruz na Daan.',
                'status' => 'pending',
                'admin_notes' => null,
                'resolved_at' => null,
                'created_at' => Carbon::now()->subHours(2),
            ],
            [
                'reporter_index' => 1, // Juan Dela Cruz
                'driver_index' => 1,   // Cardo Santos
                'category' => 'Reckless Driving',
                'subject' => 'Speeding near school zone',
                'description' => 'Driver was overtaking aggressively and speeding in front of Sampaloc Elementary School.',
                'status' => 'investigating',
                'admin_notes' => 'Investigating TODA officer dispatched to verify speed complaint with terminal marshal.',
                'resolved_at' => null,
                'created_at' => Carbon::now()->subHours(5),
            ],
            [
                'reporter_index' => 2, // Bea Alonzo
                'driver_index' => 2,   // Ramon Bautista
                'category' => 'Rude Behavior',
                'subject' => 'Refused change and spoke discourteously',
                'description' => 'Driver did not have change for ₱100 and shouted at passenger when asked politely.',
                'status' => 'resolved',
                'admin_notes' => 'Driver called to TODA office, reprimanded and warned. Refund issued to passenger.',
                'resolved_at' => Carbon::now()->subHours(1),
                'created_at' => Carbon::now()->subDays(1),
            ],
            [
                'reporter_index' => 3, // Joshua Garcia
                'driver_index' => 3,   // Danilo Reyes
                'category' => 'Lost Item',
                'subject' => 'Left black backpack in tricycle',
                'description' => 'Accidentally left a black laptop backpack on the sidecar seat after dropoff at Victory Coliseum.',
                'status' => 'resolved',
                'admin_notes' => 'Driver surrendered the bag to SRH TODA Terminal Office. Returned safely to owner.',
                'resolved_at' => Carbon::now()->subHours(8),
                'created_at' => Carbon::now()->subDays(2),
            ],
            [
                'reporter_index' => 4, // Kathryn Bernardo
                'driver_index' => 4,   // Eduardo Manalo
                'category' => 'Vehicle Condition',
                'subject' => 'Broken sidecar seat spring',
                'description' => 'Sidecar seat has protruding iron wire which tore passengers jacket during transit.',
                'status' => 'investigating',
                'admin_notes' => 'TODA inspector scheduled physical vehicle check on unit before permitting renewal.',
                'resolved_at' => null,
                'created_at' => Carbon::now()->subDays(1)->subHours(3),
            ],
            [
                'reporter_index' => 5, // Daniel Padilla
                'driver_index' => 7,   // Ferdinand Cruz
                'category' => 'Refusal to Convey',
                'subject' => 'Refused passenger destination',
                'description' => 'Driver declined ride from San Rafael Market stating traffic was too heavy.',
                'status' => 'dismissed',
                'admin_notes' => 'Verified that tricycle had a flat tire issue and was heading for repair at time of incident.',
                'resolved_at' => Carbon::now()->subHours(4),
                'created_at' => Carbon::now()->subDays(3),
            ],
            [
                'reporter_index' => 6, // Coco Martin
                'driver_index' => 8,   // Rolando Ramos
                'category' => 'Overcharging',
                'subject' => 'Night trip surcharge without approval',
                'description' => 'Driver added ₱50 night charge citing late hours despite standard LGU ordinance rate.',
                'status' => 'pending',
                'admin_notes' => null,
                'resolved_at' => null,
                'created_at' => Carbon::now()->subMinutes(45),
            ],
            [
                'reporter_index' => 7, // Dingdong Dantes
                'driver_index' => 9,   // Emilio Aguinaldo
                'category' => 'Other',
                'subject' => 'Inquiry regarding TODA scheduled trip',
                'description' => 'Inquiring if advance booking for wedding entourage is supported through dispatch.',
                'status' => 'dismissed',
                'admin_notes' => 'General inquiry, not a disciplinary safety report. Advised to coordinate with TODA President directly.',
                'resolved_at' => Carbon::now()->subHours(12),
                'created_at' => Carbon::now()->subDays(4),
            ],
        ];

        foreach ($sampleReports as $rep) {
            $repUser = $passengers[$rep['reporter_index']];
            $drvUser = $drivers[$rep['driver_index']];

            // Find a matching ride between them if exists
            $matchRide = Ride::where('passenger_id', $repUser->id)
                ->where('driver_id', $drvUser->user_id)
                ->first();

            Report::create([
                'reporter_id' => $repUser->id,
                'driver_id' => $drvUser->user_id,
                'ride_id' => $matchRide ? $matchRide->id : null,
                'category' => $rep['category'],
                'subject' => $rep['subject'],
                'description' => $rep['description'],
                'status' => $rep['status'],
                'admin_notes' => $rep['admin_notes'],
                'resolved_at' => $rep['resolved_at'],
                'created_at' => $rep['created_at'],
                'updated_at' => $rep['resolved_at'] ?? $rep['created_at'],
            ]);
        }
        echo "Seeded 8 diverse reports across Pending, Investigating, Resolved, and Dismissed statuses." . PHP_EOL;

        echo "=== DUMMY DATA SEEDING COMPLETED SUCCESSFULLY! ===" . PHP_EOL;
    }
}
