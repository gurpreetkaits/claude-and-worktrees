<?php

namespace App\Services\Claude;

use Symfony\Component\Process\Process;

/**
 * Bidirectional protocol handler for Claude Code CLI.
 * Handles stdin/stdout communication for control messages.
 */
class Protocol
{
    private Process $process;
    private $stdin;
    private array $pendingRequests = [];

    public function __construct(Process $process)
    {
        $this->process = $process;
    }

    /**
     * Set the stdin stream for writing.
     */
    public function setStdin($stdin): void
    {
        $this->stdin = $stdin;
    }

    /**
     * Send a user message to Claude.
     */
    public function sendUserMessage(string $content): void
    {
        $this->sendJson([
            'type' => 'user',
            'message' => [
                'role' => 'user',
                'content' => $content,
            ],
        ]);
    }

    /**
     * Send a resume message to continue a conversation.
     */
    public function sendResumeMessage(string $sessionId, string $content): void
    {
        $this->sendJson([
            'type' => 'resume',
            'session_id' => $sessionId,
            'content' => $content,
        ]);
    }

    /**
     * Send an interrupt signal to Claude.
     */
    public function sendInterrupt(): void
    {
        $this->sendJson([
            'type' => 'interrupt',
        ]);
    }

    /**
     * Respond to a control request (permission approval/denial).
     */
    public function respondToControlRequest(string $requestId, bool $approved, ?string $reason = null): void
    {
        $response = [
            'type' => 'control_response',
            'request_id' => $requestId,
            'approved' => $approved,
        ];

        if ($reason !== null) {
            $response['reason'] = $reason;
        }

        $this->sendJson($response);
    }

    /**
     * Approve a permission request.
     */
    public function approvePermission(string $requestId): void
    {
        $this->respondToControlRequest($requestId, true);
    }

    /**
     * Deny a permission request.
     */
    public function denyPermission(string $requestId, string $reason = 'Denied by user'): void
    {
        $this->respondToControlRequest($requestId, false, $reason);
    }

    /**
     * Send initialization message with hooks configuration.
     */
    public function sendInitialize(array $hooks = []): void
    {
        $this->sendJson([
            'type' => 'initialize',
            'hooks' => $hooks,
        ]);
    }

    /**
     * Set permission mode.
     * Modes: 'default', 'plan', 'bypass_permissions'
     */
    public function setPermissionMode(string $mode): void
    {
        $this->sendJson([
            'type' => 'set_permission_mode',
            'mode' => $mode,
        ]);
    }

    /**
     * Send raw JSON to the process.
     */
    public function sendJson(array $data): void
    {
        if ($this->stdin === null) {
            throw new \RuntimeException('Stdin not set');
        }

        $json = json_encode($data);
        fwrite($this->stdin, $json . "\n");
        fflush($this->stdin);
    }

    /**
     * Track a pending request.
     */
    public function trackRequest(string $requestId, array $request): void
    {
        $this->pendingRequests[$requestId] = $request;
    }

    /**
     * Get and remove a pending request.
     */
    public function popPendingRequest(string $requestId): ?array
    {
        $request = $this->pendingRequests[$requestId] ?? null;
        unset($this->pendingRequests[$requestId]);
        return $request;
    }

    /**
     * Check if there are pending requests.
     */
    public function hasPendingRequests(): bool
    {
        return !empty($this->pendingRequests);
    }

    /**
     * Get all pending requests.
     */
    public function getPendingRequests(): array
    {
        return $this->pendingRequests;
    }
}
