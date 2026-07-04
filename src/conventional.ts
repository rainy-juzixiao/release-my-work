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

/** Commit Body */
export interface ConventionalCommit {
    hash: string;
    raw: string;
    type: string;
    /** feat, fix, chore, docs, refactor, etc. */
    scope: string | null;
    /** e.g. "auth" for "feat(auth):" */
    breaking: boolean;
    description: string;
    /** Description/subject line after the type(scope): prefix */
    body: string[];
    /** Footer lines */
    footers: Array<{ token: string; value: string }>;
}

export function bumpLevel(type: string, breaking: boolean): 'major' | 'minor' | 'patch' | null {
    if (breaking) {
        return 'major';
    }
    if (type === 'feat') {
        return 'minor';
    }
    if (type === 'fix') {
        return 'patch';
    }
    return null;
}

export function parseCommit(raw: string, hash: string): ConventionalCommit | null {
    // Only parse the first line — body/footer lines are NOT commit headers
    const firstLine = raw.split('\n')[0];
    const headerMatch = firstLine.match(
        /^(?<type>\w+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?\s*:\s*(?<description>.+)$/
    );

    if (!headerMatch) {
        return null;
    }

    const type = headerMatch.groups!.type!;
    const scope = headerMatch.groups!.scope ?? null;
    const breaking = headerMatch.groups!.breaking === '!' || /^BREAKING CHANGE:/m.test(raw);
    const description = headerMatch.groups!.description!.trim();

    // Split body and footers
    const lines = raw.split('\n');
    const bodyLines: string[] = [];
    const footers: Array<{ token: string; value: string }> = [];
    let inFooter = false;

    for (const line of lines) {
        const footerMatch = line.match(/^([\w-]+)\s*:\s*(.+)$/);
        if (footerMatch && (inFooter || bodyLines.length > 0)) {
            footers.push({token: footerMatch[1], value: footerMatch[2].trim()});
            inFooter = true;
        } else if (line.trim() === '') {
            inFooter = true;
        } else if (!inFooter && bodyLines.length > 0) {
            bodyLines.push(line.trim());
        } else {
            bodyLines.push(line.trim());
        }
    }

    return {hash, raw, type, scope, breaking, description, body: bodyLines.filter(Boolean), footers};
}
