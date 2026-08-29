<?php

use App\Models\Driver;
use App\Models\Ride;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function srhMakeDriverUser(): User
{
    $user = User::factory()->create(['role' => 'driver']);
    Driver::create([
        'user_id' => $user->id,
        'full_name' => 'Headless Test Driver',
        'mtop_number' => 'TEST-01',
        'compliance_status' => 'Approved',
        'is_online' => true,
        'queue_position' => 1,
    ]);
    return $user;
}

test('driver hub renders poller and reverb wiring', function () {
    $user = srhMakeDriverUser();

    $res = $this->actingAs($user)->get('/dashboard');

    $res->assertOk();
    $html = $res->getContent();

    expect($html)->toContain('grab-home-map');
    expect($html)->toContain('incoming-ride-wrapper');
    expect($html)->toContain('srhForceIncomingCheck');
    expect($html)->toContain('/driver/incoming-ride');
    expect($html)->toContain('createSlidingToast');
    expect($html)->toContain('Passenger cancelled the request.');
    expect($html)->toContain('focusOnIncomingPassenger');
    expect($html)->toContain('srhEnsureMaplibre');
});

test('incoming ride endpoint returns searching ride to queue-1 online driver', function () {
    $user = srhMakeDriverUser();

    $ride = Ride::create([
        'passenger_id' => User::factory()->create(['role' => 'passenger'])->id,
        'status' => 'searching',
        'pickup_location' => 'Terminal',
        'destination' => 'Plaza',
        'pickup_lat' => 15.4295,
        'pickup_lng' => 120.9224,
        'destination_lat' => 15.4215,
        'destination_lng' => 120.9350,
        'fare' => '30.00',
    ]);

    $res = $this->actingAs($user)->get('/driver/incoming-ride');

    $res->assertOk();
    $json = $res->json();

    expect($json)->toHaveKeys([
        'has_incoming', 'ride', 'is_first_in_line', 'queue_position', 'total_queue_count',
    ]);
    expect($json['has_incoming'])->toBeTrue();
    expect($json['is_first_in_line'])->toBeTrue();
    expect($json['queue_position'])->toBe(1);

    $body = $json['ride'];
    expect($body)->toHaveKeys([
        'id', 'status', 'fare', 'pickup_location', 'destination',
        'pickup_lat', 'pickup_lng', 'destination_lat', 'destination_lng',
        'driver_id', 'passenger_id',
    ]);
    expect($body['status'])->toBe('searching');
    expect($body['id'])->toBe($ride->id);
    expect($body['pickup_lat'])->toBeNumeric();
    expect($body['pickup_lng'])->toBeNumeric();
    fwrite(STDOUT, "\n[ok] searching ride id={$body['id']} exposed to queue-1 driver\n");
});

test('incoming ride endpoint exposes fare_proposed ride assigned to the driver', function () {
    $user = srhMakeDriverUser();

    Ride::create([
        'driver_id' => $user->id,
        'passenger_id' => User::factory()->create(['role' => 'passenger'])->id,
        'status' => 'fare_proposed',
        'pickup_location' => 'Terminal',
        'destination' => 'Market',
        'pickup_lat' => 15.4295,
        'pickup_lng' => 120.9224,
        'destination_lat' => 15.4200,
        'destination_lng' => 120.9300,
        'fare' => '45.00',
    ]);

    $res = $this->actingAs($user)->get('/driver/incoming-ride');

    $res->assertOk();
    $json = $res->json();

    expect($json['has_incoming'])->toBeTrue();
    expect($json['ride']['status'])->toBe('fare_proposed');
    fwrite(STDOUT, "\n[ok] fare_proposed ride id={$json['ride']['id']} exposed to driver\n");
});

test('incoming ride endpoint returns empty once ride leaves searching', function () {
    $user = srhMakeDriverUser();

    $ride = Ride::create([
        'passenger_id' => User::factory()->create(['role' => 'passenger'])->id,
        'status' => 'searching',
        'pickup_location' => 'Terminal',
        'destination' => 'Plaza',
        'pickup_lat' => 15.4295,
        'pickup_lng' => 120.9224,
        'destination_lat' => 15.4215,
        'destination_lng' => 120.9350,
        'fare' => '30.00',
    ]);

    $ride->update(['status' => 'cancelled']);

    $res = $this->actingAs($user)->get('/driver/incoming-ride');

    $res->assertOk();
    expect($res->json('has_incoming'))->toBeFalse();
    expect($res->json('ride'))->toBeNull();
    fwrite(STDOUT, "\n[ok] cancelled ride no longer exposed to poller (triggers cancel toast path)\n");
});

test('driver check-status endpoint is healthy', function () {
    $user = srhMakeDriverUser();

    $res = $this->actingAs($user)->get('/driver/check-status');
    $res->assertOk();
});

test('passenger fare_proposed hub renders wait map + sheet wiring', function () {
    $driver = User::factory()->create(['role' => 'driver']);
    $passenger = User::factory()->create(['role' => 'passenger']);

    Ride::create([
        'driver_id' => $driver->id,
        'passenger_id' => $passenger->id,
        'status' => 'fare_proposed',
        'pickup_location' => 'Terminal',
        'destination' => 'Market',
        'pickup_lat' => 15.4295,
        'pickup_lng' => 120.9224,
        'destination_lat' => 15.4200,
        'destination_lng' => 120.9300,
        'fare' => '45.00',
    ]);

    $res = $this->actingAs($passenger)->get('/dashboard');

    $res->assertOk();
    $html = $res->getContent();

    expect($html)->toContain('passenger-status-wrapper');
    expect($html)->toContain('pax-wait-map-canvas');
    expect($html)->toContain('pax-wait-drag-handle');
    expect($html)->toContain('pax-wait-sheet-content');
    expect($html)->toContain('window.initWaitSheetGesture = function');
    expect($html)->toContain('window.initWaitMapGlobal = initWaitMap');
    expect($html)->toContain('/rides/');
    expect($html)->toContain('confirm-fare');
    expect($html)->toContain('Accept');
    expect($html)->toContain('window.initWaitMapGlobal) window.initWaitMapGlobal()');
    expect($html)->toContain('window.initWaitSheetGesture) window.initWaitSheetGesture()');
    fwrite(STDOUT, "\n[ok] fare_proposed passenger hub has map + sheet re-init wiring\n");
});

test('rating notification is delivered to the assigned driver even when driver record id differs from user id', function () {
    $driverUser = User::factory()->create(['role' => 'driver']);
    $passenger = User::factory()->create(['role' => 'passenger']);

    $driverRecord = new Driver([
        'user_id' => $driverUser->id,
        'full_name' => 'Headless Rating Driver',
        'mtop_number' => 'TEST-RATE-01',
        'compliance_status' => 'Approved',
        'is_online' => true,
        'queue_position' => 1,
    ]);
    $driverRecord->id = 99999;
    $driverRecord->save();

    expect($driverRecord->id)->not->toBe($driverUser->id);

    $ride = Ride::create([
        'driver_id' => $driverUser->id,
        'passenger_id' => $passenger->id,
        'status' => 'completed',
        'pickup_location' => 'Terminal',
        'destination' => 'Plaza',
        'pickup_lat' => 15.4295,
        'pickup_lng' => 120.9224,
        'destination_lat' => 15.4215,
        'destination_lng' => 120.9350,
        'fare' => '30.00',
    ]);

    $this->actingAs($passenger)->post("/rides/{$ride->id}/rate", [
        'rating' => 5,
        'review_comment' => 'Great ride!',
    ]);

    $notification = App\Models\Announcement::where('target_audience', 'user_' . $driverUser->id)
        ->where('title', 'like', 'New Rating Received%')
        ->first();

    expect($notification)->not->toBeNull();
    expect($notification->message)->toContain('Rating: 5/5 Stars');

    $res = $this->actingAs($driverUser)->withHeaders(['X-Requested-With' => 'XMLHttpRequest'])
        ->get('/notifications/fetch');
    $res->assertOk();
    $json = $res->json();

    expect($json['announcements'])->toBeArray();
    $titles = collect($json['announcements'])->pluck('title')->all();
    expect($titles)->toContain('New Rating Received: 5/5 Stars');
    fwrite(STDOUT, "\n[ok] rating notification reached the assigned driver\n");
});
