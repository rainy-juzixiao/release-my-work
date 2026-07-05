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
import * as fs from 'node:fs';
import { parse } from 'smol-toml';

import { deepMerge } from '#@/utils/deep-merge.js';
import { defaultConfig, type ReleaseConfig } from '#@/config';

/**
 * Load a TOML configuration file and merge it with the built-in defaults.
 *
 * @param tomlPath  Path to the TOML file on disk.
 * @returns A complete `ReleaseConfig` with TOML overrides applied.
 */
export function loadConfigFromToml(tomlPath: string): ReleaseConfig {
    try {
        const fileContent = fs.readFileSync(tomlPath, 'utf-8');

        const tomlConfig = parse(fileContent) as unknown as Partial<ReleaseConfig>;

        return deepMerge(defaultConfig, tomlConfig);
    } catch (error: unknown) {
        console.error(`Error loading TOML config from ${tomlPath}`);
        throw error;
    }
}
