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

import chalk from 'chalk';
import {scanGitHistory} from '#@/git';
import {defaultConfig} from '#@/config/index.js';
import {resolveConfig} from '#@/utils/resolve-config.js';

export interface ScanOptions {
    configPath?: string;
    path?: string;
    maxCount?: number;
}

export async function scanAction(options: ScanOptions): Promise<void> {
    try {
        let cfg = await resolveConfig(options.configPath);

        if (cfg != null) {
            console.log(`Successfully loaded config: ${options.configPath}`);
        } else {
            console.log(chalk.yellow('Warning: use default config'));
            cfg = defaultConfig;
        }

        const result = await scanGitHistory({
            repoPath: options.path,
            maxCount: options.maxCount,
        });

        const repoPath = options.path !== undefined && options.path !== null && options.path !== ''
            ? options.path
            : process.cwd();
        console.log(chalk.bold(`Repository: ${repoPath}`));
        console.log(chalk.bold(`Branch: ${result.currentBranch}`));
        console.log(chalk.bold(`Latest tag: ${result.latestTag ?? '(none)'}`));
        console.log(chalk.bold(`Conventional commits found: ${result.commits.length}\n`));

        {
            console.log();

            console.log(`release-search-depth ${cfg.releaseSearchDepth}`);
            console.log(`commit-search-depth ${cfg.commitSearchDepth}`);
            console.log(`sequential-calls ${cfg.sequentialCalls}`);

            console.log();
        }

        if (result.commits.length == 0) {
            console.log("There is no new commit history detected.");
        } else {
            console.log("Scan Commit history");

            for (const c of result.commits) {
                const color = c.breaking
                    ? 'red'
                    : c.type === 'feat'
                        ? 'green'
                        : c.type === 'fix'
                            ? 'yellow'
                            : 'dim';
                const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                    ? chalk.dim(`(${c.scope})`)
                    : '';
                const breaking = c.breaking ? chalk.red.bold('!') : '';
                console.log(
                    `  ${chalk.dim(c.hash.slice(0, 7))} ` +
                    `${chalk[color](c.type)}${scope}${breaking}: ${c.description}`
                );
            }
        }

        console.log();
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(chalk.red('Error:'), errorMessage);
        process.exit(1);
    }
}
