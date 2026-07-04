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
import {Octokit} from '@octokit/rest';

export interface GitHubCreatePROptions {
    /** GitHub token (defaults to GITHUB_TOKEN env var) */
    token?: string;
    /** Owner of the repository (e.g. "my-org") */
    owner: string;
    /** Repository name (e.g. "my-repo") */
    repo: string;
    /** Source branch (feature branch) */
    head: string;
    /** Target branch (usually "main" or "master") */
    base: string;
    /** PR title */
    title: string;
    /** PR body */
    body: string;
}

export interface GitHubPRResult {
    url: string;
    number: number;
}

/**
 * Create an authenticated Octokit client.
 */
export function createClient(token?: string): Octokit {
    const resolved = token ?? process.env.GITHUB_TOKEN;
    if (resolved === undefined || resolved === null || resolved === '') {
        throw new Error(
            'GitHub token is required. Set the GITHUB_TOKEN environment variable or pass it explicitly.'
        );
    }
    return new Octokit({auth: resolved});
}

/**
 * Parse a GitHub remote URL (git@github.com:owner/repo.git or https://github.com/owner/repo)
 * into { owner, repo }.
 */
export function parseGitHubRemote(remote: string): { owner: string; repo: string } {
    // SSH: git@github.com:owner/repo.git
    const sshMatch = remote.match(/git@github\.com:([^/]+)\/(.+)\.git$/);
    if (sshMatch) {return {owner: sshMatch[1], repo: sshMatch[2]};}

    // HTTPS: https://github.com/owner/repo
    const httpsMatch = remote.match(/https:\/\/github\.com\/([^/]+)\/([^/.]+)/);
    if (httpsMatch) {return {owner: httpsMatch[1], repo: httpsMatch[2]};}

    throw new Error(`Cannot parse GitHub remote: "${remote}"`);
}

/**
 * Create a Pull Request on GitHub.
 */
export async function createPullRequest(options: GitHubCreatePROptions): Promise<GitHubPRResult> {
    const octokit = createClient(options.token);

    const response = await octokit.rest.pulls.create({
        owner: options.owner,
        repo: options.repo,
        head: options.head,
        base: options.base,
        title: options.title,
        body: options.body,
    });

    return {
        url: response.data.html_url,
        number: response.data.number,
    };
}
