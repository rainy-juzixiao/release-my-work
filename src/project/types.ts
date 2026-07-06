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

/**
 * A ProjectAdapter knows how to discover, read, and write version information
 * for a specific programming language / ecosystem.
 *
 * Each adapter is registered under a unique name (e.g. "node", "rust", "maven")
 * and is looked up by `config.releaseType`.
 */
export interface ProjectAdapter {
    /** Display name (e.g. "Node.js") */
    readonly name: string;

    /**
     * Return the list of files (relative to project root) that hold the
     * canonical version.  Used by `git add` / `git commit` to stage exactly
     * the right files instead of `git add('.')`.
     */
    getVersionFiles(projectRoot: string): Promise<string[]>;

    /**
     * Read the current version string from the project files.
     * Returns `null` when no recognised version source is found.
     */
    readVersion(projectRoot: string): Promise<string | null>;

    /**
     * Write `newVersion` into every file returned by `getVersionFiles()`.
     */
    writeVersion(projectRoot: string, newVersion: string): Promise<void>;
}

/** All built-in release-type identifiers */
export type ReleaseType =
    | 'node'
    | 'python'
    | 'rust'
    | 'go'
    | 'java'
    | 'maven'
    | 'php'
    | 'ruby'
    | 'dart'
    | 'simple';
