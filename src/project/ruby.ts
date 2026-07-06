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
 * Ruby / Gem project adapter.
 *
 * Version sources (checked in order):
 *  1. `lib/<name>/version.rb` — `VERSION = "x.y.z"`
 *  2. `*.gemspec` — `spec.version = "x.y.z"`
 *  3. `VERSION` file — plain-text version string
 */
export const rubyAdapter: ProjectAdapter = {
    name: 'Ruby',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        const {existsSync, readdirSync} = await import('node:fs');
        const files: string[] = [];

        // lib/**/version.rb
        const libDir = `${projectRoot}/lib`;
        if (existsSync(libDir)) {
            try {
                const walkDir = (dir: string): void => {
                    const entries = readdirSync(dir, {withFileTypes: true});
                    for (const e of entries) {
                        const full = `${dir}/${e.name}`;
                        if (e.isDirectory()) {
                            walkDir(full);
                        } else if (e.name === 'version.rb') {
                            files.push(full);
                        }
                    }
                };
                walkDir(libDir);
            } catch {
                /* fall through */
            }
        }

        // *.gemspec
        try {
            const rootEntries = readdirSync(projectRoot);
            for (const e of rootEntries) {
                if (e.endsWith('.gemspec')) {
                    files.push(`${projectRoot}/${e}`);
                }
            }
        } catch {
            /* fall through */
        }

        // VERSION file
        const verPath = `${projectRoot}/VERSION`;
        if (existsSync(verPath)) {
            files.push(verPath);
        }

        return files;
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        const {readFileSync, existsSync, readdirSync} = await import('node:fs');

        // 1. lib/**/version.rb
        const libDir = `${projectRoot}/lib`;
        if (existsSync(libDir)) {
            try {
                const walkDir = (dir: string): string | null => {
                    const entries = readdirSync(dir, {withFileTypes: true});
                    for (const e of entries) {
                        const full = `${dir}/${e.name}`;
                        if (e.isDirectory()) {
                            const found = walkDir(full);
                            if (found !== null && found !== undefined) {
                                return found;
                            }
                        } else if (e.name === 'version.rb') {
                            const raw = readFileSync(full, 'utf-8');
                            const match = raw.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
                            if (match) {
                                return match[1];
                            }
                        }
                    }
                    return null;
                };
                const found = walkDir(libDir);
                if (found !== null && found !== undefined) {
                    return found;
                }
            } catch {
                /* fall through */
            }
        }

        // 2. *.gemspec
        try {
            const rootEntries = readdirSync(projectRoot);
            for (const e of rootEntries) {
                if (e.endsWith('.gemspec')) {
                    const raw = readFileSync(`${projectRoot}/${e}`, 'utf-8');
                    const match = raw.match(/spec\.version\s*=\s*['"]([^'"]+)['"]/);
                    if (match) {
                        return match[1];
                    }
                }
            }
        } catch {
            /* fall through */
        }

        // 3. VERSION file
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

        return null;
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync, existsSync, readdirSync} = await import('node:fs');

        // 1. lib/**/version.rb
        const libDir = `${projectRoot}/lib`;
        if (existsSync(libDir)) {
            try {
                const walkAndWrite = (dir: string): boolean => {
                    const entries = readdirSync(dir, {withFileTypes: true});
                    for (const e of entries) {
                        const full = `${dir}/${e.name}`;
                        if (e.isDirectory()) {
                            if (walkAndWrite(full)) {
                                return true;
                            }
                        } else if (e.name === 'version.rb') {
                            const raw = readFileSync(full, 'utf-8');
                            const updated = raw.replace(
                                /(VERSION\s*=\s*)['"][^'"]+['"]/,
                                (_, prefix) => `${prefix}'${newVersion}'`,
                            );
                            writeFileSync(full, updated, 'utf-8');
                            return true;
                        }
                    }
                    return false;
                };
                if (walkAndWrite(libDir)) {
                    return;
                }
            } catch {
                /* fall through */
            }
        }

        // 2. *.gemspec
        try {
            const rootEntries = readdirSync(projectRoot);
            for (const e of rootEntries) {
                if (e.endsWith('.gemspec')) {
                    const path = `${projectRoot}/${e}`;
                    const raw = readFileSync(path, 'utf-8');
                    const updated = raw.replace(
                        /(spec\.version\s*=\s*)['"][^'"]+['"]/,
                        (_, prefix) => `${prefix}'${newVersion}'`,
                    );
                    writeFileSync(path, updated, 'utf-8');
                    return;
                }
            }
        } catch {
            /* fall through */
        }

        // 3. VERSION file
        const verPath = `${projectRoot}/VERSION`;
        writeFileSync(verPath, `${newVersion}\n`, 'utf-8');
    },
};
