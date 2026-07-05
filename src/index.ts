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

import {scanAction} from '#@/command/scan.js';
import {bumpAction} from '#@/command/bump.js';
import {prAction} from '#@/command/pull_request.ts';
import {releasePrAction} from '#@/command/release-pr.js';
import {autoAction} from '#@/command/auto.js';
import {releasePublishAction} from '#@/command/release-publish.js';

// TODO: PR — Merge user config with CLI flags in every command
//       Once resolved, the config should be merged with command options.
//       CLI flags take precedence over file config.

const program: Command = new Command();

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
    .action(scanAction);

program
    .command('bump')
    .description('Compute the next version based on conventional commits since the latest tag')
    .option('-c, --config-path <path>', 'Path to config file')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('--dry-run', 'Show what would happen without making changes')
    .action(bumpAction);

program
    .command('pr')
    .description('Create a GitHub Pull Request for the release')
    .option('-o, --owner <owner>', 'GitHub repository owner (parsed from git remote if omitted)')
    .option('-r, --repo <repo>', 'GitHub repo name (parsed from git remote if omitted)')
    .option('-c, --config-path <path>', 'Path to config file')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
    .option('-b, --base <branch>', 'Target branch (default: main)', 'main')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .action(prAction);

program
    .command('release-pr')
    .description('Create or update a release Pull Request (CI-friendly)')
    .option('-c, --config-path <path>', 'Path to config file')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('-o, --owner <owner>', 'GitHub owner (parsed from git remote if omitted)')
    .option('-r, --repo <repo>', 'GitHub repo name (parsed from git remote if omitted)')
    .option('--base <branch>', 'Target branch (default: main)', 'main')
    .action(releasePrAction);

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
    .action(autoAction);

program
    .command('release-publish')
    .description('Tag, generate changelog, and create a GitHub Release after a PR merge')
    .option('-v, --ver <version>', 'Version to publish (auto-detected from last merged release/ branch if omitted)')
    .option('-t, --token <token>', 'GitHub token (defaults to GH_TOKEN or GITHUB_TOKEN env)')
    .option('-r, --repo <repo>', 'GitHub repo in owner/repo format (defaults to GITHUB_REPOSITORY env)')
    .option('-p, --path <path>', 'Repository path (default: current directory)')
    .option('-b, --base <branch>', 'Base branch to publish from (default: main)', 'main')
    .option('--no-delete-branch', 'Skip deleting the release branch after publishing')
    .action(releasePublishAction);

program.parse(process.argv);
