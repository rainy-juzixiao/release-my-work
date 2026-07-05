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
import {scanGitHistory, getLatestTag, openGit} from '#@/git.js';
import {TestRepo} from './helpers/test-repo.js';

describe('getLatestTag', () => {
    it('should return null for a repo with no tags', async () => {
        const repo = await TestRepo.create();
        try {
            const git = openGit(repo.dir);
            const tag = await getLatestTag(git);
            expect(tag).toBeNull();
        } finally {
            repo.destroy();
        }
    });

    it('should return the highest semver tag', async () => {
        const repo = await TestRepo.create([
            {message: 'feat: first'},
        ]);
        try {
            repo.tag('v0.1.0');
            repo.tag('v0.2.0');
            repo.tag('v1.0.0');
            const git = openGit(repo.dir);
            const tag = await getLatestTag(git);
            expect(tag).toBe('v1.0.0');
        } finally {
            repo.destroy();
        }
    });

    it('should ignore non-semver tags', async () => {
        const repo = await TestRepo.create([
            {message: 'feat: first'},
        ]);
        try {
            repo.tag('v1.0.0');
            repo.tag('latest');
            repo.tag('build-123');
            const git = openGit(repo.dir);
            const tag = await getLatestTag(git);
            expect(tag).toBe('v1.0.0');
        } finally {
            repo.destroy();
        }
    });

    it('should handle tags without v prefix', async () => {
        const repo = await TestRepo.create([
            {message: 'feat: first'},
        ]);
        try {
            repo.tag('0.5.0');
            repo.tag('1.0.0');
            const git = openGit(repo.dir);
            const tag = await getLatestTag(git);
            expect(tag).toBe('1.0.0');
        } finally {
            repo.destroy();
        }
    });
});

describe('scanGitHistory', () => {
    describe('basic scanning', () => {
        it('should return empty commits for a fresh repo', async () => {
            const repo = await TestRepo.create();
            try {
                const result = await scanGitHistory({repoPath: repo.dir});
                expect(result.commits).toEqual([]);
                expect(result.latestTag).toBeNull();
                expect(result.currentBranch).toBe('main');
            } finally {
                repo.destroy();
            }
        });

        it('should find conventional commits since latest tag', async () => {
            const repo = await TestRepo.create([
                {message: 'feat: initial setup'},       // before tag
                {message: 'fix: fix something'},         // after tag
                {message: 'feat(core): add feature'},    // after tag
            ]);
            try {
                // Tag after the first commit
                // Need to reconstruct: create commits, then tag at the first one
                // Actually, simpler approach: create a repo, tag the current HEAD,
                // then add more commits
                repo.tag('v0.1.0');

                // Add more commits after the tag
                repo.commit('feat: add login');
                repo.commit('fix: fix login bug');
                repo.commit('chore: clean up');

                const result = await scanGitHistory({repoPath: repo.dir});
                expect(result.latestTag).toBe('v0.1.0');
                expect(result.commits.length).toBe(3);
                // git log returns newest first: chore, fix, feat
                expect(result.commits[0].type).toBe('chore');
                expect(result.commits[1].type).toBe('fix');
                expect(result.commits[2].type).toBe('feat');
            } finally {
                repo.destroy();
            }
        });

        it('should return all commits when there is no tag', async () => {
            const repo = await TestRepo.create([
                {message: 'feat: first commit'},
                {message: 'fix: second commit'},
                {message: 'feat(scope): third commit'},
            ]);
            try {
                const result = await scanGitHistory({repoPath: repo.dir});
                expect(result.latestTag).toBeNull();
                // Root commit ("root commit") + 3 conventional commits
                // The root commit is NOT conventional, so it won't appear
                // But the 3 after it are conventional
                expect(result.commits.length).toBe(3);
                expect(result.commits[0].type).toBe('feat');
                expect(result.commits[1].type).toBe('fix');
                expect(result.commits[2].type).toBe('feat');
            } finally {
                repo.destroy();
            }
        });

        it('should filter out non-conventional commits', async () => {
            const repo = await TestRepo.create([
                {message: 'some random message'},
                {message: 'just a regular commit message'},
                {message: 'fix: actual fix'},
            ]);
            try {
                const result = await scanGitHistory({repoPath: repo.dir});
                expect(result.commits.length).toBe(1);
                expect(result.commits[0].type).toBe('fix');
            } finally {
                repo.destroy();
            }
        });
    });

    describe('maxCount option', () => {
        it('should limit the number of commits returned', async () => {
            const repo = await TestRepo.create([
                {message: 'feat: one'},
                {message: 'feat: two'},
                {message: 'feat: three'},
                {message: 'feat: four'},
                {message: 'feat: five'},
            ]);
            try {
                const result = await scanGitHistory({repoPath: repo.dir, maxCount: 2});
                expect(result.commits.length).toBe(2);
            } finally {
                repo.destroy();
            }
        });
    });

    describe('from/to range', () => {
        it('should scan commits within a custom range', async () => {
            const repo = await TestRepo.create([
                {message: 'feat: first'},
                {message: 'feat: second'},
                {message: 'feat: third'},
                {message: 'feat: fourth'},
            ]);
            try {
                const git = openGit(repo.dir);
                const log = await git.log({maxCount: 10});
                const fromHash = log.all[3].hash;  // "feat: first"
                const toHash = log.all[1].hash;    // "feat: third"

                const result = await scanGitHistory({
                    repoPath: repo.dir,
                    from: fromHash,
                    to: toHash,
                });
                // Should include commits fromHash..toHash (both inclusive in simple-git)
                expect(result.commits.length).toBeGreaterThanOrEqual(2);
            } finally {
                repo.destroy();
            }
        });
    });

    describe('mixed-feature repos', () => {
        it('should detect breaking changes in scan', async () => {
            const repo = await TestRepo.create([
                {message: 'feat!: breaking change'},
            ]);
            try {
                const result = await scanGitHistory({repoPath: repo.dir});
                expect(result.commits.length).toBe(1);
                expect(result.commits[0].breaking).toBe(true);
            } finally {
                repo.destroy();
            }
        });

        it('should handle repo with multiple tags', async () => {
            const repo = await TestRepo.create([
                {message: 'feat: initial'},
            ]);
            try {
                repo.tag('v1.0.0');
                repo.commit('feat: feature A');
                repo.commit('fix: fix A');
                repo.tag('v1.1.0');
                repo.commit('feat: feature B');

                const result = await scanGitHistory({repoPath: repo.dir});
                expect(result.latestTag).toBe('v1.1.0');
                // Only commits after v1.1.0: "feat: feature B"
                expect(result.commits.length).toBe(1);
                expect(result.commits[0].description).toBe('feature B');
            } finally {
                repo.destroy();
            }
        });
    });
});
