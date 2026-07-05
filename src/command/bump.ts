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
import {scanGitHistory, openGit} from '#@/git';
import {computeNextVersion, buildVersionCommitMessage} from '#@/version';
import {defaultConfig} from '#@/config/index.js';
import {resolveConfig} from '#@/utils/resolve-config.js';

export interface BumpOptions {
    configPath?: string;
    path?: string;
    dryRun?: boolean;
}

export async function bumpAction(options: BumpOptions): Promise<void> {
    try {
        let cfg = await resolveConfig(options.configPath);

        if (cfg != null) {
            console.log(`Successfully loaded config: ${options.configPath}`);
        } else {
            console.log(chalk.yellow('Warning: use default config'));
            cfg = defaultConfig;
        }

        const result = await scanGitHistory({repoPath: options.path});

        if (result.latestTag === undefined || result.latestTag === null || result.latestTag === '') {
            console.log(chalk.yellow('No semver tag found — treating as initial release.'));
        }

        // TODO: Config — Use cfg.releaseAs to override computed version,
        //       cfg.prerelease / cfg.prereleaseType for prerelease suffix,
        //       cfg.versioning for version strategy, cfg.releaseType for
        //       project-type-specific logic (e.g. node vs ruby vs java).
        const next = computeNextVersion(result.latestTag, result.commits);

        if (next === undefined || next === null) {
            console.log(chalk.dim('\nNo conventional commits found that warrant a version bump.'));
            console.log(chalk.dim('Tip: use "feat:", "fix:", or include "BREAKING CHANGE" in commit messages.\n'));
            return;
        }

        const from = result.latestTag !== undefined && result.latestTag !== null && result.latestTag !== ''
            ? result.latestTag
            : 'initial';
        console.log(chalk.bold(`${from} → ${chalk.green(next.newVersion)} (${next.bump})\n`));

        for (const c of next.commits) {
            const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                ? chalk.dim(`(${c.scope})`)
                : '';
            const breaking = c.breaking ? chalk.red.bold('!') : '';
            console.log(`  ${chalk.dim(c.hash.slice(0, 7))} ${c.type}${scope}${breaking}: ${c.description}`);
        }
        console.log();

        if (options.dryRun === undefined || options.dryRun === null || !options.dryRun) {
            const git = openGit(options.path);
            const msg = buildVersionCommitMessage(next.newVersion, next.bump);

            // TODO: Config — Use cfg.extraFiles to version-bump additional
            //       files alongside the default package.json (e.g. VERSION, Cargo.toml).
            await git.add('.');

            // TODO: Config — Use cfg.github.signoff to add Signed-off-by
            //       trailer to the commit message when non-empty.
            await git.commit(msg);

            // TODO: Config — Use cfg.includeVInTag to control 'v' prefix;
            //       when false, tag as next.newVersion instead of v${next.newVersion}.
            await git.addTag(`v${next.newVersion}`);

            console.log(chalk.green(`Committed and tagged v${next.newVersion}\n`));
        } else {
            console.log(chalk.dim('(dry-run — no changes made)\n'));
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(chalk.red('Error:'), errorMessage);
        process.exit(1);
    }
}
