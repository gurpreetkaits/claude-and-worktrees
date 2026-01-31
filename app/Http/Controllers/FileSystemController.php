<?php

namespace App\Http\Controllers;

use App\Services\GitService;
use Illuminate\Http\Request;

class FileSystemController extends Controller
{
    public function __construct(
        private GitService $gitService
    ) {}

    public function browse(Request $request)
    {
        $path = $request->query('path', $_SERVER['HOME'] ?? '/');

        if (!is_dir($path)) {
            return response()->json(['error' => 'Invalid directory'], 400);
        }

        $entries = [];
        $items = scandir($path);

        foreach ($items as $item) {
            if ($item === '.') continue;

            $fullPath = $path === '/' ? "/$item" : "$path/$item";

            if (!is_readable($fullPath)) continue;

            $isDir = is_dir($fullPath);
            $isHidden = str_starts_with($item, '.');

            if ($isDir) {
                // Check for .git directory (regular repo) or .git file (worktree)
                $isGitRepo = is_dir("$fullPath/.git") || is_file("$fullPath/.git");

                $entries[] = [
                    'name' => $item,
                    'path' => $fullPath,
                    'isDirectory' => true,
                    'isHidden' => $isHidden,
                    'isGitRepo' => $isGitRepo,
                ];
            }
        }

        usort($entries, function ($a, $b) {
            if ($a['name'] === '..') return -1;
            if ($b['name'] === '..') return 1;
            if ($a['isHidden'] !== $b['isHidden']) {
                return $a['isHidden'] ? 1 : -1;
            }
            return strcasecmp($a['name'], $b['name']);
        });

        $isGitRepo = $this->gitService->isGitRepository($path);
        $currentBranch = $isGitRepo ? $this->gitService->getCurrentBranch($path) : null;

        return response()->json([
            'path' => $path,
            'parent' => dirname($path),
            'entries' => $entries,
            'isGitRepo' => $isGitRepo,
            'currentBranch' => $currentBranch,
        ]);
    }
}
