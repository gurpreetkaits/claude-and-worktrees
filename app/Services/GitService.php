<?php

namespace App\Services;

use Symfony\Component\Process\Process;
use Symfony\Component\Process\Exception\ProcessFailedException;

class GitService
{
    public function listWorktrees(string $repoPath): array
    {
        $process = new Process(['git', 'worktree', 'list', '--porcelain'], $repoPath);
        $process->run();

        if (!$process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }

        return $this->parseWorktreeList($process->getOutput());
    }

    public function addWorktree(string $repoPath, string $path, string $branch, bool $createBranch = false): array
    {
        $args = ['git', 'worktree', 'add'];

        if ($createBranch) {
            $args[] = '-b';
            $args[] = $branch;
            $args[] = $path;
        } else {
            $args[] = $path;
            $args[] = $branch;
        }

        $process = new Process($args, $repoPath);
        $process->run();

        if (!$process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }

        return [
            'path' => $path,
            'branch' => $branch,
            'message' => $process->getOutput(),
        ];
    }

    public function removeWorktree(string $repoPath, string $worktreePath, bool $force = false): bool
    {
        $args = ['git', 'worktree', 'remove'];

        if ($force) {
            $args[] = '--force';
        }

        $args[] = $worktreePath;

        $process = new Process($args, $repoPath);
        $process->run();

        return $process->isSuccessful();
    }

    public function getStatus(string $worktreePath): array
    {
        $process = new Process(['git', 'status', '--porcelain'], $worktreePath);
        $process->run();

        if (!$process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }

        return $this->parseStatus($process->getOutput());
    }

    public function getDiff(string $worktreePath, ?string $file = null): string
    {
        $args = ['git', 'diff'];

        if ($file) {
            $args[] = '--';
            $args[] = $file;
        }

        $process = new Process($args, $worktreePath);
        $process->run();

        return $process->getOutput();
    }

    public function getStagedDiff(string $worktreePath, ?string $file = null): string
    {
        $args = ['git', 'diff', '--cached'];

        if ($file) {
            $args[] = '--';
            $args[] = $file;
        }

        $process = new Process($args, $worktreePath);
        $process->run();

        return $process->getOutput();
    }

    public function getBranches(string $repoPath): array
    {
        $process = new Process(['git', 'branch', '-a'], $repoPath);
        $process->run();

        if (!$process->isSuccessful()) {
            return [];
        }

        $branches = [];
        $lines = explode("\n", trim($process->getOutput()));

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            $current = str_starts_with($line, '*');
            $name = ltrim($line, '* ');

            $branches[] = [
                'name' => $name,
                'current' => $current,
            ];
        }

        return $branches;
    }

    public function getCurrentBranch(string $worktreePath): ?string
    {
        $process = new Process(['git', 'branch', '--show-current'], $worktreePath);
        $process->run();

        if (!$process->isSuccessful()) {
            return null;
        }

        return trim($process->getOutput());
    }

    public function stageFile(string $worktreePath, string $file): bool
    {
        $process = new Process(['git', 'add', $file], $worktreePath);
        $process->run();

        return $process->isSuccessful();
    }

    public function unstageFile(string $worktreePath, string $file): bool
    {
        $process = new Process(['git', 'reset', 'HEAD', $file], $worktreePath);
        $process->run();

        return $process->isSuccessful();
    }

    public function commit(string $worktreePath, string $message): bool
    {
        $process = new Process(['git', 'commit', '-m', $message], $worktreePath);
        $process->run();

        return $process->isSuccessful();
    }

    public function discardChanges(string $worktreePath, string $file): bool
    {
        $process = new Process(['git', 'checkout', '--', $file], $worktreePath);
        $process->run();

        return $process->isSuccessful();
    }

    public function isGitRepository(string $path): bool
    {
        $process = new Process(['git', 'rev-parse', '--git-dir'], $path);
        $process->run();

        return $process->isSuccessful();
    }

    private function parseWorktreeList(string $output): array
    {
        $worktrees = [];
        $current = [];

        foreach (explode("\n", $output) as $line) {
            $line = trim($line);

            if (empty($line)) {
                if (!empty($current)) {
                    $worktrees[] = $current;
                    $current = [];
                }
                continue;
            }

            if (str_starts_with($line, 'worktree ')) {
                $current['path'] = substr($line, 9);
            } elseif (str_starts_with($line, 'HEAD ')) {
                $current['head'] = substr($line, 5);
            } elseif (str_starts_with($line, 'branch ')) {
                $current['branch'] = str_replace('refs/heads/', '', substr($line, 7));
            } elseif ($line === 'bare') {
                $current['bare'] = true;
            } elseif ($line === 'detached') {
                $current['detached'] = true;
            }
        }

        if (!empty($current)) {
            $worktrees[] = $current;
        }

        return $worktrees;
    }

    private function parseStatus(string $output): array
    {
        $files = [];

        foreach (explode("\n", $output) as $line) {
            if (empty($line)) continue;

            $status = substr($line, 0, 2);
            $file = trim(substr($line, 3));

            $files[] = [
                'file' => $file,
                'status' => $status,
                'staged' => $status[0] !== ' ' && $status[0] !== '?',
                'unstaged' => $status[1] !== ' ',
                'type' => $this->getChangeType($status),
            ];
        }

        return $files;
    }

    private function getChangeType(string $status): string
    {
        $index = $status[0];
        $worktree = $status[1];

        if ($index === '?' || $worktree === '?') return 'untracked';
        if ($index === 'A' || $worktree === 'A') return 'added';
        if ($index === 'D' || $worktree === 'D') return 'deleted';
        if ($index === 'M' || $worktree === 'M') return 'modified';
        if ($index === 'R' || $worktree === 'R') return 'renamed';

        return 'unknown';
    }
}
