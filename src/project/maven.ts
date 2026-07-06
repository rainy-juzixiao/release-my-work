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
 * Maven project adapter.
 *
 * Version is stored in `pom.xml` as:
 *   <project>
 *     <version>1.2.3</version>
 *     ...
 *   </project>
 *
 * NOTE: This uses simple regex because the `version` element inside
 * `<project>` at the top level is what Maven treats as the project
 * version.  For multi-module builds that use `<parent>`, the child's
 * `<parent><version>` may differ — this adapter targets the top-level
 * `<project><version>` only.
 */
export const mavenAdapter: ProjectAdapter = {
    name: 'Maven',

    async getVersionFiles(projectRoot: string): Promise<string[]> {
        return [`${projectRoot}/pom.xml`];
    },

    async readVersion(projectRoot: string): Promise<string | null> {
        const {readFileSync, existsSync} = await import('node:fs');
        const path = `${projectRoot}/pom.xml`;
        if (!existsSync(path)) {return null;}

        try {
            const raw = readFileSync(path, 'utf-8');
            // Match <version> directly under <project> (ignoring parent/child
            // sections by matching the first bare <version> that appears after
            // <groupId>/<artifactId> in the project header).
            const match = raw.match(
                /<project[\s>][\s\S]*?<groupId>.*?<\/groupId>\s*<artifactId>.*?<\/artifactId>\s*<version>([^<]+)<\/version>/,
            );
            return match?.[1]?.trim() ?? null;
        } catch {
            return null;
        }
    },

    async writeVersion(projectRoot: string, newVersion: string): Promise<void> {
        const {readFileSync, writeFileSync, existsSync} = await import('node:fs');
        const path = `${projectRoot}/pom.xml`;
        if (!existsSync(path)) {return;}

        const raw = readFileSync(path, 'utf-8');
        // Replace the first <version> that appears right after <artifactId>
        // (the project version, not a dependency version).
        const updated = raw.replace(
            /(<artifactId>.*?<\/artifactId>\s*<version>)[^<]+(<\/version>)/,
            (_, prefix, suffix) => `${prefix}${newVersion}${suffix}`,
        );
        writeFileSync(path, updated, 'utf-8');
    },
};
