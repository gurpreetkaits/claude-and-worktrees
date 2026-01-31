<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Claude streaming channel - public for now (no auth required)
// In production, you may want to add authentication
Broadcast::channel('claude.todo.{todoId}', function () {
    return true;
});
