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
import fs from 'node:fs';
import semver from 'semver';
import {scanGitHistory, openGit} from '#@/git';
import {computeNextVersion} from '#@/version';
import {createPullRequest, findPullRequest, updatePullRequest, parseGitHubRemote} from '#@/github';
import {parseCommit, type ConventionalCommit} from '#@/conventional';
import {defaultConfig} from '#@/config/index.js';
import {resolveConfig} from '#@/utils/resolve-config.js';

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

        const next = computeNextVersion(result.latestTag, result.commits, {
            bumpMinorPreMajor: cfg.bumpMinorPreMajor,
            bumpPatchForMinorPreMajor: cfg.bumpPatchForMinorPreMajor,
        });
        // TODO: Config — Use cfg.releaseAs to override computed version,
        //       cfg.prerelease / cfg.prereleaseType for prerelease suffix,
        //       cfg.versioning for version strategy (e.g. 'default', 'always-bump-patch'),
        //       cfg.releaseType for project-type-specific version logic.
        //       Also check cfg.pullRequest.skipLabel in commits to skip creation.
        if (next === null || next === undefined) {
            console.log(chalk.dim('No version bump warranted. Nothing to release.'));
            return;
        }

        let ver = next.newVersion;
        let branchName = `release/${ver}`;
        let commitsForPR = result.commits;

        const tags = await git.tags();
        // TODO: Config — Use cfg.includeVInTag; when false, check for ver
        //       without 'v' prefix: tags.all.includes(ver).
        if (tags.all.includes(`v${ver}`)) {
            console.log(chalk.dim(`Tag v${ver} already exists. Version already released.`));
            return;
        }

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

            console.log(chalk.bold('\n── Dry Run Preview ──\n'));
            console.log(chalk.cyan('Branch: '), branchName);
            console.log(chalk.cyan('Base:   '), options.base ?? 'main');
            console.log(chalk.cyan('Title:  '), title);
            console.log(chalk.cyan('Draft:  '), cfg.pullRequest.draft);
            console.log(chalk.cyan('Labels: '), cfg.pullRequest.labels.join(', '));
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
                // PR is closed — use GitHub API's authoritative `merged` flag
                // (fetched via pulls.get for reliability).
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
                        // Shallow clone — merge_commit_sha not in local history.
                        // Continue with empty newCommits; advance loop still works.
                        couldNotFetchHistory = true;
                        console.log(chalk.dim('(merge commit not in local history — shallow clone?)'));
                    }

                    // If we have full history but no new conventional commits, skip
                    if (couldNotFetchHistory === false && newCommits.length === 0) {
                        console.log(chalk.dim(`No new conventional commits since ${branchName} was merged. Skipping.`));
                        return;
                    }

                    // Advance version until we find one without a closed PR
                    // Use 'patch' as the minimum increment to prevent runaway
                    // version inflation when multiple releases were merged
                    // without tags.
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

                        if (tags.all.includes(`v${ver}`)) {
                            console.log(chalk.dim(`Tag v${ver} already exists. Skipping.`));
                            return;
                        }

                        const nextPr = await findPullRequest(owner, repo, branchName, token);
                        if (nextPr === null || nextPr === undefined || nextPr.state === 'open') {
                            break;
                        }
                        console.log(chalk.dim(`PR #${nextPr.number} for ${branchName} is also ${nextPr.state}. Advancing further.`));
                    }
                    // Continue to create/update PR for the advanced version
                } else {
                    console.log(chalk.dim(`PR #${existingPr.number} was closed without merging. Will force-recreate.`));
                    // Keep ver, branchName, commitsForPR unchanged — force push below
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

        // TODO: Config — Use cfg.changelogPath / cfg.changelogType /
        //       cfg.changelogHost to write or format the changelog file
        //       (e.g. update CHANGELOG.md in the release branch).
        const prBody = `${header}\n## ${ver}${dateLine}\n\n### Changelog\n\n${commitLog}${footer}\n\n---\nThis pull request was created by \`release-my-work\`.\n\n:warning: **After approval and merge**, the publish workflow will automatically create the git tag \`v${ver}\` and a GitHub Release.`;

        // TODO: Config — Apply cfg.pullRequest.labels (actual API call) and
        //       cfg.pullRequest.releaseLabel transitions after PR creation.
        //       Check cfg.pullRequest.skipLabel before creating/updating.

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
            // TODO: Config — Use cfg.extraFiles to update version in
            //       additional files (e.g. version.txt, Cargo.toml, pom.xml).
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

        if (versionChanged === true) {
            await git.raw(['add', versionFile]);
            // TODO: Config — Use cfg.github.signoff to add Signed-off-by
            //       trailer to the commit message when non-empty.
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
        // Force-push: the local branch was recreated from HEAD, so it may not
        // fast-forward the remote branch (e.g. when overwriting a closed PR).
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
