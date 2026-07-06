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
 * Rust / Cargo project adapter.
 *
 * Version is stored in `Cargo.toml` under `[package] version = "..."`.
 */
export const rustAdapter: ProjectAdapter = {
    name: 'Rust',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        return [`${projectRoot}/Cargo.toml`];
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        const {readFileSync, existsSync} = await import('node:fs');
        const path = `${projectRoot}/Cargo.toml`;
        if (!existsSync(path)) {
            return null;
        }

        try {
            const raw = readFileSync(path, 'utf-8');
            const {parse: parseToml} = await import('smol-toml');
            const doc = parseToml(raw) as Record<string, unknown>;
            const pkg = doc.package as Record<string, unknown> | undefined;
            if (pkg?.version !== undefined && typeof pkg.version === 'string') {
                return pkg.version;
            }
            return null;
        } catch {
            return null;
        }
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync, existsSync} = await import('node:fs');
        const path = `${projectRoot}/Cargo.toml`;
        if (!existsSync(path)) {
            return;
        }

        const raw = readFileSync(path, 'utf-8');
        // Regex replacement preserves comments and formatting around the
        // `version = "…"` field inside the `[package]` section.
        const updated = raw.replace(
            /^(\[package\]\s*(?:\n(?!\[).*)*?\n)(\s*version\s*=\s*)"[^"]*"/,
            (_, section, prefix) => `${section}${prefix}"${newVersion}"`,
        );
        writeFileSync(path, updated, 'utf-8');
    },
};
