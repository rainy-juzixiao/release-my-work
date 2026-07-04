/**
 * MIT License
 *
 * Copyright (c) 2026 rainy-juzixiao
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import {LogResult, simpleGit as createSimpleGit, type SimpleGit} from 'simple-git';
import type {ConventionalCommit} from '#@/conventional';
import {parseCommit} from '#@/conventional';

export interface GitScanOptions {
    /** Repository path (defaults to cwd) */
    repoPath?: string;
    /** From this ref (commit / tag) — inclusive */
    from?: string;
    /** Up to this ref — inclusive */
    to?: string;
    /** Number of recent commits to scan (overrides from/to) */
    maxCount?: number;
}

export interface GitScanResult {
    /** All conventional commits found in range */
    commits: ConventionalCommit[];
    /** The latest semver tag found (e.g. "v1.2.3" or "1.2.3") */
    latestTag: string | null;
    /** The current branch name */
    currentBranch: string;
}

export function openGit(repoPath?: string): SimpleGit {
    return createSimpleGit(repoPath ?? process.cwd());
}

export async function getLatestTag(git: SimpleGit): Promise<string | null> {
    const tags = await git.tags();
    const semverTags = tags.all
        .filter(t => /^v?\d+\.\d+\.\d+$/.test(t))
        .sort((a, b) => {
            const va = a.replace(/^v/, '');
            const vb = b.replace(/^v/, '');
            return vb.localeCompare(va, undefined, {numeric: true});
        });
    return semverTags[0] ?? null;
}

/**
 * Scan git history for conventional commits.
 */
export async function scanGitHistory(options: GitScanOptions = {}): Promise<GitScanResult> {
    const git = openGit(options.repoPath);
    const currentBranch = (await git.branch()).current;

    // Determine log range
    let logRange: string[];
    if (options.maxCount !== undefined && options.maxCount !== null) {
        logRange = [`--max-count=${options.maxCount}`];
    } else if (options.from !== undefined && options.from !== null &&
        options.from !== '' &&
        options.to !== undefined && options.to !== null &&
        options.to !== '') {
        logRange = [`${options.from}..${options.to}`];
    } else if (options.from !== undefined && options.from !== null && options.from !== '') {
        logRange = [`${options.from}..HEAD`];
    } else {
        logRange = [];
    }

    const log: LogResult = await git.log(logRange);
    const commits: ConventionalCommit[] = [];

    for (const entry of log.all) {
        const parsed: ConventionalCommit | null = parseCommit(entry.message, entry.hash);
        if (parsed !== null && parsed !== undefined) {
            commits.push(parsed);
        }
    }

    const latestTag = await getLatestTag(git);

    return {commits, latestTag, currentBranch};
}
