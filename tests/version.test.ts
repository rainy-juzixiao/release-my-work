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
import {recommendBump, computeNextVersion, buildVersionCommitMessage} from '#@/version.js';
import {mockCommit} from './helpers/factory.js';

describe('recommendBump', () => {
    it('should return "major" when any commit is breaking', () => {
        const commits = [
            mockCommit({type: 'feat', description: 'a', breaking: true}),
        ];
        expect(recommendBump(commits)).toBe('major');
    });

    it('should return "major" when breaking overrides lower bumps', () => {
        const commits = [
            mockCommit({type: 'fix', description: 'b'}),
            mockCommit({type: 'feat', description: 'c', breaking: true}),
        ];
        expect(recommendBump(commits)).toBe('major');
    });

    it('should return "minor" for feat commits', () => {
        const commits = [
            mockCommit({type: 'feat', description: 'add feature'}),
        ];
        expect(recommendBump(commits)).toBe('minor');
    });

    it('should return "patch" for fix commits', () => {
        const commits = [
            mockCommit({type: 'fix', description: 'fix bug'}),
        ];
        expect(recommendBump(commits)).toBe('patch');
    });

    it('should return "minor" when feat and fix mix', () => {
        const commits = [
            mockCommit({type: 'fix', description: 'fix bug'}),
            mockCommit({type: 'feat', description: 'add feature'}),
            mockCommit({type: 'chore', description: 'cleanup'}),
        ];
        expect(recommendBump(commits)).toBe('minor');
    });

    it('should return null when no bump-worthy commits exist', () => {
        const commits = [
            mockCommit({type: 'docs', description: 'update docs'}),
            mockCommit({type: 'chore', description: 'tidy up'}),
            mockCommit({type: 'style', description: 'fmt'}),
        ];
        expect(recommendBump(commits)).toBeNull();
    });

    it('should return null for empty commit list', () => {
        expect(recommendBump([])).toBeNull();
    });
});

// ── computeNextVersion ────────────────────────────────────────────────────

describe('computeNextVersion', () => {
    describe('with no previous tag', () => {
        it('should start at 0.1.0 for a feat', () => {
            const result = computeNextVersion(null, [
                mockCommit({type: 'feat', description: 'init'}),
            ]);
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('0.1.0');
            expect(result!.bump).toBe('minor');
        });

        it('should start at 0.0.1 for a fix', () => {
            const result = computeNextVersion(null, [
                mockCommit({type: 'fix', description: 'patch init'}),
            ]);
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('0.0.1');
            expect(result!.bump).toBe('patch');
        });
    });

    describe('with existing tag', () => {
        it('should bump minor from 1.0.0 to 1.1.0 for feat', () => {
            const result = computeNextVersion('v1.0.0', [
                mockCommit({type: 'feat', description: 'new feature'}),
            ]);
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('1.1.0');
            expect(result!.bump).toBe('minor');
        });

        it('should bump patch from 1.0.0 to 1.0.1 for fix', () => {
            const result = computeNextVersion('v1.0.0', [
                mockCommit({type: 'fix', description: 'bug fix'}),
            ]);
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('1.0.1');
            expect(result!.bump).toBe('patch');
        });

        it('should bump major from 1.0.0 to 2.0.0 for breaking', () => {
            const result = computeNextVersion('v1.0.0', [
                mockCommit({type: 'feat', description: 'breaking change', breaking: true}),
            ]);
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('2.0.0');
            expect(result!.bump).toBe('major');
        });

        it('should handle tags without v prefix', () => {
            const result = computeNextVersion('1.0.0', [
                mockCommit({type: 'feat', description: 'new'}),
            ]);
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('1.1.0');
        });

        it('should return null when no bump-worthy commits', () => {
            const result = computeNextVersion('v1.0.0', [
                mockCommit({type: 'docs', description: 'update docs'}),
            ]);
            expect(result).toBeNull();
        });
    });

    describe('pre-1.0.0 adjustments', () => {
        it('should bump minor for breaking change when bumpMinorPreMajor is true', () => {
            const result = computeNextVersion('v0.5.0', [
                mockCommit({type: 'feat', description: 'breaking', breaking: true}),
            ], {bumpMinorPreMajor: true});
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('0.6.0');
            expect(result!.bump).toBe('minor');
        });

        it('should bump major for breaking change when bumpMinorPreMajor is false', () => {
            const result = computeNextVersion('v0.5.0', [
                mockCommit({type: 'feat', description: 'breaking', breaking: true}),
            ], {bumpMinorPreMajor: false});
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('1.0.0');
            expect(result!.bump).toBe('major');
        });

        it('should bump patch for feat when bumpPatchForMinorPreMajor is true', () => {
            const result = computeNextVersion('v0.5.0', [
                mockCommit({type: 'feat', description: 'new feature'}),
            ], {bumpPatchForMinorPreMajor: true});
            expect(result).not.toBeNull();
            expect(result!.newVersion).toBe('0.5.1');
            expect(result!.bump).toBe('patch');
        });
    });
});

// ── buildVersionCommitMessage ─────────────────────────────────────────────

describe('buildVersionCommitMessage', () => {
    it('should produce a conventional commit message', () => {
        const msg = buildVersionCommitMessage('1.2.3', 'minor');
        expect(msg).toContain('chore(release): 1.2.3');
        expect(msg).toContain('## 1.2.3');
        expect(msg).toContain('minor');
    });

    it('should include the bump type in the body', () => {
        const msg = buildVersionCommitMessage('2.0.0', 'major');
        expect(msg).toContain('major');
    });
});
