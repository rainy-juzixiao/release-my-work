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
import {createClient} from '#@/github';
import {defaultConfig} from '#@/config/index.js';
import {resolveConfig} from '#@/utils/resolve-config.js';

export interface ReleasePublishOptions {
    ver?: string;
    token?: string;
    repo?: string;
    path?: string;
    base?: string;
    deleteBranch?: boolean;
    configPath?: string;
}

export async function releasePublishAction(options: ReleasePublishOptions): Promise<void> {
    // Load config if available
    let cfg = await resolveConfig(options.configPath);
    if (cfg == null) {
        cfg = defaultConfig;
    }

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
        const baseBranch = options.base ?? 'main';
        try {
            const currentRef = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
            if (currentRef !== baseBranch) {
                console.log(chalk.dim(`Currently on '${currentRef}'. Switching to '${baseBranch}'...`));
                await git.fetch(['origin', baseBranch]);
                await git.raw(['checkout', '-B', baseBranch, `origin/${baseBranch}`]);
                if (token !== undefined && token !== null && token !== '') {
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
            const headLog = await git.log({maxCount: 10});
            const messages = headLog.all.map(e => e.message);

            // Strategy 1: find merge commits containing "release/X.X.X"
            const mergeLog = await git.log(['--merges', '-10']);
            let match = mergeLog.all
                .map(e => e.message.match(/release\/(\d+\.\d+\.\d+)/))
                .find(Boolean);

            // Strategy 2: scan all recent commits for "release/X.X.X"
            if (!match) {
                match = messages
                    .map(m => m.match(/release\/(\d+\.\d+\.\d+)/))
                    .find(Boolean);
            }

            // Strategy 3: look for any semver X.X.X in HEAD commit message
            if (!match) {
                const headMsg = messages[0] ?? '';
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
        // Use cfg.includeVInTag to decide tag prefix
        const tagPrefix = cfg.includeVInTag ? 'v' : '';
        const tagRef = `${tagPrefix}${ver}`;
        if (tags.all.includes(tagRef)) {
            console.log(chalk.dim(`Tag ${tagRef} already exists. Nothing to publish.`));
            return;
        }

        // Verify the merge exists
        const recentLog = await git.log({maxCount: 10});
        const releaseCommit = recentLog.all.find(
            e => e.message.includes(`release/${ver}`)
                || e.message.includes(`v${ver}`)
                || (e.message.includes(ver) && /release|chore|bump|version/i.test(e.message)),
        );
        if (!releaseCommit) {
            console.error(chalk.red(
                `Cannot publish ${tagRef}: no commit for release/${ver} in recent history. ` +
                'The PR must be merged before publishing.',
            ));
            process.exit(1);
        }
        const refType = releaseCommit.message.includes('Merge') ? 'merge commit' : 'commit';
        console.log(chalk.green(`Release PR merged: ${releaseCommit.hash} ${releaseCommit.message} (${refType})`));

        // Generate changelog BEFORE creating the tag
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

        await git.addTag(tagRef);
        await git.push(['origin', tagRef]);
        console.log(chalk.green(`Tagged ${tagRef}`));

        // Skip GitHub Release if configured
        if (cfg.github.skipGitHubRelease) {
            console.log(chalk.dim('GitHub Release creation skipped (skipGitHubRelease = true).'));
        } else {
            const octokit = createClient(token);
            const releaseResp = await octokit.rest.repos.createRelease({
                owner,
                repo: repoName,
                tag_name: tagRef,
                name: tagRef,
                body: changelog,
                prerelease: cfg.github.prerelease,
                draft: cfg.github.draft,
            });
            console.log(chalk.green(`Release created: ${chalk.underline(releaseResp.data.html_url)}`));
        }

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
}
