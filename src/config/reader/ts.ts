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
import { deepMerge } from '#@/utils/deep-merge.js';
import { defaultConfig, type ReleaseConfig } from '../definitions.js';

/**
 * Load a TypeScript (`.ts`) configuration file and merge it with defaults.
 *
 * The file is loaded via dynamic `import()`.  For this to work at runtime
 * the caller must have a TypeScript loader registered (e.g. `tsx`).
 *
 * The module can use `export default` or named exports.  If the module has
 * both a default export and named exports, the named exports take precedence
 * when the default is not a plain object.
 *
 * @param tsPath  Path to the TS file on disk.
 * @returns A promise resolving to a complete `ReleaseConfig`.
 */
export async function loadConfigFromTs(tsPath: string): Promise<ReleaseConfig> {
    try {
        const mod = await import(tsPath);
        const exported = (mod.default ?? mod) as Partial<ReleaseConfig>;

        return deepMerge(defaultConfig, exported);
    } catch (error: unknown) {
        console.error(`Error loading TS config from ${tsPath}`);
        throw error;
    }
}
