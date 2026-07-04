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
import * as path from 'node:path';

import type { ReleaseConfig } from '../definitions.js';

import { loadConfigFromYaml } from './yaml.js';
import { loadConfigFromJson } from './json.js';
import { loadConfigFromToml } from './toml.js';
import { loadConfigFromJs } from './js.js';
import { loadConfigFromMjs } from './mjs.js';
import { loadConfigFromTs } from './ts.js';

export {
    loadConfigFromYaml,
    loadConfigFromJson,
    loadConfigFromToml,
    loadConfigFromJs,
    loadConfigFromMjs,
    loadConfigFromTs,
};

// ---------------------------------------------------------------------------
// Unified auto-detection
// ---------------------------------------------------------------------------

const SYNC_FORMATS = new Set(['.yaml', '.yml', '.json', '.toml', '.js', '.cjs']);
const ASYNC_FORMATS = new Set(['.mjs', '.ts']);

/**
 * Auto-detect the config file format by extension and load it **synchronously**.
 *
 * Supported formats: YAML (`.yaml`/`.yml`), JSON (`.json`), TOML (`.toml`),
 * CommonJS (`.js`/`.cjs`).
 *
 * For `.mjs` and `.ts` files use {@link loadConfigAsync} instead.
 *
 * @throws If the extension is unsupported or belongs to an async-only format.
 */
export function loadConfig(configPath: string): ReleaseConfig {
    const ext = path.extname(configPath).toLowerCase();

    if (!SYNC_FORMATS.has(ext) && !ASYNC_FORMATS.has(ext)) {
        throw new Error(
            `Unsupported config format: "${ext}". ` +
            `Supported: yaml, json, toml, js, mjs, ts`,
        );
    }

    switch (ext) {
        case '.yaml':
        case '.yml':
            return loadConfigFromYaml(configPath);

        case '.json':
            return loadConfigFromJson(configPath);

        case '.toml':
            return loadConfigFromToml(configPath);

        case '.js':
        case '.cjs':
            return loadConfigFromJs(configPath);

        default: {
            // .mjs / .ts – require async
            throw new Error(
                `Format "${ext}" requires async loading; ` +
                `use loadConfigAsync("${configPath}") instead.`,
            );
        }
    }
}

/**
 * Auto-detect the config file format by extension and load it **asynchronously**.
 *
 * Supports all formats: YAML, JSON, TOML, JS/CJS, MJS, TS.
 */
export async function loadConfigAsync(configPath: string): Promise<ReleaseConfig> {
    const ext = path.extname(configPath).toLowerCase();

    switch (ext) {
        case '.yaml':
        case '.yml':
            return loadConfigFromYaml(configPath);

        case '.json':
            return loadConfigFromJson(configPath);

        case '.toml':
            return loadConfigFromToml(configPath);

        case '.js':
        case '.cjs':
            return loadConfigFromJs(configPath);

        case '.mjs':
            return loadConfigFromMjs(configPath);

        case '.ts':
            return loadConfigFromTs(configPath);

        default:
            throw new Error(
                `Unsupported config format: "${ext}". ` +
                `Supported: yaml, json, toml, js, mjs, ts`,
            );
    }
}
