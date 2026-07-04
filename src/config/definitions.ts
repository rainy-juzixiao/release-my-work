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
export interface ChangelogSection {
    type: string;
    section: string;
    hidden: boolean;
}

export interface PullRequestConfig {
    titlePattern: string;
    header: string;
    footer: string;
    draft: boolean;
    labels: string[];
    releaseLabel: Record<string, string>;
    skipLabel: string;
    date: boolean;
}

export interface GitHubConfig {
    fork: boolean;
    draft: boolean;
    prerelease: boolean;
    skipGitHubRelease: boolean;
    signoff: string;
}

export interface ReleaseConfig {
    releaseType: string;
    packageName: string;
    includeVInTag: boolean;
    versioning: string;
    bumpMinorPreMajor: boolean;
    bumpPatchForMinorPreMajor: boolean;
    releaseAs: string;
    prerelease: boolean;
    prereleaseType: string;
    pullRequest: PullRequestConfig;
    changelogPath: string;
    changelogType: string;
    changelogHost: string;
    changelogSections: ChangelogSection[];
    github: GitHubConfig;
    extraFiles: string[];
    releaseSearchDepth: number;
    commitSearchDepth: number;
    sequentialCalls: boolean;
    skipLabeling: boolean;
}

export const defaultConfig: ReleaseConfig = {
    releaseType: 'node',
    packageName: 'release-my-work',
    includeVInTag: true,
    versioning: 'default',
    bumpMinorPreMajor: true,
    bumpPatchForMinorPreMajor: false,
    releaseAs: '',
    prerelease: false,
    prereleaseType: '',
    pullRequest: {
        titlePattern: 'chore${scope}: release${component} ${version}',
        header: '',
        footer: '',
        draft: false,
        labels: ['autorelease: pending'],
        releaseLabel: { autorelease: 'tagged' },
        skipLabel: '',
        date: true,
    },
    changelogPath: 'CHANGELOG.md',
    changelogType: 'default',
    changelogHost: 'https://github.com',
    changelogSections: [
        {type: 'feat', section: 'Features', hidden: false},
        {type: 'fix', section: 'Bug Fixes', hidden: false},
        {type: 'docs', section: 'Documentation', hidden: false},
        {type: 'refactor', section: 'Code Refactoring', hidden: false},
        {type: 'perf', section: 'Performance Improvements', hidden: false},
        {type: 'test', section: 'Tests', hidden: false},
        {type: 'build', section: 'Build System', hidden: false},
        {type: 'ci', section: 'Continuous Integration', hidden: false},
        {type: 'chore', section: 'Miscellaneous Chores', hidden: true},
        {type: 'revert', section: 'Reverts', hidden: false},
        {type: 'style', section: 'Styles', hidden: false},
    ],
    github: {
        fork: false,
        draft: false,
        prerelease: false,
        skipGitHubRelease: false,
        signoff: '',
    },
    extraFiles: [],
    releaseSearchDepth: 400,
    commitSearchDepth: 500,
    sequentialCalls: false,
    skipLabeling: false,
};