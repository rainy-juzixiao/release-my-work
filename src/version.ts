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

import semver from 'semver';
import type {ConventionalCommit} from '#@/conventional';
import {bumpLevel} from '#@/conventional';

/** Result of computing the next version */
export interface VersionBumpResult {
    /** The new version string (e.g. "1.3.0") */
    newVersion: string;
    /** The bump type applied */
    bump: 'major' | 'minor' | 'patch';
    /** List of commits included in this bump */
    commits: ConventionalCommit[];
}

/**
 * Determine the recommended bump level from a list of conventional commits.
 *
 * A single breaking change → major.
 * At least one feat → minor.
 * At least one fix → patch.
 *
 * Otherwise, null (no bump needed).
 */
export function recommendBump(commits: ConventionalCommit[]): 'major' | 'minor' | 'patch' | null {
    let bump: 'major' | 'minor' | 'patch' | null = null;

    for (const c of commits) {
        const level = bumpLevel(c.type, c.breaking);
        if (level === 'major') {
            return 'major';
        }
        if (level === 'minor') {
            bump = 'minor';
        }
        if (level === 'patch' && bump !== 'minor') {
            bump = 'patch';
        }
    }

    return bump;
}

/**
 * Compute the next version based on the current tag and commits.
 *
 * TODO: Config — Consume cfg.releaseType, cfg.versioning, cfg.releaseAs,
 *       cfg.prerelease, and cfg.prereleaseType to modify the bump strategy:
 *       - releaseType: project-type-specific rules (node default semver,
 *         ruby pessimistic, java maven, etc.)
 *       - versioning: strategy name like 'default', 'always-bump-patch'
 *       - releaseAs: override the computed version entirely
 *       - prerelease / prereleaseType: append prerelease suffix (e.g.
 *         '-alpha.1', '-beta.2') and auto-increment the prerelease number.
 *
 * @param currentTag  Current semver tag (e.g. "v1.2.3" or "1.2.3")
 * @param commits     Conventional commits since that tag
 * @param options     Optional bump strategy overrides
 * @param options.bumpMinorPreMajor     When true and version < 1.0.0, BREAKING
 *                                      CHANGE bumps MINOR instead of MAJOR.
 * @param options.bumpPatchForMinorPreMajor
 *                                      When true and version < 1.0.0, feat
 *                                      bumps PATCH instead of MINOR.
 * @returns           The new version and bump info, or null if no bump warranted
 */
export function computeNextVersion(
    currentTag: string | null,
    commits: ConventionalCommit[],
    options?: {
        bumpMinorPreMajor?: boolean;
        bumpPatchForMinorPreMajor?: boolean;
    },
): VersionBumpResult | null {
    const clean = currentTag !== null && currentTag !== '' && currentTag !== undefined
        ? (semver.clean(currentTag) ?? '0.0.0')
        : '0.0.0';

    const parsed = semver.parse(clean);
    if (parsed === null || parsed === undefined) {
        return null;
    }
    const current = parsed;

    let bump = recommendBump(commits);

    if (bump === null || bump === undefined) {
        return null;
    }

    // Pre-1.0.0 adjustments from user config
    if (current.major === 0) {
        // feat → patch (instead of minor) when bumpPatchForMinorPreMajor is true
        if (options?.bumpPatchForMinorPreMajor === true && bump === 'minor') {
            bump = 'patch';
        }
        // BREAKING CHANGE → minor (instead of major) when bumpMinorPreMajor is true
        if (options?.bumpMinorPreMajor === true && bump === 'major') {
            bump = 'minor';
        }
    }

    const next = current.inc(bump);
    return {
        newVersion: next.version,
        bump,
        commits,
    };
}

/**
 * Create the next version commit message following conventional commit style.
 */
export function buildVersionCommitMessage(newVersion: string, bump: string): string {
    return `chore(release): ${newVersion}\n\n## ${newVersion}\n\nAutomated release bump (${bump}).`;
}
