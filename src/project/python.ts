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
 * Python project adapter.
 *
 * Version sources (checked in order):
 *  1. `pyproject.toml` — `[project] version = "..."`
 *  2. `setup.cfg` — `[metadata] version = "..."`
 *  3. `VERSION` file — plain-text version string
 */
export const pythonAdapter: ProjectAdapter = {
    name: 'Python',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        const {existsSync} = await import('node:fs');

        const files: string[] = [];
        const tomlPath = `${projectRoot}/pyproject.toml`;
        const cfgPath = `${projectRoot}/setup.cfg`;
        const verPath = `${projectRoot}/VERSION`;

        if (existsSync(tomlPath)) {
            files.push(tomlPath);
        }
        if (existsSync(cfgPath)) {
            files.push(cfgPath);
        }
        if (existsSync(verPath)) {
            files.push(verPath);
        }

        return files;
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        const {readFileSync, existsSync} = await import('node:fs');

        // 1. Try pyproject.toml
        const tomlPath = `${projectRoot}/pyproject.toml`;
        if (existsSync(tomlPath)) {
            try {
                const {parse: parseToml} = await import('smol-toml');
                const raw = readFileSync(tomlPath, 'utf-8');
                const doc = parseToml(raw) as Record<string, unknown>;
                const project = doc.project as Record<string, unknown> | undefined;
                if (project?.version !== undefined && typeof project.version === 'string') {
                    return project.version;
                }
                // Fallback: poetry-style [tool.poetry] version
                const tool = doc.tool as Record<string, unknown> | undefined;
                const poetry = tool?.poetry as Record<string, unknown> | undefined;
                if (poetry?.version !== undefined && typeof poetry.version === 'string') {
                    return poetry.version;
                }
            } catch {
                // fall through
            }
        }

        // 2. Try setup.cfg
        const cfgPath = `${projectRoot}/setup.cfg`;
        if (existsSync(cfgPath)) {
            try {
                const raw = readFileSync(cfgPath, 'utf-8');
                const match = raw.match(/^version\s*=\s*(.+)$/m);
                if (match) {
                    return match[1].trim();
                }
            } catch {
                // fall through
            }
        }

        // 3. Try VERSION file
        const verPath = `${projectRoot}/VERSION`;
        if (existsSync(verPath)) {
            try {
                const ver = readFileSync(verPath, 'utf-8').trim();
                if (ver !== '') {
                    return ver;
                }
            } catch {
                // fall through
            }
        }

        return null;
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync, existsSync} = await import('node:fs');

        const tomlPath = `${projectRoot}/pyproject.toml`;
        if (existsSync(tomlPath)) {
            const {parse: parseToml} = await import('smol-toml');
            const raw = readFileSync(tomlPath, 'utf-8');
            const doc = parseToml(raw) as Record<string, unknown>;

            const project = doc.project as Record<string, unknown> | undefined;
            if (project) {
                project.version = newVersion;
            } else {
                // Poetry-style
                const tool = doc.tool as Record<string, unknown> | undefined;
                const poetry = tool?.poetry as Record<string, unknown> | undefined;
                if (poetry) {
                    poetry.version = newVersion;
                }
            }

            // Serialise back. smol-toml doesn't guarantee identity-preserving
            // serialisation, so we do a targeted regex replacement to keep
            // comments / formatting intact.
            const updated = raw.replace(
                /^(version\s*=\s*)"[^"]*"/m,
                (_, prefix) => `${prefix}"${newVersion}"`,
            );
            writeFileSync(tomlPath, updated, 'utf-8');
            return;
        }

        const cfgPath = `${projectRoot}/setup.cfg`;
        if (existsSync(cfgPath)) {
            const raw = readFileSync(cfgPath, 'utf-8');
            const updated = raw.replace(
                /^(version\s*=\s*).+$/m,
                (_, prefix) => `${prefix}${newVersion}`,
            );
            writeFileSync(cfgPath, updated, 'utf-8');
            return;
        }

        const verPath = `${projectRoot}/VERSION`;
        writeFileSync(verPath, `${newVersion}\n`, 'utf-8');
    },
};
