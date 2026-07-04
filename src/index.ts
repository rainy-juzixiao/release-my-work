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
import semver from 'semver';
import {scanGitHistory, openGit} from '#@/git';
import {computeNextVersion, buildVersionCommitMessage, recommendBump} from '#@/version';
import {createPullRequest, findPullRequest, updatePullRequest, parseGitHubRemote, createClient} from '#@/github';
import {parseCommit} from '#@/conventional';
import {defaultConfig, loadConfigAsync, type ReleaseConfig} from '#@/config/index.js';

/**
 * Load the user config file when --config-path is provided.
 * Returns `null` if no path is given, giving the caller full fallback control.
 */
async function resolveConfig(configPath: string | undefined): Promise<ReleaseConfig | null> {
    if (configPath === undefined || configPath === null || configPath === '') {
        return null;
    }
    return loadConfigAsync(configPath);
}

// TODO: PR — Merge user config with CLI flags in every command
//       Once resolved, the config should be merged with command options.
//       CLI flags take precedence over file config.

const program = new Command();

program
    .name('release-my-work')
    .description('Scan git history for Conventional Commits, bump version, and create GitHub Pull Requests')
    .version('1.0.0');

program
    .command('scan')
    .description('Scan git history and show conventional commits since the latest tag')
    .option('-c, --config-path <path>', 'Path to config file')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('-n, --max-count <number>', 'Maximum number of commits to scan', parseInt)
    .action(async (options) => {
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
    });

program
    .command('bump')
    .description('Compute the next version based on conventional commits since the latest tag')
    .option('-c, --config-path <path>', 'Path to config file')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('--dry-run', 'Show what would happen without making changes')
    .action(async (options) => {
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

program
    .command('pr')
    .description('Create a GitHub Pull Request for the release')
    .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
    .requiredOption('-r, --repo <repo>', 'GitHub repository name')
    .option('-c, --config-path <path>', 'Path to config file')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
    .option('-b, --base <branch>', 'Target branch (default: main)', 'main')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .action(async (options) => {
        try {
            let cfg = await resolveConfig(options.configPath);

            if (cfg != null) {
                console.log(`Successfully loaded config: ${options.configPath}`);
            } else {
                console.log(chalk.yellow('Warning: use default config'));
                cfg = defaultConfig;
            }

            const git = openGit(options.path);
            const currentBranch = (await git.branch()).current;

            const result = await scanGitHistory({repoPath: options.path});
            const next = computeNextVersion(result.latestTag, result.commits);

            const title = next
                ? `chore(release): ${next.newVersion}`
                : 'chore(release): manual release';
            // TODO: PR — Use pullRequestConfig for title templating
            //       Replace hardcoded title with pullRequestConfig.titlePattern:
            //         titlePattern = "chore${scope}: release${component} ${version}"
            //         → "chore(release): 1.2.3"
            //       Template vars: ${scope}, ${component}, ${version}

            const commitList = (next !== undefined && next !== null ? next.commits : result.commits)
                .map(c => {
                    const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                        ? `(${c.scope})`
                        : '';
                    return `- ${c.type}${scope}: ${c.description}`;
                })
                .join('\n');

            // TODO: PR — Use pullRequestConfig.header/body/footer for body
            //       Currently the body is hardcoded.  Planned:
            //         body = pullRequestConfig.header
            //              + commitList
            //              + pullRequestConfig.footer
            //       header/footer support template interpolation (${version}, etc.).
            const body = [
                `## ${next?.newVersion ?? 'Release'}\n`,
                commitList,
                '',
                '---',
                'This Request Generated by release-my-work',
            ].join('\n');

            // TODO: PR — Use pullRequestConfig.draft flag
            //       createPullRequest accepts a draft parameter;
            //       pass pullRequestConfig.draft instead of always
            //       creating a normal PR.

            // TODO: PR — Apply labels from pullRequestConfig.labels
            //       After creation, add labels via the GitHub API
            //       Issues.addLabels.

            // TODO: PR — Handle pullRequestConfig.skipLabel
            //       If the latest commit (or branch) contains the
            //       skipLabel, skip PR creation.

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

program
    .command('release-pr')
    .description('Create or update a release Pull Request (CI-friendly)')
    .option('-c, --config-path <path>', 'Path to config file')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('-o, --owner <owner>', 'GitHub owner (parsed from git remote if omitted)')
    .option('-r, --repo <repo>', 'GitHub repo name (parsed from git remote if omitted)')
    .option('--base <branch>', 'Target branch (default: main)', 'main')
    .action(async (options) => {
        let cfg = await resolveConfig(options.configPath);

        if (cfg != null) {
            console.log(`Successfully loaded config: ${options.configPath}`);
        } else {
            console.log(chalk.yellow('Warning: use default config'));
            cfg = defaultConfig;
        }

        const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
        if (token === undefined || token === null || token === '') {
            console.error(chalk.red('Error:'), 'GH_TOKEN or GITHUB_TOKEN environment variable is required.');
            process.exit(1);
        }

        try {
            const git = openGit(options.path);

            let owner = options.owner;
            let repo = options.repo;
            if (owner === undefined || owner === null || owner === ''
                || repo === undefined || repo === null || repo === '') {
                const remotes = await git.getRemotes(true);
                const origin = remotes.find(r => r.name === 'origin');
                if (origin === undefined || origin === null) {
                    console.error(chalk.red('Error:'), 'No git remote "origin" found.');
                    process.exit(1);
                }
                const pushUrl = origin.refs.push !== undefined && origin.refs.push !== null && origin.refs.push !== ''
                    ? origin.refs.push
                    : origin.refs.fetch;
                const parsed = parseGitHubRemote(pushUrl);
                owner = parsed.owner;
                repo = parsed.repo;
            }

            console.log(chalk.dim('Scanning git history...'));
            const result = await scanGitHistory({repoPath: options.path});

            const next = computeNextVersion(result.latestTag, result.commits);
            if (next === null || next === undefined) {
                console.log(chalk.dim('No version bump warranted. Nothing to release.'));
                return;
            }

            let ver = next.newVersion;
            let branchName = `release/${ver}`;
            let commitsForPR = result.commits;

            const tags = await git.tags();
            if (tags.all.includes(`v${ver}`)) {
                console.log(chalk.dim(`Tag v${ver} already exists. Version already released.`));
                return;
            }

            console.log(chalk.dim(`Checking existing PR for ${branchName}...`));
            const existingPr = await findPullRequest(owner, repo, branchName, token);

            if (existingPr !== null && existingPr !== undefined) {
                if (existingPr.state === 'open') {
                    console.log(chalk.dim(`Found open PR #${existingPr.number}. Will update.`));
                } else {
                    // PR closed/merged but tag missing — this version was already taken.
                    // Scan post-merge commits and advance to the next version.
                    console.log(chalk.dim(`PR #${existingPr.number} for ${branchName} is ${existingPr.state}.`));

                    if (existingPr.merge_commit_sha === undefined || existingPr.merge_commit_sha === null || existingPr.merge_commit_sha === '') {
                        console.log(chalk.yellow(`PR was ${existingPr.state} without merge info. Skipping.`));
                        return;
                    }

                    let newCommits: Array<{ hash: string; raw: string; type: string; scope: string | null; breaking: boolean; description: string; body: string[]; footers: Array<{ token: string; value: string }> }> = [];
                    try {
                        const log = await git.log([`${existingPr.merge_commit_sha}..HEAD`]);
                        newCommits = log.all
                            .map(e => parseCommit(e.message, e.hash))
                            .filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined);
                    } catch {
                        // merge_commit_sha not found locally (squash merge, shallow clone, etc.)
                        console.log(chalk.dim(`merge_commit_sha ${existingPr.merge_commit_sha} not found locally. Falling back to tag-based scan.`));
                        const fallbackLog = await git.log({ from: result.latestTag ?? undefined });
                        newCommits = fallbackLog.all
                            .map(e => parseCommit(e.message, e.hash))
                            .filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined);
                    }
                    const newBump = recommendBump(newCommits);

                    if (newBump === null) {
                        console.log(chalk.dim(`No new conventional commits since ${branchName} was merged. Skipping.`));
                        return;
                    }

                    const baseline = semver.parse(ver);
                    if (baseline === null) {
                        console.log(chalk.yellow(`Cannot parse version ${ver}. Skipping.`));
                        return;
                    }

                    ver = baseline.inc(newBump).version;
                    branchName = `release/${ver}`;
                    commitsForPR = newCommits;
                    console.log(chalk.dim(`Advancing to ${ver} based on post-merge commits.`));

                    if (tags.all.includes(`v${ver}`)) {
                        console.log(chalk.dim(`Tag v${ver} already exists. Skipping.`));
                        return;
                    }
                }
            }

            const commitLog = commitsForPR
                .map(c => {
                    const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                        ? `(${c.scope})`
                        : '';
                    const breaking = c.breaking ? '!' : '';
                    return `- ${c.type}${scope}${breaking}: ${c.description}`;
                })
                .join('\n');

            const header = cfg.pullRequest.header === null ? "The Release Pull Request Is Created\n-----------------\n" : cfg.pullRequest.header;

            const prBody = `${header}\n## ${ver}\n\n### Changelog\n\n${commitLog}\n\n---\nThis pull request was created by \`release-my-work\`.\n\n:warning: **After approval and merge**, the publish workflow will automatically create the git tag \`v${ver}\` and a GitHub Release.`;
            // TODO: PR — Use pullRequestConfig for titlePattern, header, footer
            //       Same principle as the `pr` command: interpolate templates
            //       from user config instead of hardcoded text.

            // TODO: PR — Support pullRequestConfig.date
            //       If pullRequestConfig.date === true, insert today's date
            //       in the body header (e.g. "## 2026-07-04").

            // TODO: PR — Support pullRequestConfig.draft flag
            //       createPullRequest / updatePullRequest accept a draft
            //       parameter. Read it from user config.

            const remotes = await git.getRemotes(true);
            const originRemote = remotes.find(r => r.name === 'origin');
            if (originRemote !== undefined && originRemote !== null) {
                const pushUrl = originRemote.refs.push !== undefined && originRemote.refs.push !== null && originRemote.refs.push !== ''
                    ? originRemote.refs.push
                    : originRemote.refs.fetch;
                const authedUrl = pushUrl.replace(
                    'https://',
                    `https://x-access-token:${token}@`,
                );
                if (authedUrl !== pushUrl) {
                    await git.remote(['set-url', 'origin', authedUrl]);
                }
            }

            const currentBranch = (await git.branch()).current;
            try {
                await git.branch(['-D', branchName]);
            } catch {
                /* branch doesn't exist locally */
            }
            await git.checkoutLocalBranch(branchName);

            const pkgPath = `${options.path ?? process.cwd()}/package.json`;
            const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
            const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
            pkg.version = ver;
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

            await git.add('package.json');
            await git.commit(`chore(release): ${ver}`);

            console.log(chalk.dim(`Pushing ${branchName}...`));
            await git.push('origin', branchName, ['--force-with-lease']);

            const title = `chore(release): ${ver}`;

            if (existingPr !== null && existingPr !== undefined && existingPr.state === 'open') {
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

            try {
                await git.checkout(currentBranch);
            } catch { /* ok */
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('Error:'), errorMessage);
            process.exit(1);
        }
    });

program
    .command('auto')
    .description('Run bump + PR in one go (bump version, push, create pull request)')
    .option('-c, --config-path <path>', 'Path to config file')
    .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
    .requiredOption('-r, --repo <repo>', 'GitHub repository name')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
    .option('-b, --base <branch>', 'Target branch (default: main)', 'main')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('--dry-run', 'Show what would happen without making changes')
    .action(async (options) => {
        let cfg = await resolveConfig(options.configPath);

        if (cfg != null) {
            console.log(`Successfully loaded config: ${options.configPath}`);
        } else {
            console.log(chalk.yellow('Warning: use default config'));
            cfg = defaultConfig;
        }

        try {
            const result = await scanGitHistory({repoPath: options.path});
            const next = computeNextVersion(result.latestTag, result.commits);

            if (next === null || next === undefined) {
                console.log(chalk.yellow('No version bump warranted. Nothing to release.'));
                return;
            }

            const from = result.latestTag ?? 'initial';
            console.log(chalk.bold(`${from} → ${chalk.green(next.newVersion)} (${next.bump})`));

            if (options.dryRun === true) {
                console.log(chalk.dim('(dry-run — stopping before commit & PR)\n'));
                return;
            }

            const git = openGit(options.path);
            const msg = buildVersionCommitMessage(next.newVersion, next.bump);

            const token = options.token !== undefined && options.token !== null && options.token !== ''
                ? options.token
                : (process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN);
            if (token !== undefined && token !== null && token !== '') {
                const remotes = await git.getRemotes(true);
                const origin = remotes.find(r => r.name === 'origin');
                if (origin !== undefined && origin !== null) {
                    const pushUrl = origin.refs.push !== undefined && origin.refs.push !== null && origin.refs.push !== ''
                        ? origin.refs.push
                        : origin.refs.fetch;
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
                    const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                        ? `(${c.scope})`
                        : '';
                    return `- ${c.type}${scope}: ${c.description}`;
                })
                .join('\n');

            // TODO: PR — Use pullRequestConfig for body (auto)
            //       Same as `pr` and `release-pr` commands: replace hardcoded body
            //       with header + commitList + footer from config, plus draft,
            //       labels, releaseLabel, skipLabel and date.

            const header = cfg.pullRequest.header === null ? "The Release Pull Request Is Created\n-----------------\n" : cfg.pullRequest.header;

            const body = [
                header,
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

program
    .command('release-publish')
    .description('Tag, generate changelog, and create a GitHub Release after a PR merge')
    .requiredOption('-v, --version <version>', 'Version to publish (e.g. 1.2.3)')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
    .option('-r, --repo <repo>', 'GitHub repo in owner/repo format (defaults to GITHUB_REPOSITORY env)')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('--no-delete-branch', 'Skip deleting the release branch after publishing')
    .action(async (options) => {
        const token = options.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
        if (token === undefined || token === null || token === '') {
            console.error(chalk.red('Error:'), 'GH_TOKEN or GITHUB_TOKEN is required.');
            process.exit(1);
        }

        const repo = options.repo ?? process.env.GITHUB_REPOSITORY;
        if (repo === undefined || repo === null || repo === '') {
            console.error(chalk.red('Error:'), '--repo or GITHUB_REPOSITORY is required.');
            process.exit(1);
        }

        const [owner, repoName] = repo.split('/');

        try {
            const git = openGit(options.path);
            const ver = options.version;

            // Guard: tag must not already exist
            const tags = await git.tags();
            if (tags.all.includes(`v${ver}`)) {
                console.log(chalk.yellow(`Tag v${ver} already exists. Nothing to publish.`));
                return;
            }

            // Check if the release PR was merged into current branch
            const recentLog = await git.log(['--merges', '--oneline', '-10']);
            const releaseMerge = recentLog.all.find(
                e => e.message.includes(`release/${ver}`),
            );
            if (!releaseMerge) {
                console.log(chalk.yellow(
                    `No merge commit for release/${ver} found in recent history. ` +
                    'Publishing anyway. Use --no-delete-branch if the branch was already cleaned up.',
                ));
            } else {
                console.log(chalk.dim(`Found merge commit: ${releaseMerge.hash} ${releaseMerge.message}`));
            }

            // Tag HEAD
            await git.addTag(`v${ver}`);
            await git.push('origin', `v${ver}`);
            console.log(chalk.green(`Tagged v${ver}`));

            // Generate changelog
            const scan = await scanGitHistory({repoPath: options.path});
            const commitBullets = scan.commits
                .map(c => {
                    const scope = c.scope != null && c.scope !== '' ? `(${c.scope})` : '';
                    const breaking = c.breaking ? '!' : '';
                    return `- ${c.type}${scope}${breaking}: ${c.description}`;
                })
                .join('\n');

            const changelog = `## ${ver}\n\n${commitBullets}`;
            console.log(chalk.dim('\nChangelog:'));
            console.log(changelog);

            // Create GitHub Release
            const octokit = createClient(token);
            const releaseResp = await octokit.rest.repos.createRelease({
                owner,
                repo: repoName,
                tag_name: `v${ver}`,
                name: `v${ver}`,
                body: changelog,
            });
            console.log(chalk.green(`Release created: ${chalk.underline(releaseResp.data.html_url)}`));

            // Delete release branch
            if (options.deleteBranch !== false) {
                const branchName = `release/${ver}`;
                try {
                    await git.push(['origin', '--delete', branchName]);
                    console.log(chalk.dim(`Deleted branch ${branchName}`));
                } catch {
                    console.log(chalk.yellow(`Could not delete ${branchName} (may not exist).`));
                }
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(chalk.red('Error:'), errorMessage);
            process.exit(1);
        }
    });

program.parse(process.argv);
