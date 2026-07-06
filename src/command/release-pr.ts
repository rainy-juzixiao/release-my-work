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
import semver from 'semver';
import {scanGitHistory, openGit} from '#@/git';
import {computeNextVersion, type VersionOptions} from '#@/version';
import {createPullRequest, findPullRequest, updatePullRequest, parseGitHubRemote, addLabelsToPR} from '#@/github';
import {parseCommit, type ConventionalCommit} from '#@/conventional';
import {defaultConfig} from '#@/config/index.js';
import {resolveConfig} from '#@/utils/resolve-config.js';
import {getAdapter} from '#@/project/index.js';

function interpolateTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\$\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

export interface ReleasePrOptions {
    configPath?: string;
    path?: string;
    owner?: string;
    repo?: string;
    base?: string;
    dryRun?: boolean;
}

export async function releasePrAction(options: ReleasePrOptions): Promise<void> {
    let cfg = await resolveConfig(options.configPath);

    if (cfg != null) {
        console.log(`Successfully loaded config: ${options.configPath}`);
    } else {
        console.log(chalk.yellow('Warning: use default config'));
        cfg = defaultConfig;
    }

    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

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

        // Build version options from config
        const versionOpts: VersionOptions = {
            bumpMinorPreMajor: cfg.bumpMinorPreMajor,
            bumpPatchForMinorPreMajor: cfg.bumpPatchForMinorPreMajor,
            releaseAs: cfg.releaseAs !== '' ? cfg.releaseAs : undefined,
            versioning: cfg.versioning !== 'default' ? cfg.versioning : undefined,
            prerelease: cfg.prerelease,
            prereleaseType: cfg.prereleaseType !== '' ? cfg.prereleaseType : undefined,
            releaseType: cfg.releaseType,
        };

        const next = computeNextVersion(result.latestTag, result.commits, versionOpts);

        if (next === null || next === undefined) {
            console.log(chalk.dim('No version bump warranted. Nothing to release.'));
            return;
        }

        let ver = next.newVersion;
        let branchName = `release/${ver}`;
        let commitsForPR = result.commits;

        // Use cfg.includeVInTag to decide tag prefix when checking existing tags
        const tagPrefix = cfg.includeVInTag ? 'v' : '';
        const tagRef = `${tagPrefix}${ver}`;

        const tags = await git.tags();
        if (tags.all.includes(tagRef)) {
            console.log(chalk.dim(`Tag ${tagRef} already exists. Version already released.`));
            return;
        }

        // Check cfg.pullRequest.skipLabel in commits
        if (cfg.pullRequest.skipLabel !== '') {
            const skipText = cfg.pullRequest.skipLabel.toLowerCase();
            const found = commitsForPR.some(c => {
                const scope = c.scope !== null && c.scope !== '' ? `(${c.scope})` : '';
                const fullMsg = `${c.type}${scope}: ${c.description}`;
                return fullMsg.toLowerCase().includes(skipText);
            });
            if (found) {
                console.log(chalk.yellow(`Skip label "${cfg.pullRequest.skipLabel}" found in commits. Skipping PR.`));
                return;
            }
        }

        const adapter = getAdapter(cfg.releaseType);
        const repoRoot = options.path ?? process.cwd();

        // Dry-run: preview without touching GitHub API or git operations
        if (options.dryRun === true) {
            const visibleTypes = new Set(
                cfg.changelogSections.filter(s => !s.hidden).map(s => s.type)
            );
            const commitLog = commitsForPR
                .filter(c => visibleTypes.has(c.type))
                .map(c => {
                    const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                        ? `(${c.scope})`
                        : '';
                    const breaking = c.breaking ? '!' : '';
                    return `- ${c.type}${scope}${breaking}: ${c.description}`;
                })
                .join('\n');
            const header = cfg.pullRequest.header !== ''
                ? cfg.pullRequest.header
                : "The Release Pull Request Is Created\n-----------------\n";
            const dateLine = cfg.pullRequest.date
                ? `\n## ${new Date().toISOString().split('T')[0]}\n`
                : '';
            const footer = cfg.pullRequest.footer !== ''
                ? `\n\n${cfg.pullRequest.footer}`
                : '';
            const prBody = `${header}\n## ${ver}${dateLine}\n\n### Changelog\n\n${commitLog}${footer}\n\n---\nThis pull request was created by \`release-my-work\`.\n\n:warning: **After approval and merge**, the publish workflow will automatically create the git tag \`v${ver}\` and a GitHub Release.`;
            const title = interpolateTemplate(cfg.pullRequest.titlePattern, {
                scope: '(release)',
                component: cfg.packageName,
                version: ver,
            });

            const versionFiles = await adapter.getVersionFiles(repoRoot);

            console.log(chalk.bold('\n── Dry Run Preview ──\n'));
            console.log(chalk.cyan('Branch:   '), branchName);
            console.log(chalk.cyan('Base:     '), options.base ?? 'main');
            console.log(chalk.cyan('Title:    '), title);
            console.log(chalk.cyan('Draft:    '), cfg.pullRequest.draft);
            console.log(chalk.cyan('Labels:   '), cfg.pullRequest.labels.join(', '));
            console.log(chalk.cyan('Version files:'), versionFiles.join(', '));
            if (cfg.extraFiles.length > 0) {
                console.log(chalk.cyan('Extra files:'), cfg.extraFiles.join(', '));
            }
            console.log('');
            console.log(chalk.cyan('Body:'));
            console.log(prBody);
            console.log(chalk.dim('\n(dry-run — stopping before any git operations & PR creation)\n'));
            return;
        }

        console.log(chalk.dim(`Checking existing PR for ${branchName}...`));
        const existingPr = await findPullRequest(owner, repo, branchName, token);

        if (existingPr !== null && existingPr !== undefined) {
            if (existingPr.state === 'open') {
                console.log(chalk.dim(`Found open PR #${existingPr.number}. Will update.`));
            } else {
                if (existingPr.merged === true) {
                    console.log(chalk.dim(`PR #${existingPr.number} was merged. Advancing version.`));

                    const mergeSha = existingPr.merge_commit_sha;
                    if (mergeSha === null || mergeSha === undefined || mergeSha === '') {
                        console.log(chalk.yellow('PR marked as merged but no merge commit SHA found. Skipping.'));
                        return;
                    }
                    let newCommits: ConventionalCommit[] = [];
                    let couldNotFetchHistory = false;
                    try {
                        const log = await git.log([`${mergeSha}..HEAD`]);
                        newCommits = log.all
                            .map(e => parseCommit(e.message, e.hash))
                            .filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined);
                    } catch {
                        couldNotFetchHistory = true;
                        console.log(chalk.dim('(merge commit not in local history — shallow clone?)'));
                    }

                    if (couldNotFetchHistory === false && newCommits.length === 0) {
                        console.log(chalk.dim(`No new conventional commits since ${branchName} was merged. Skipping.`));
                        return;
                    }

                    let advanceIter = 0;
                    const MAX_ADVANCE = 10;
                    while (advanceIter < MAX_ADVANCE) {
                        const baseline = semver.parse(ver);
                        if (baseline === null) {
                            console.log(chalk.yellow(`Cannot parse version ${ver}. Skipping.`));
                            return;
                        }

                        ver = baseline.inc('patch').version;
                        branchName = `release/${ver}`;
                        commitsForPR = newCommits;
                        advanceIter++;
                        console.log(chalk.dim(`Advancing to ${ver}...`));

                        const newTagRef = `${tagPrefix}${ver}`;
                        if (tags.all.includes(newTagRef)) {
                            console.log(chalk.dim(`Tag ${newTagRef} already exists. Skipping.`));
                            return;
                        }

                        const nextPr = await findPullRequest(owner, repo, branchName, token);
                        if (nextPr === null || nextPr === undefined || nextPr.state === 'open') {
                            break;
                        }
                        console.log(chalk.dim(`PR #${nextPr.number} for ${branchName} is also ${nextPr.state}. Advancing further.`));
                    }
                } else {
                    console.log(chalk.dim(`PR #${existingPr.number} was closed without merging. Will force-recreate.`));
                }
            }
        }

        const visibleTypes = new Set(
            cfg.changelogSections.filter(s => !s.hidden).map(s => s.type)
        );

        const commitLog = commitsForPR
            .filter(c => visibleTypes.has(c.type))
            .map(c => {
                const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                    ? `(${c.scope})`
                    : '';
                const breaking = c.breaking ? '!' : '';
                return `- ${c.type}${scope}${breaking}: ${c.description}`;
            })
            .join('\n');

        const header = cfg.pullRequest.header !== ''
            ? cfg.pullRequest.header
            : "The Release Pull Request Is Created\n-----------------\n";

        const dateLine = cfg.pullRequest.date
            ? `\n## ${new Date().toISOString().split('T')[0]}\n`
            : '';

        const footer = cfg.pullRequest.footer !== ''
            ? `\n\n${cfg.pullRequest.footer}`
            : '';

        const prBody = `${header}\n## ${ver}${dateLine}\n\n### Changelog\n\n${commitLog}${footer}\n\n---\nThis pull request was created by \`release-my-work\`.\n\n:warning: **After approval and merge**, the publish workflow will automatically create the git tag \`v${ver}\` and a GitHub Release.`;

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
        await git.raw(['branch', '-D', branchName]).catch(() => { /* ok */
        });
        await git.raw(['checkout', '-b', branchName]);

        let versionChanged = true;

        try {
            const currentVersion = await adapter.readVersion(repoRoot);
            if (currentVersion === ver) {
                console.log(chalk.dim(`Version ${ver} is already set. Skipping version commit.`));
                versionChanged = false;
            } else {
                await adapter.writeVersion(repoRoot, ver);
            }
        } catch {
            // Fallback to VERSION file when the adapter can't find its file
            const {readFileSync, existsSync, writeFileSync} = await import('node:fs');
            let existingVer = '';
            try {
                if (existsSync(`${repoRoot}/VERSION`)) {
                    existingVer = readFileSync(`${repoRoot}/VERSION`, 'utf-8').trim();
                }
            } catch { /* file does not exist yet */
            }
            if (existingVer === ver) {
                console.log(chalk.dim(`Version ${ver} is already set in VERSION. Skipping version commit.`));
                versionChanged = false;
            } else {
                writeFileSync(`${repoRoot}/VERSION`, `${ver}\n`);
            }
        }

        // Stage version files plus extraFiles from config
        const stageFiles: string[] = [];
        const vFiles = await adapter.getVersionFiles(repoRoot);
        stageFiles.push(...vFiles);
        for (const ef of cfg.extraFiles) {
            stageFiles.push(`${repoRoot}/${ef}`);
        }
        const uniqueStage = [...new Set(stageFiles)];

        if (versionChanged === true) {
            if (uniqueStage.length > 0) {
                await git.raw(['add', ...uniqueStage]);
            }

            let commitMsg = `chore(release): ${ver}`;
            if (cfg.github.signoff !== '') {
                commitMsg += `\n\nSigned-off-by: ${cfg.github.signoff}`;
            }
            await git.raw(['commit', '-m', commitMsg]);
        } else {
            console.log(chalk.dim(`Version ${ver} is already set. Creating placeholder commit for PR branch.`));
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
        await git.raw(['push', '--force', 'origin', branchName]);

        const title = interpolateTemplate(cfg.pullRequest.titlePattern, {
            scope: '(release)',
            component: cfg.packageName,
            version: ver,
        });

        if (existingPr !== null && existingPr !== undefined && existingPr.state === 'open') {
            const updated = await updatePullRequest(owner, repo, existingPr.number, title, prBody, token, cfg.pullRequest.draft);
            console.log(chalk.green(`Updated PR #${updated.number}: ${chalk.underline(updated.url)}`));
        } else {
            const created = await createPullRequest({
                token,
                owner,
                repo,
                head: branchName,
                base: (options.base ?? 'main') as string,
                title,
                body: prBody,
                draft: cfg.pullRequest.draft,
            });
            console.log(chalk.green(`Created PR #${created.number}: ${chalk.underline(created.url)}`));
        }

        // Apply labels from config
        if (!cfg.skipLabeling && cfg.pullRequest.labels.length > 0) {
            try {
                const prNumber = existingPr !== null && existingPr !== undefined ? existingPr.number : (await findPullRequest(owner, repo, branchName, token))?.number;
                if (prNumber !== undefined && prNumber !== null) {
                    await addLabelsToPR(owner, repo, prNumber, cfg.pullRequest.labels, token);
                    console.log(chalk.dim(`Labels added: ${cfg.pullRequest.labels.join(', ')}`));
                }
            } catch {
                console.log(chalk.yellow('Failed to apply labels to PR.'));
            }
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
}
