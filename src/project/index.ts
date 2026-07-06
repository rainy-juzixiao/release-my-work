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

import {type ProjectAdapter, type ReleaseType} from './types.js';
import {nodeAdapter} from './node.js';
import {pythonAdapter} from './python.js';
import {rustAdapter} from './rust.js';
import {goAdapter} from './go.js';
import {javaAdapter} from './java.js';
import {mavenAdapter} from './maven.js';
import {phpAdapter} from './php.js';
import {rubyAdapter} from './ruby.js';
import {dartAdapter} from './dart.js';
import {simpleAdapter} from './simple.js';

export type {ProjectAdapter, ReleaseType} from './types.js';

/**
 * Registry mapping each release-type name to its ProjectAdapter.
 */
const registry: Record<ReleaseType, ProjectAdapter> = {
    node: nodeAdapter,
    python: pythonAdapter,
    rust: rustAdapter,
    go: goAdapter,
    java: javaAdapter,
    maven: mavenAdapter,
    php: phpAdapter,
    ruby: rubyAdapter,
    dart: dartAdapter,
    simple: simpleAdapter,
};

/** All supported release-type keys */
export const RELEASE_TYPES = Object.keys(registry) as ReleaseType[];

/**
 * Resolve a release-type string to its ProjectAdapter.
 *
 * @param releaseType  One of the built-in type names (case-insensitive).
 * @returns The matching adapter.
 * @throws {Error} If the type is unknown.
 */
export function getAdapter(releaseType: string): ProjectAdapter {
    const key = releaseType.toLowerCase() as ReleaseType;
    const adapter = registry[key];
    if (adapter === undefined) {
        throw new Error(
            `Unknown releaseType "${releaseType}". ` +
            `Supported types: ${RELEASE_TYPES.join(', ')}`,
        );
    }
    return adapter;
}

export {
    nodeAdapter,
    pythonAdapter,
    rustAdapter,
    goAdapter,
    javaAdapter,
    mavenAdapter,
    phpAdapter,
    rubyAdapter,
    dartAdapter,
    simpleAdapter,
};
