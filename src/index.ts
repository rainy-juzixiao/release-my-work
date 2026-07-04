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
    .option('-o, --owner <owner>', 'GitHub repository owner (parsed from git remote if omitted)')
    .option('-r, --repo <repo>', 'GitHub repo name (parsed from git remote if omitted)')
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
                    // Advance past all versions that have been consumed by closed PRs.
                    console.log(chalk.dim(`PR #${existingPr.number} for ${branchName} is ${existingPr.state}.`));

                    if (existingPr.merge_commit_sha === undefined || existingPr.merge_commit_sha === null || existingPr.merge_commit_sha === '') {
                        console.log(chalk.yellow(`PR was ${existingPr.state} without merge info. Skipping.`));
                        return;
                    }

                    // Scan post-merge commits once (merge_commit_sha doesn't change)
                    let newCommits: Array<{ hash: string; raw: string; type: string; scope: string | null; breaking: boolean; description: string; body: string[]; footers: Array<{ token: string; value: string }> }> = [];
                    let newBump: 'major' | 'minor' | 'patch' | null = null;
                    try {
                        const log = await git.log([`${existingPr.merge_commit_sha}..HEAD`]);
                        newCommits = log.all
                            .map(e => parseCommit(e.message, e.hash))
                            .filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined);
                        newBump = recommendBump(newCommits);
                    } catch {
                        console.log(chalk.dim(`merge_commit_sha ${existingPr.merge_commit_sha} not found locally.`));
                        console.log(chalk.yellow('Cannot determine post-merge commits. Skipping automatic version advancement.'));
                        return;
                    }

                    if (newBump === null) {
                        console.log(chalk.dim(`No new conventional commits since ${branchName} was merged. Skipping.`));
                        return;
                    }

                    // Loop: advance version until we find one without a closed PR
                    // (handles the case where multiple versions were consumed by
                    //  merged PRs but their tags were never created)
                    while (true) {
                        const baseline = semver.parse(ver);
                        if (baseline === null) {
                            console.log(chalk.yellow(`Cannot parse version ${ver}. Skipping.`));
                            return;
                        }

                        ver = baseline.inc(newBump).version;
                        branchName = `release/${ver}`;
                        commitsForPR = newCommits;
                        console.log(chalk.dim(`Advancing to ${ver}...`));

                        if (tags.all.includes(`v${ver}`)) {
                            console.log(chalk.dim(`Tag v${ver} already exists. Skipping.`));
                            return;
                        }

                        // Check if the advanced version also has a closed PR
                        const nextPr = await findPullRequest(owner, repo, branchName, token);
                        if (nextPr === null || nextPr === undefined || nextPr.state === 'open') {
                            break; // Available — use this version
                        }
                        console.log(chalk.dim(`PR #${nextPr.number} for ${branchName} is also ${nextPr.state}. Advancing further.`));
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

            const currentBranch = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();

            // Delete stale local branch if it exists, then create fresh from HEAD
            await git.raw(['branch', '-D', branchName]).catch(() => { /* ok */ });
            await git.raw(['checkout', '-b', branchName]);

            const repoRoot = options.path ?? process.cwd();
            const pkgPath = `${repoRoot}/package.json`;
            let versionFile = 'package.json';
            let versionChanged = true;

            try {
                const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
                const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
                if (pkg.version === ver) {
                    console.log(chalk.dim(`Version ${ver} is already set in package.json. Skipping version commit.`));
                    versionChanged = false;
                } else {
                    pkg.version = ver;
                    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
                }
            } catch {
                // Fallback to version.txt when package.json is unavailable
                versionFile = 'version.txt';
                let existingVer = '';
                try {
                    existingVer = fs.readFileSync(`${repoRoot}/version.txt`, 'utf-8').trim();
                } catch { /* file does not exist yet */ }
                if (existingVer === ver) {
                    console.log(chalk.dim(`Version ${ver} is already set in version.txt. Skipping version commit.`));
                    versionChanged = false;
                } else {
                    fs.writeFileSync(`${repoRoot}/version.txt`, `${ver}\n`);
                }
            }

            if (versionChanged) {
                await git.raw(['add', versionFile]);
                await git.raw(['commit', '-m', `chore(release): ${ver}`]);
            } else {
                // Branch would be identical to base — create an empty commit
                // so GitHub allows creating a Pull Request.
                console.log(chalk.dim(`Version ${ver} is already set in ${versionFile}. Creating placeholder commit for PR branch.`));
                await git.raw(['commit', '--allow-empty', '-m', `chore(release): ${ver}`]);
            }

            // Verify the branch is actually ahead of base before pushing
            const baseSha = (await git.raw(['rev-parse', options.base ?? 'main'])).trim();
            const branchSha = (await git.raw(['rev-parse', 'HEAD'])).trim();
            if (baseSha === branchSha) {
                console.error(chalk.red(
                    `Version bump commit was not created. HEAD is still at ${baseSha}.\n` +
                    'This usually means the file was already up-to-date. Check your working tree.',
                ));
                process.exit(1);
            }

            console.log(chalk.dim(`Pushing ${branchName}...`));
            await git.raw(['push', 'origin', branchName]);

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
    .option('-o, --owner <owner>', 'GitHub repository owner (parsed from git remote if omitted)')
    .option('-r, --repo <repo>', 'GitHub repo name (parsed from git remote if omitted)')
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
    .option('-v, --ver <version>', 'Version to publish (auto-detected from last merged release/ branch if omitted)')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
    .option('-r, --repo <repo>', 'GitHub repo in owner/repo format (defaults to GITHUB_REPOSITORY env)')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('-b, --base <branch>', 'Base branch to publish from (default: main)', 'main')
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

            // Ensure we're on the base branch (e.g. main) for publishing.
            // After a PR merge, the workflow may be running on a release branch
            // or merge commit — switch to base so tag/release/scan operates correctly.
            const baseBranch = options.base ?? 'main';
            try {
                const currentRef = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
                if (currentRef !== baseBranch) {
                    console.log(chalk.dim(`Currently on '${currentRef}'. Switching to '${baseBranch}'...`));
                    await git.fetch(['origin', baseBranch]);
                    await git.raw(['checkout', '-B', baseBranch, `origin/${baseBranch}`]);
                    if (token) {
                        const remotes = await git.getRemotes(true);
                        const originRemote = remotes.find(r => r.name === 'origin');
                        if (originRemote !== undefined && originRemote !== null) {
                            const pushUrl = originRemote.refs.push ?? originRemote.refs.fetch;
                            const authedUrl = pushUrl.replace('https://', `https://x-access-token:${token}@`);
                            if (authedUrl !== pushUrl) {
                                await git.remote(['set-url', 'origin', authedUrl]);
                            }
                        }
                    }
                }
            } catch {
                console.log(chalk.yellow(`Could not switch to '${baseBranch}', continuing with current branch.`));
            }

            let ver = options.ver;

            // Auto-detect version when not explicitly provided
            if (ver === undefined || ver === null || ver === '') {
                const headLog = await git.log({ maxCount: 10 });
                const messages = headLog.all.map(e => e.message);

                // Strategy 1: find merge commits containing "release/X.X.X"
                const mergeLog = await git.log(['--merges', '-10']);
                let match = mergeLog.all
                    .map(e => e.message.match(/release\/(\d+\.\d+\.\d+)/))
                    .find(Boolean);

                // Strategy 2: scan all recent commits for "release/X.X.X"
                // (handles squash merges where the branch name appears in the commit body)
                if (!match) {
                    match = messages
                        .map(m => m.match(/release\/(\d+\.\d+\.\d+)/))
                        .find(Boolean);
                }

                // Strategy 3: look for any semver X.X.X in HEAD commit message
                // (handles squash merges with default commit message like "chore(release): X.X.X (#N)")
                if (!match) {
                    const headMsg = messages[0] ?? '';
                    // Only match if it appears to be a release-related commit
                    if (/release|chore|bump|version/i.test(headMsg)) {
                        match = headMsg.match(/(\d+\.\d+\.\d+)/);
                    }
                }

                if (match) {
                    ver = match[1];
                    console.log(chalk.dim(`Auto-detected version ${ver} from recent commits.`));
                } else {
                    console.log(chalk.dim('Could not auto-detect version. No merged release/ branch found.'));
                    console.log(chalk.dim('Pass --ver <version> explicitly.'));
                    return;
                }
            }

            const tags = await git.tags();
            if (tags.all.includes(`v${ver}`)) {
                console.log(chalk.dim(`Tag v${ver} already exists. Nothing to publish.`));
                return;
            }

            // Verify the merge exists: check merge commits first, then any recent commit
            const recentLog = await git.log({ maxCount: 10 });
            const releaseCommit = recentLog.all.find(
                e => e.message.includes(`release/${ver}`)
                    || e.message.includes(`v${ver}`)
                    || (e.message.includes(ver) && /release|chore|bump|version/i.test(e.message)),
            );
            if (!releaseCommit) {
                console.error(chalk.red(
                    `Cannot publish v${ver}: no commit for release/${ver} in recent history. ` +
                    'The PR must be merged before publishing.',
                ));
                process.exit(1);
            }
            const refType = releaseCommit.message.includes('Merge') ? 'merge commit' : 'commit';
            console.log(chalk.green(`Release PR merged: ${releaseCommit.hash} ${releaseCommit.message} (${refType})`));

            await git.addTag(`v${ver}`);
            await git.push(['origin', `v${ver}`],);
            console.log(chalk.green(`Tagged v${ver}`));

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

            const octokit = createClient(token);
            const releaseResp = await octokit.rest.repos.createRelease({
                owner,
                repo: repoName,
                tag_name: `v${ver}`,
                name: `v${ver}`,
                body: changelog,
            });
            console.log(chalk.green(`Release created: ${chalk.underline(releaseResp.data.html_url)}`));

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
