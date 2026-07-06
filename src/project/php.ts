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

import {type ProjectAdapter} from './types.js';

/**
 * PHP / Composer project adapter.
 *
 * Version is stored in `composer.json` under the `"version"` key
 * (same layout as Node's package.json).
 */
export const phpAdapter: ProjectAdapter = {
    name: 'PHP',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        return [`${projectRoot}/composer.json`];
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        try {
            const {readFileSync} = await import('node:fs');
            const raw = readFileSync(`${projectRoot}/composer.json`, 'utf-8');
            const json = JSON.parse(raw) as Record<string, unknown>;
            return (json.version as string) ?? null;
        } catch {
            return null;
        }
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync} = await import('node:fs');
        const path = `${projectRoot}/composer.json`;
        const json = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
        json.version = newVersion;
        writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    },
};
