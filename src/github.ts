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
import {Octokit} from '@octokit/rest';

export interface GitHubCreatePROptions {
    token?: string;
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
}

export interface GitHubPRResult {
    url: string;
    number: number;
}

export interface PullRequestInfo {
    number: number;
    state: string;
    html_url: string;
}

export function createClient(token?: string): Octokit {
    const resolved = token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    if (resolved === undefined || resolved === null || resolved === '') {
        throw new Error(
            'GitHub token is required. Set GH_TOKEN or GITHUB_TOKEN environment variable.'
        );
    }
    return new Octokit({auth: resolved});
}

export function parseGitHubRemote(remote: string): {owner: string; repo: string} {
    const sshMatch = remote.match(/git@github\.com:([^/]+)\/(.+)\.git$/);
    if (sshMatch) {return {owner: sshMatch[1], repo: sshMatch[2]};}

    const httpsMatch = remote.match(/https:\/\/github\.com\/([^/]+)\/([^/.]+)/);
    if (httpsMatch) {return {owner: httpsMatch[1], repo: httpsMatch[2]};}

    throw new Error(`Cannot parse GitHub remote: "${remote}"`);
}

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

/**
 * Find a pull request by head branch.
 * Returns null if no PR exists for that branch.
 */
export async function findPullRequest(
    owner: string,
    repo: string,
    head: string,
    token?: string,
): Promise<PullRequestInfo | null> {
    const octokit = createClient(token);
    const {data} = await octokit.rest.pulls.list({
        owner,
        repo,
        head,
        state: 'all',
        per_page: 1,
    });
    return data[0] !== undefined && data[0] !== null
        ? {number: data[0].number, state: data[0].state, html_url: data[0].html_url}
        : null;
}

/**
 * Update an existing pull request's title and body.
 */
export async function updatePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    title: string,
    body: string,
    token?: string,
): Promise<GitHubPRResult> {
    const octokit = createClient(token);
    const response = await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pullNumber,
        title,
        body,
    });
    return {
        url: response.data.html_url,
        number: response.data.number,
    };
}
