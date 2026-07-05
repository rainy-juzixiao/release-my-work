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
import type {ConventionalCommit} from '#@/conventional.js';

/**
 * Build a valid raw commit message from type/scope/description.
 */
function buildRaw(type: string, scope: string | null, description: string, breaking: boolean, body?: string[], footers?: Array<{ token: string; value: string }>): string {
    const scopePart = scope !== null && scope !== '' ? `(${scope})` : '';
    const breakingPart = breaking ? '!' : '';
    let raw = `${type}${scopePart}${breakingPart}: ${description}`;
    if (body !== undefined && body.length > 0) {
        raw += '\n\n' + body.join('\n');
    }
    if (footers !== undefined && footers.length > 0) {
        for (const f of footers) {
            raw += `\n${f.token}: ${f.value}`;
        }
    }
    return raw;
}

/**
 * Create a mock ConventionalCommit with sensible defaults.
 * Only `type` and `description` are required; everything else has a default.
 */
export function mockCommit(overrides: {
    type: string;
    description: string;
    hash?: string;
    scope?: string | null;
    breaking?: boolean;
    body?: string[];
    footers?: Array<{ token: string; value: string }>;
}): ConventionalCommit {
    const hash = overrides.hash ?? `mock${Date.now()}${Math.random().toString(16).slice(2, 10)}`;
    const scope = overrides.scope ?? null;
    const breaking = overrides.breaking ?? false;
    const body = overrides.body ?? [];
    const footers = overrides.footers ?? [];
    const raw = buildRaw(overrides.type, scope, overrides.description, breaking, body, footers);
    return {hash, raw, type: overrides.type, scope, breaking, description: overrides.description, body, footers};
}

// ── Pre-built mock commit presets ──────────────────────────────────────────

/** A standard "feat" commit with no scope. */
export function featCommit(description = 'add new feature'): ConventionalCommit {
    return mockCommit({type: 'feat', description});
}

/** A "feat" commit with a scope. */
export function featScopeCommit(scope = 'auth', description = 'add login'): ConventionalCommit {
    return mockCommit({type: 'feat', scope, description});
}

/** A "fix" commit. */
export function fixCommit(description = 'fix login bug'): ConventionalCommit {
    return mockCommit({type: 'fix', description});
}

/** A "fix" commit with a scope. */
export function fixScopeCommit(scope = 'parser', description = 'handle empty input'): ConventionalCommit {
    return mockCommit({type: 'fix', scope, description});
}

/** A breaking change commit using the `!` marker. */
export function breakingExclamationCommit(description = 'remove deprecated API'): ConventionalCommit {
    return mockCommit({type: 'feat', description, breaking: true});
}

/** A breaking change commit using BREAKING CHANGE footer. */
export function breakingFooterCommit(description = 'change DB schema'): ConventionalCommit {
    return mockCommit({
        type: 'feat',
        description,
        footers: [{token: 'BREAKING CHANGE', value: 'drops support for legacy migration'}],
    });
}

/** A "chore" commit (no version bump). */
export function choreCommit(description = 'update deps'): ConventionalCommit {
    return mockCommit({type: 'chore', description});
}

/** A "docs" commit (no version bump). */
export function docsCommit(description = 'update README'): ConventionalCommit {
    return mockCommit({type: 'docs', description});
}

/** A commit with body lines. */
export function bodyCommit(type: string, description: string, bodyLines: string[]): ConventionalCommit {
    return mockCommit({type, description, body: bodyLines});
}

/** A commit with footers (e.g. Reviewed-by, Closes). */
export function footerCommit(type: string, description: string, footers: Array<{ token: string; value: string }>): ConventionalCommit {
    return mockCommit({type, description, footers});
}
