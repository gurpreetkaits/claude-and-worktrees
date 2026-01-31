<?php

namespace App\Services\Claude;

/**
 * Message types from Claude Code CLI stream-json output.
 */
class MessageTypes
{
    public const TYPE_SYSTEM = 'system';
    public const TYPE_USER = 'user';
    public const TYPE_ASSISTANT = 'assistant';
    public const TYPE_TOOL_USE = 'tool_use';
    public const TYPE_TOOL_RESULT = 'tool_result';
    public const TYPE_RESULT = 'result';
    public const TYPE_STREAM_EVENT = 'stream_event';

    public const CONTROL_REQUEST = 'control_request';
    public const CONTROL_RESPONSE = 'control_response';

    /**
     * Parse a JSON line from Claude Code output.
     */
    public static function parse(string $line): ?array
    {
        $line = trim($line);

        if (empty($line)) {
            return null;
        }

        // Skip known noise lines
        if (str_starts_with($line, 'Service not running') ||
            str_starts_with($line, 'claude code router service')) {
            return null;
        }

        $decoded = json_decode($line, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'type' => 'raw',
                'content' => $line,
            ];
        }

        return self::normalizeMessage($decoded);
    }

    /**
     * Normalize a parsed message into a consistent format.
     */
    public static function normalizeMessage(array $message): array
    {
        $type = $message['type'] ?? 'unknown';

        switch ($type) {
            case self::TYPE_SYSTEM:
                return self::normalizeSystemMessage($message);

            case self::TYPE_USER:
                return self::normalizeUserMessage($message);

            case self::TYPE_ASSISTANT:
                return self::normalizeAssistantMessage($message);

            case self::TYPE_TOOL_USE:
                return self::normalizeToolUse($message);

            case self::TYPE_TOOL_RESULT:
                return self::normalizeToolResult($message);

            case self::TYPE_RESULT:
                return self::normalizeResult($message);

            case self::TYPE_STREAM_EVENT:
                return self::normalizeStreamEvent($message);

            default:
                if (isset($message['request_id']) && isset($message['request'])) {
                    return self::normalizeControlRequest($message);
                }

                return [
                    'type' => $type,
                    'raw' => $message,
                ];
        }
    }

    /**
     * Normalize system message (session info, plugins, etc.)
     */
    private static function normalizeSystemMessage(array $message): array
    {
        return [
            'type' => self::TYPE_SYSTEM,
            'session_id' => $message['session_id'] ?? null,
            'tools' => $message['tools'] ?? [],
            'model' => $message['model'] ?? null,
            'cwd' => $message['cwd'] ?? null,
        ];
    }

    /**
     * Normalize user message.
     */
    private static function normalizeUserMessage(array $message): array
    {
        $content = '';

        if (isset($message['message'])) {
            $msg = $message['message'];
            if (is_string($msg['content'] ?? null)) {
                $content = $msg['content'];
            } elseif (is_array($msg['content'] ?? null)) {
                foreach ($msg['content'] as $block) {
                    if (($block['type'] ?? '') === 'text') {
                        $content .= $block['text'] ?? '';
                    }
                }
            }
        }

        return [
            'type' => self::TYPE_USER,
            'uuid' => $message['uuid'] ?? null,
            'content' => $content,
            'session_id' => $message['session_id'] ?? null,
        ];
    }

    /**
     * Normalize assistant message.
     */
    private static function normalizeAssistantMessage(array $message): array
    {
        $content = '';
        $thinking = '';
        $toolUses = [];

        $msg = $message['message'] ?? $message;
        $contentBlocks = $msg['content'] ?? [];

        if (is_string($contentBlocks)) {
            $content = $contentBlocks;
        } elseif (is_array($contentBlocks)) {
            foreach ($contentBlocks as $block) {
                $blockType = $block['type'] ?? '';

                switch ($blockType) {
                    case 'text':
                        $content .= $block['text'] ?? '';
                        break;

                    case 'thinking':
                        $thinking .= $block['thinking'] ?? '';
                        break;

                    case 'tool_use':
                        $toolUses[] = [
                            'id' => $block['id'] ?? null,
                            'name' => $block['name'] ?? 'unknown',
                            'input' => $block['input'] ?? [],
                        ];
                        break;
                }
            }
        }

        return [
            'type' => self::TYPE_ASSISTANT,
            'uuid' => $message['uuid'] ?? null,
            'content' => $content,
            'thinking' => $thinking,
            'tool_uses' => $toolUses,
            'session_id' => $message['session_id'] ?? null,
            'stop_reason' => $msg['stop_reason'] ?? null,
        ];
    }

    /**
     * Normalize tool use message.
     */
    private static function normalizeToolUse(array $message): array
    {
        return [
            'type' => self::TYPE_TOOL_USE,
            'tool_use_id' => $message['tool_use_id'] ?? $message['id'] ?? null,
            'name' => $message['tool_name'] ?? $message['name'] ?? 'unknown',
            'input' => $message['tool_data'] ?? $message['input'] ?? [],
        ];
    }

    /**
     * Normalize tool result message.
     */
    private static function normalizeToolResult(array $message): array
    {
        $content = '';
        $result = $message['result'] ?? $message['content'] ?? '';

        if (is_string($result)) {
            $content = $result;
        } elseif (is_array($result)) {
            foreach ($result as $block) {
                if (($block['type'] ?? '') === 'text') {
                    $content .= $block['text'] ?? '';
                }
            }
        }

        return [
            'type' => self::TYPE_TOOL_RESULT,
            'tool_use_id' => $message['tool_use_id'] ?? null,
            'content' => $content,
            'is_error' => $message['is_error'] ?? false,
        ];
    }

    /**
     * Normalize final result message.
     */
    private static function normalizeResult(array $message): array
    {
        $resultText = null;
        if (isset($message['result'])) {
            if (is_string($message['result'])) {
                $resultText = $message['result'];
            } elseif (is_array($message['result']) && isset($message['result']['text'])) {
                $resultText = $message['result']['text'];
            }
        }

        return [
            'type' => self::TYPE_RESULT,
            'result' => $resultText,
            'subtype' => $message['subtype'] ?? null,
            'cost_usd' => $message['cost_usd'] ?? null,
            'duration_ms' => $message['duration_ms'] ?? null,
            'duration_api_ms' => $message['duration_api_ms'] ?? null,
            'is_error' => $message['is_error'] ?? false,
            'num_turns' => $message['num_turns'] ?? null,
            'session_id' => $message['session_id'] ?? null,
        ];
    }

    /**
     * Normalize stream event (incremental content updates).
     */
    private static function normalizeStreamEvent(array $message): array
    {
        $event = $message['event'] ?? [];
        $eventType = $event['type'] ?? 'unknown';

        $textDelta = '';
        if ($eventType === 'content_block_delta') {
            $delta = $event['delta'] ?? [];
            if (($delta['type'] ?? '') === 'text_delta') {
                $textDelta = $delta['text'] ?? '';
            }
        }

        return [
            'type' => self::TYPE_STREAM_EVENT,
            'event_type' => $eventType,
            'text_delta' => $textDelta,
            'session_id' => $message['session_id'] ?? null,
            'uuid' => $message['uuid'] ?? null,
        ];
    }

    /**
     * Normalize control request (permission requests from Claude).
     */
    private static function normalizeControlRequest(array $message): array
    {
        $request = $message['request'] ?? [];
        $requestType = $request['subtype'] ?? $request['type'] ?? 'unknown';
        $tool = $request['tool_name'] ?? $request['tool'] ?? null;

        return [
            'type' => self::CONTROL_REQUEST,
            'request_id' => $message['request_id'],
            'request_type' => $requestType,
            'tool' => $tool,
            'input' => $request['input'] ?? [],
            'raw_request' => $request,
        ];
    }
}
