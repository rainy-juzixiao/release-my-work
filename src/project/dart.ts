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
 * Dart / Flutter project adapter.
 *
 * Version is stored in `pubspec.yaml` as:
 *   version: 1.2.3
 *
 * Dart pubspec also allows build metadata (`+1`) and pre-release suffixes,
 * but the pure semver part is what we manage.
 */
export const dartAdapter: ProjectAdapter = {
    name: 'Dart',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        return [`${projectRoot}/pubspec.yaml`];
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        const {readFileSync, existsSync} = await import('node:fs');
        const path = `${projectRoot}/pubspec.yaml`;
        if (!existsSync(path)) {
            return null;
        }

        try {
            const raw = readFileSync(path, 'utf-8');
            const match = raw.match(/^version:\s*(.+)$/m);
            if (match) {
                // Strip build metadata (e.g. "1.2.3+1" → "1.2.3")
                return match[1].trim().split('+')[0];
            }
            return null;
        } catch {
            return null;
        }
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync, existsSync} = await import('node:fs');
        const path = `${projectRoot}/pubspec.yaml`;
        if (!existsSync(path)) {
            return;
        }

        const raw = readFileSync(path, 'utf-8');
        // Preserve build metadata (+N suffix) if present
        const existingMatch = raw.match(/^version:\s*(.+)$/m);
        let suffix = '';
        if (existingMatch) {
            const parts = existingMatch[1].trim().split('+');
            if (parts.length > 1) {
                suffix = `+${parts.slice(1).join('+')}`;
            }
        }

        const updated = raw.replace(
            /^version:\s*.+$/m,
            `version: ${newVersion}${suffix}`,
        );
        writeFileSync(path, updated, 'utf-8');
    },
};
