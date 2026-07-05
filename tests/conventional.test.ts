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
import {parseCommit, bumpLevel} from '#@/conventional.js';

describe('parseCommit', () => {
    describe('valid conventional commits', () => {
        it('should parse feat without scope', () => {
            const result = parseCommit('feat: add new widget', 'abc001');
            expect(result).not.toBeNull();
            expect(result!.type).toBe('feat');
            expect(result!.scope).toBeNull();
            expect(result!.description).toBe('add new widget');
            expect(result!.breaking).toBe(false);
            expect(result!.hash).toBe('abc001');
        });

        it('should parse fix with scope', () => {
            const result = parseCommit('fix(parser): handle empty input', 'abc002');
            expect(result).not.toBeNull();
            expect(result!.type).toBe('fix');
            expect(result!.scope).toBe('parser');
            expect(result!.description).toBe('handle empty input');
        });

        it('should parse breaking change with ! marker', () => {
            const result = parseCommit('feat!: remove deprecated endpoint', 'abc003');
            expect(result).not.toBeNull();
            expect(result!.breaking).toBe(true);
            expect(result!.description).toBe('remove deprecated endpoint');
        });

        it('should parse breaking change with scope and ! marker', () => {
            const result = parseCommit('chore(api)!: drop v1 support', 'abc004');
            expect(result).not.toBeNull();
            expect(result!.type).toBe('chore');
            expect(result!.scope).toBe('api');
            expect(result!.breaking).toBe(true);
        });

        it('should parse BREAKING CHANGE in footer', () => {
            const raw = 'feat: change DB schema\n\nBREAKING CHANGE: drops legacy migration support';
            const result = parseCommit(raw, 'abc005');
            expect(result).not.toBeNull();
            expect(result!.breaking).toBe(true);
        });

        it('should parse commit with body lines', () => {
            const raw = 'feat: implement login\n\nImplement OAuth2 login flow\nAdd token refresh';
            const result = parseCommit(raw, 'abc006');
            expect(result).not.toBeNull();
            expect(result!.body).toEqual(
                expect.arrayContaining(['Implement OAuth2 login flow', 'Add token refresh'])
            );
        });

        it('should parse commit with footers', () => {
            const raw = 'fix: resolve timeout issue\n\nCloses: #123\nReviewed-by: Alice';
            const result = parseCommit(raw, 'abc007');
            expect(result).not.toBeNull();
            expect(result!.footers).toContainEqual({token: 'Closes', value: '#123'});
            expect(result!.footers).toContainEqual({token: 'Reviewed-by', value: 'Alice'});
        });

        it('should treat empty scope as empty string', () => {
            const result = parseCommit('fix(): handle edge case', 'abc008');
            expect(result).not.toBeNull();
            expect(result!.scope).toBe('');
        });

        it('should handle description with colons', () => {
            const result = parseCommit('feat(config): set timeout: 30s', 'abc009');
            expect(result).not.toBeNull();
            expect(result!.type).toBe('feat');
            expect(result!.scope).toBe('config');
            expect(result!.description).toBe('set timeout: 30s');
        });

        it('should handle multi-line raw input', () => {
            const raw = [
                'feat(core): add metrics endpoint',
                '',
                'Expose Prometheus metrics at /metrics',
                '',
                'Closes: #456',
            ].join('\n');
            const result = parseCommit(raw, 'abc010');
            expect(result).not.toBeNull();
            expect(result!.description).toBe('add metrics endpoint');
            expect(result!.body).toContain('Expose Prometheus metrics at /metrics');
            expect(result!.footers).toContainEqual({token: 'Closes', value: '#456'});
        });
    });

    describe('invalid input', () => {
        it('should return null for plain text', () => {
            expect(parseCommit('just a regular message', 'bad001')).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(parseCommit('', 'bad002')).toBeNull();
        });

        it('should return null for missing colon', () => {
            expect(parseCommit('feat add feature', 'bad003')).toBeNull();
        });

        it('should return null for unknown format without type', () => {
            expect(parseCommit(': description without type', 'bad004')).toBeNull();
        });

        it('should return null for whitespace-only', () => {
            expect(parseCommit('   ', 'bad005')).toBeNull();
        });
    });
});

describe('bumpLevel', () => {
    it('should return "major" for breaking changes', () => {
        expect(bumpLevel('feat', true)).toBe('major');
        expect(bumpLevel('fix', true)).toBe('major');
        expect(bumpLevel('chore', true)).toBe('major');
    });

    it('should return "minor" for feat', () => {
        expect(bumpLevel('feat', false)).toBe('minor');
    });

    it('should return "patch" for fix', () => {
        expect(bumpLevel('fix', false)).toBe('patch');
    });

    it('should return null for other types', () => {
        expect(bumpLevel('docs', false)).toBeNull();
        expect(bumpLevel('style', false)).toBeNull();
        expect(bumpLevel('refactor', false)).toBeNull();
        expect(bumpLevel('perf', false)).toBeNull();
        expect(bumpLevel('test', false)).toBeNull();
        expect(bumpLevel('chore', false)).toBeNull();
        expect(bumpLevel('build', false)).toBeNull();
        expect(bumpLevel('ci', false)).toBeNull();
        expect(bumpLevel('revert', false)).toBeNull();
    });
});
