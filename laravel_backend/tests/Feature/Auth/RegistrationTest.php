<?php

test('registration screen can be rendered', function () {
    $response = $this->get('/register');

    $response->assertStatus(200);
});

test('new users can register as passenger', function () {
    $response = $this->post('/register', [
        'name' => 'Test User',
        'email' => 'test@gmail.com',
        'phone_number' => '09171234567',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'role' => 'passenger',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('verification.otp'));
});
