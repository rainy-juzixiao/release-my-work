#!/usr/bin/env node

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

import {Command} from 'commander';
import chalk from 'chalk';
import {scanGitHistory, openGit} from '#@/git';
import {computeNextVersion, buildVersionCommitMessage} from '#@/version';
import {createPullRequest} from '#@/github';

const program = new Command();

program
    .name('release-my-work')
    .description('Scan git history for Conventional Commits, bump version, and create a GitHub Pull Request')
    .version('1.0.0');

program
    .command('scan')
    .description('Scan git history and show conventional commits since the latest tag')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('-n, --max-count <number>', 'Maximum number of commits to scan', parseInt)
    .action(async (options) => {
        try {
            const result = await scanGitHistory({
                repoPath: options.path,
                maxCount: options.maxCount,
            });

            const repoPath = options.path !== undefined && options.path !== null && options.path !== ''
                ? options.path
                : process.cwd();
            console.log(chalk.bold(`\nRepository: ${repoPath}`));
            console.log(chalk.bold(`Branch: ${result.currentBranch}`));
            console.log(chalk.bold(`Latest tag: ${result.latestTag ?? '(none)'}`));
            console.log(chalk.bold(`Conventional commits found: ${result.commits.length}\n`));

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
            console.log();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('Error:'), errorMessage);
            process.exit(1);
        }
    });

program
    .command('bump')
    .description('Compute the next version based on conventional commits since the latest tag')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('--dry-run', 'Show what would happen without making changes')
    .action(async (options) => {
        try {
            const result = await scanGitHistory({repoPath: options.path});

            if (result.latestTag === undefined || result.latestTag === null || result.latestTag === '') {
                console.log(chalk.yellow('No semver tag found — treating as initial release.'));
            }

            const next = computeNextVersion(result.latestTag, result.commits);

            if (next === undefined || next === null) {
                console.log(chalk.dim('\nNo conventional commits found that warrant a version bump.'));
                console.log(chalk.dim('Tip: use "feat:", "fix:", or include "BREAKING CHANGE" in commit messages.\n'));
                return;
            }

            const from = result.latestTag !== undefined && result.latestTag !== null && result.latestTag !== ''
                ? result.latestTag
                : 'initial';
            console.log(chalk.bold(`\n${from} → ${chalk.green(next.newVersion)} (${next.bump})\n`));

            for (const c of next.commits) {
                const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                    ? chalk.dim(`(${c.scope})`)
                    : '';
                const breaking = c.breaking ? chalk.red.bold('!') : '';
                console.log(`  ${chalk.dim(c.hash.slice(0, 7))} ${c.type}${scope}${breaking}: ${c.description}`);
            }
            console.log();

            if (options.dryRun === undefined || options.dryRun === null || options.dryRun === false) {
                const git = openGit(options.path);
                const msg = buildVersionCommitMessage(next.newVersion, next.bump);

                // Tag and commit
                await git.add('.');
                await git.commit(msg);
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
    });

program
    .command('pr')
    .description('Create a GitHub Pull Request for the release')
    .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
    .requiredOption('-r, --repo <repo>', 'GitHub repository name')
    .option('-t, --token <token>', 'GitHub token (defaults to GITHUB_TOKEN env)')
    .option('-b, --base <branch>', 'Target branch (default: main)', 'main')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .action(async (options) => {
        try {
            const git = openGit(options.path);
            const currentBranch = (await git.branch()).current;

            const result = await scanGitHistory({repoPath: options.path});
            const next = computeNextVersion(result.latestTag, result.commits);

            const title = next
                ? `chore(release): ${next.newVersion}`
                : `chore(release): manual release`;

            const commitList = (next !== undefined && next !== null ? next.commits : result.commits)
                .map(c => {
                    const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                        ? `(${c.scope})`
                        : '';
                    return `- ${c.type}${scope}: ${c.description}`;
                })
                .join('\n');

            const body = [
                `## ${next?.newVersion ?? 'Release'}\n`,
                commitList,
                '',
                '---',
                'This Request Generated by release-my-work',
            ].join('\n');

            const pr = await createPullRequest({
                token: options.token,
                owner: options.owner,
                repo: options.repo,
                head: currentBranch,
                base: options.base,
                title,
                body,
            });

            console.log(chalk.green(`\nPull Request created: ${chalk.underline(pr.url)}\n`));
        } catch (err: unknown) {
            console.error(chalk.red('Error:'), (err as Error).message);
            process.exit(1);
        }
    });

program
    .command('auto')
    .description('Run bump + PR in one go (bump version, push, create pull request)')
    .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
    .requiredOption('-r, --repo <repo>', 'GitHub repository name')
    .option('-t, --token <token>', 'GitHub token (defaults to GITHUB_TOKEN env)')
    .option('-b, --base <branch>', 'Target branch (default: main)', 'main')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('--dry-run', 'Show what would happen without making changes')
    .action(async (options) => {
        try {
            const result = await scanGitHistory({repoPath: options.path});
            const next = computeNextVersion(result.latestTag, result.commits);

            if (next === null || next === undefined) {
                console.log(chalk.yellow('\nNo version bump warranted. Nothing to release.\n'));
                return;
            }

            const from = result.latestTag !== undefined && result.latestTag !== null && result.latestTag !== ''
                ? result.latestTag
                : 'initial';
            console.log(chalk.bold(`\n📦 ${from} → ${chalk.green(next.newVersion)} (${next.bump})`));

            if (options.dryRun === true) {
                console.log(chalk.dim('\n(dry-run — stopping before commit & PR)\n'));
                return;
            }

            const git = openGit(options.path);
            const msg = buildVersionCommitMessage(next.newVersion, next.bump);

            await git.add('.');
            await git.commit(msg);
            await git.addTag(`v${next.newVersion}`);
            console.log(chalk.green(`Committed and tagged v${next.newVersion}`));

            await git.push('origin', result.currentBranch);
            await git.pushTags('origin');
            console.log(chalk.green(`Pushed ${result.currentBranch} and tags`));

            const commitList = next.commits
                .map(c => {
                    const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                        ? `(${c.scope})`
                        : '';
                    return `- ${c.type}${scope}: ${c.description}`;
                })
                .join('\n');

            const body = [
                `## ${next.newVersion}\n`,
                commitList,
                '',
                '---',
                'This Request Generated by release-my-work',
            ].join('\n');

            const pr = await createPullRequest({
                token: options.token,
                owner: options.owner,
                repo: options.repo,
                head: result.currentBranch,
                base: options.base,
                title: msg.split('\n')[0],
                body,
            });
            console.log(chalk.green(`Pull Request created: ${chalk.underline(pr.url)}\n`));
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('Error:'), errorMessage);
            process.exit(1);
        }
    });

program.parse(process.argv);
