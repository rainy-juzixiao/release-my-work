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
 * IMPLIED, INCLUDING NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import {Command} from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import {scanGitHistory, openGit} from '#@/git';
import {computeNextVersion, buildVersionCommitMessage} from '#@/version';
import {createPullRequest, findPullRequest, updatePullRequest, parseGitHubRemote} from '#@/github';

const program = new Command();

program
    .name('release-my-work')
    .description('Scan git history for Conventional Commits, bump version, and create GitHub Pull Requests')
    .version('1.0.0');

// ─── scan ───────────────────────────────────────────────────────────────────
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
            console.log(chalk.bold(`Repository: ${repoPath}`));
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

// ─── bump ───────────────────────────────────────────────────────────────────
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
            console.log(chalk.bold(`${from} → ${chalk.green(next.newVersion)} (${next.bump})\n`));

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

// ─── pr ─────────────────────────────────────────────────────────────────────
program
    .command('pr')
    .description('Create a GitHub Pull Request for the release')
    .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
    .requiredOption('-r, --repo <repo>', 'GitHub repository name')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
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
                : 'chore(release): manual release';

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

            console.log(chalk.green(`Pull Request created: ${chalk.underline(pr.url)}`));
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('Error:'), errorMessage);
            process.exit(1);
        }
    });

// ─── release-pr ─────────────────────────────────────────────────────────────
program
    .command('release-pr')
    .description('Create or update a release Pull Request (CI-friendly)')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('-o, --owner <owner>', 'GitHub owner (parsed from git remote if omitted)')
    .option('-r, --repo <repo>', 'GitHub repo name (parsed from git remote if omitted)')
    .option('--base <branch>', 'Target branch (default: main)', 'main')
    .action(async (options) => {
        const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
        if (token === undefined || token === null || token === '') {
            console.error(chalk.red('Error:'), 'GH_TOKEN or GITHUB_TOKEN environment variable is required.');
            process.exit(1);
        }

        try {
            const git = openGit(options.path);

            // ── Resolve owner/repo from git remote ──
            let owner = options.owner;
            let repo = options.repo;
            if (!owner || !repo) {
                const remotes = await git.getRemotes(true);
                const origin = remotes.find(r => r.name === 'origin');
                if (!origin) {
                    console.error(chalk.red('Error:'), 'No git remote "origin" found.');
                    process.exit(1);
                }
                const parsed = parseGitHubRemote(origin.refs.push || origin.refs.fetch);
                owner = parsed.owner;
                repo = parsed.repo;
            }

            // ── 1. Scan conventional commits ──
            console.log(chalk.dim('Scanning git history...'));
            const result = await scanGitHistory({repoPath: options.path});
            const skipBump = result.latestTag === null || result.latestTag === '';

            const next = computeNextVersion(result.latestTag, result.commits);
            if (next === null || next === undefined) {
                console.log(chalk.dim('No version bump warranted. Nothing to release.'));
                return;
            }

            const ver = next.newVersion;
            const branchName = `release/${ver}`;

            // ── 2. Check for existing PR ──
            console.log(chalk.dim(`Checking existing PR for ${branchName}...`));
            const existingPr = await findPullRequest(owner, repo, branchName, token);

            if (existingPr !== null && existingPr !== undefined) {
                if (existingPr.state === 'closed' || existingPr.state === 'merged') {
                    console.log(chalk.yellow(`PR #${existingPr.number} for ${branchName} is already ${existingPr.state}. Skipping.`));
                    return;
                }
                console.log(chalk.dim(`Found open PR #${existingPr.number}. Will update.`));
            }

            // ── 3. Build PR content ──
            const commitLog = result.commits
                .map(c => {
                    const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                        ? `(${c.scope})`
                        : '';
                    const breaking = c.breaking ? '!' : '';
                    return `- ${c.type}${scope}${breaking}: ${c.description}`;
                })
                .join('\n');

            const prBody = `## ${ver}\n\n### Changelog\n\n${commitLog}\n\n---\nThis pull request was created by \`release-my-work\`.\n\n:warning: **After approval and merge**, the publish workflow will automatically create the git tag \`v${ver}\` and a GitHub Release.`;

            // ── 4. Set up git remote with token for auth ──
            const remotes = await git.getRemotes(true);
            const originRemote = remotes.find(r => r.name === 'origin');
            if (originRemote) {
                const pushUrl = originRemote.refs.push || originRemote.refs.fetch;
                const authedUrl = pushUrl.replace(
                    'https://',
                    `https://x-access-token:${token}@`,
                );
                if (authedUrl !== pushUrl) {
                    await git.remote(['set-url', 'origin', authedUrl]);
                }
            }

            // ── 5. Create / update release branch ──
            // Create branch from the current HEAD
            const currentBranch = (await git.branch()).current;
            try {
                await git.branch(['-D', branchName]);
            } catch {
                // branch doesn't exist locally — fine
            }
            await git.checkoutLocalBranch(branchName);

            // Update package.json version
            const pkgPath = `${options.path ?? process.cwd()}/package.json`;
            const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
            const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
            pkg.version = ver;
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

            await git.add('package.json');
            await git.commit(`chore(release): ${ver}`);

            // ── 6. Push branch ──
            console.log(chalk.dim(`Pushing ${branchName}...`));
            await git.push('origin', branchName, ['--force-with-lease']);

            // ── 7. Create or update PR ──
            const title = `chore(release): ${ver}`;

            if (existingPr !== null && existingPr !== undefined) {
                const updated = await updatePullRequest(owner, repo, existingPr.number, title, prBody, token);
                console.log(chalk.green(`Updated PR #${updated.number}: ${chalk.underline(updated.url)}`));
            } else {
                const created = await createPullRequest({
                    token,
                    owner,
                    repo,
                    head: branchName,
                    base: options.base,
                    title,
                    body: prBody,
                });
                console.log(chalk.green(`Created PR #${created.number}: ${chalk.underline(created.url)}`));
            }

            // Restore original branch
            try { await git.checkout(currentBranch); } catch { /* ok */ }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('Error:'), errorMessage);
            process.exit(1);
        }
    });

// ─── auto ───────────────────────────────────────────────────────────────────
program
    .command('auto')
    .description('Run bump + PR in one go (bump version, push, create pull request)')
    .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
    .requiredOption('-r, --repo <repo>', 'GitHub repository name')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
    .option('-b, --base <branch>', 'Target branch (default: main)', 'main')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('--dry-run', 'Show what would happen without making changes')
    .action(async (options) => {
        try {
            const result = await scanGitHistory({repoPath: options.path});
            const next = computeNextVersion(result.latestTag, result.commits);

            if (!next) {
                console.log(chalk.yellow('No version bump warranted. Nothing to release.'));
                return;
            }

            const from = result.latestTag ?? 'initial';
            console.log(chalk.bold(`${from} → ${chalk.green(next.newVersion)} (${next.bump})`));

            if (options.dryRun) {
                console.log(chalk.dim('(dry-run — stopping before commit & PR)\n'));
                return;
            }

            const git = openGit(options.path);
            const msg = buildVersionCommitMessage(next.newVersion, next.bump);

            // Set remote auth if token is provided
            const token = options.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
            if (token) {
                const remotes = await git.getRemotes(true);
                const origin = remotes.find(r => r.name === 'origin');
                if (origin) {
                    const pushUrl = origin.refs.push || origin.refs.fetch;
                    const authedUrl = pushUrl.replace('https://', `https://x-access-token:${token}@`);
                    if (authedUrl !== pushUrl) {
                        await git.remote(['set-url', 'origin', authedUrl]);
                    }
                }
            }

            await git.add('.');
            await git.commit(msg);
            await git.addTag(`v${next.newVersion}`);

            await git.push('origin', result.currentBranch);
            await git.pushTags('origin');

            const commitList = next.commits
                .map(c => {
                    const scope = c.scope ? `(${c.scope})` : '';
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

            console.log(chalk.green(`Pull Request created: ${chalk.underline(pr.url)}`));
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('Error:'), errorMessage);
            process.exit(1);
        }
    });

program.parse(process.argv);
