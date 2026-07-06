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
 * Node.js / npm project adapter.
 *
 * Version is stored in `package.json` under the `"version"` key.
 */
export const nodeAdapter: ProjectAdapter = {
    name: 'Node.js',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        return [`${projectRoot}/package.json`];
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        try {
            const pkg = await importFsJson(`${projectRoot}/package.json`);
            return (pkg as Record<string, unknown>)?.version as string ?? null;
        } catch {
            return null;
        }
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync} = await import('node:fs');
        const pkgPath = `${projectRoot}/package.json`;
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
        pkg.version = newVersion;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    },
};

/** Small helper so we don't pull in a full JSON loader */
async function importFsJson(path: string): Promise<unknown> {
    const {readFileSync} = await import('node:fs');
    return JSON.parse(readFileSync(path, 'utf-8'));
}
