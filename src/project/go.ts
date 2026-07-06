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
 * Go project adapter.
 *
 * Go has no single canonical version file.  Common conventions checked
 * in priority order:
 *  1. `VERSION` file — plain-text version string
 *  2. `version/version.go` — `var Version = "x.y.z"` or `var Version = semver`
 *  3. `version.go` — same pattern at project root
 */
export const goAdapter: ProjectAdapter = {
    name: 'Go',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        const {existsSync} = await import('node:fs');

        const files: string[] = [];
        const candidates = [
            `${projectRoot}/VERSION`,
            `${projectRoot}/version/version.go`,
            `${projectRoot}/version.go`,
        ];
        for (const f of candidates) {
            if (existsSync(f)) {
                files.push(f);
            }
        }
        return files;
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        const {readFileSync, existsSync} = await import('node:fs');

        // 1. VERSION file
        const verPath = `${projectRoot}/VERSION`;
        if (existsSync(verPath)) {
            try {
                const ver = readFileSync(verPath, 'utf-8').trim();
                if (ver !== '') {
                    return ver;
                }
            } catch {
                /* fall through */
            }
        }

        // 2. version/version.go
        const versionGoFiles = [
            `${projectRoot}/version/version.go`,
            `${projectRoot}/version.go`,
        ];
        for (const vf of versionGoFiles) {
            if (existsSync(vf)) {
                try {
                    const raw = readFileSync(vf, 'utf-8');
                    const match = raw.match(/^\s*var\s+Version\s*=\s*"([^"]+)"/m);
                    if (match) {
                        return match[1];
                    }
                } catch {
                    /* fall through */
                }
            }
        }

        return null;
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync, existsSync} = await import('node:fs');

        const verPath = `${projectRoot}/VERSION`;
        if (existsSync(verPath)) {
            writeFileSync(verPath, `${newVersion}\n`, 'utf-8');
            return;
        }

        const versionGoFiles = [
            `${projectRoot}/version/version.go`,
            `${projectRoot}/version.go`,
        ];
        for (const vf of versionGoFiles) {
            if (existsSync(vf)) {
                const raw = readFileSync(vf, 'utf-8');
                const updated = raw.replace(
                    /^(var\s+Version\s*=\s*)"[^"]*"/m,
                    (_, prefix) => `${prefix}"${newVersion}"`,
                );
                writeFileSync(vf, updated, 'utf-8');
                return;
            }
        }
    },
};
