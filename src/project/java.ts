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
 * Java (Gradle) project adapter.
 *
 * Version sources (checked in order):
 *  1. `gradle.properties` — `version=1.2.3`
 *  2. `build.gradle` / `build.gradle.kts` — `version = '1.2.3'`
 *
 * For Maven-based Java projects use the `maven` adapter instead.
 */
export const javaAdapter: ProjectAdapter = {
    name: 'Java (Gradle)',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        const {existsSync} = await import('node:fs');
        const files: string[] = [];

        const gradleProps = `${projectRoot}/gradle.properties`;
        if (existsSync(gradleProps)) {
            files.push(gradleProps);
        }

        const buildGradle = `${projectRoot}/build.gradle`;
        if (existsSync(buildGradle)) {
            files.push(buildGradle);
        }

        const buildGradleKts = `${projectRoot}/build.gradle.kts`;
        if (existsSync(buildGradleKts)) {
            files.push(buildGradleKts);
        }

        return files;
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        const {readFileSync, existsSync} = await import('node:fs');

        // 1. gradle.properties
        const propsPath = `${projectRoot}/gradle.properties`;
        if (existsSync(propsPath)) {
            try {
                const raw = readFileSync(propsPath, 'utf-8');
                const match = raw.match(/^version\s*=\s*(.+)$/m);
                if (match) {
                    return match[1].trim();
                }
            } catch {
                /* fall through */
            }
        }

        // 2. build.gradle or build.gradle.kts
        const gradleFiles = [`${projectRoot}/build.gradle`, `${projectRoot}/build.gradle.kts`];
        for (const gf of gradleFiles) {
            if (existsSync(gf)) {
                try {
                    const raw = readFileSync(gf, 'utf-8');
                    const match = raw.match(/version\s*=\s*['"]([^'"]+)['"]/);
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

        const propsPath = `${projectRoot}/gradle.properties`;
        if (existsSync(propsPath)) {
            const raw = readFileSync(propsPath, 'utf-8');
            const updated = raw.replace(
                /^(version\s*=\s*).+$/m,
                (_, prefix) => `${prefix}${newVersion}`,
            );
            writeFileSync(propsPath, updated, 'utf-8');
            return;
        }

        const gradleFiles = [`${projectRoot}/build.gradle`, `${projectRoot}/build.gradle.kts`];
        for (const gf of gradleFiles) {
            if (existsSync(gf)) {
                const raw = readFileSync(gf, 'utf-8');
                const updated = raw.replace(
                    /(version\s*=\s*)['"][^'"]+['"]/,
                    (_, prefix) => `${prefix}'${newVersion}'`,
                );
                writeFileSync(gf, updated, 'utf-8');
                return;
            }
        }
    },
};
