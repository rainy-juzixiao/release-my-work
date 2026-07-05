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
import {createPullRequest, addLabelsToPR} from '#@/github';
import {defaultConfig} from '#@/config/index.js';
import {resolveConfig} from '#@/utils/resolve-config.js';

export interface AutoOptions {
    configPath?: string;
    owner?: string;
    repo?: string;
    token?: string;
    base?: string;
    path?: string;
    dryRun?: boolean;
}

export async function autoAction(options: AutoOptions): Promise<void> {
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

        // Skip PR creation if any commit contains the skipLabel text
        if (cfg.pullRequest.skipLabel !== undefined && cfg.pullRequest.skipLabel !== null && cfg.pullRequest.skipLabel !== '') {
            const skipText = cfg.pullRequest.skipLabel.toLowerCase();
            const found = next.commits.some(c => {
                const scope = c.scope !== undefined && c.scope !== null && c.scope !== ''
                    ? `(${c.scope})`
                    : '';
                const fullMsg = `${c.type}${scope}: ${c.description}`;
                return fullMsg.toLowerCase().includes(skipText);
            });
            if (found) {
                console.log(chalk.yellow(`Skip label "${cfg.pullRequest.skipLabel}" found in commits. Skipping PR creation.`));
                return;
            }
        }

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

        const header = cfg.pullRequest.header !== ''
            ? cfg.pullRequest.header
            : "The Release Pull Request Is Created\n-----------------\n";

        const dateLine = cfg.pullRequest.date
            ? `\n## ${new Date().toISOString().split('T')[0]}\n`
            : '';

        const footer = cfg.pullRequest.footer !== ''
            ? `\n\n${cfg.pullRequest.footer}`
            : '';

        const body = `${header}\n## ${next.newVersion}${dateLine}\n\n### Changelog\n\n${commitList}${footer}\n\n---\nThis pull request was created by \`release-my-work\`.\n\n:warning: **After approval and merge**, the publish workflow will automatically create the git tag \`v${next.newVersion}\` and a GitHub Release.`;

        const pr = await createPullRequest({
            token,
            owner: options.owner as string,
            repo: options.repo as string,
            head: result.currentBranch,
            base: (options.base ?? 'main') as string,
            title: msg.split('\n')[0],
            body,
            draft: cfg.pullRequest.draft,
        });

        console.log(chalk.green(`Pull Request created: ${chalk.underline(pr.url)}`));

        // Apply labels from pullRequestConfig.labels
        if (cfg.pullRequest.labels.length > 0) {
            await addLabelsToPR(
                options.owner as string,
                options.repo as string,
                pr.number,
                cfg.pullRequest.labels,
                token,
            );
            console.log(chalk.dim(`Labels added: ${cfg.pullRequest.labels.join(', ')}`));
        }

        // Apply releaseLabel transitions: for each mapping, remove any label
        // matching "${key}: *" and add "${key}: ${value}"
        for (const [key, value] of Object.entries(cfg.pullRequest.releaseLabel)) {
            const targetLabel = `${key}: ${value}`;
            try {
                await addLabelsToPR(
                    options.owner as string,
                    options.repo as string,
                    pr.number,
                    [targetLabel],
                    token,
                );
            } catch { /* ok */ }
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(chalk.red('Error:'), errorMessage);
        process.exit(1);
    }
}
