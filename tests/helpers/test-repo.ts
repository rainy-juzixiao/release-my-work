import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface RepoCommit {
    /** Full commit message (may contain body lines separated by \n) */
    message: string;
}

export interface TagDef {
    /** Tag name, e.g. "v1.0.0" or "1.0.0" */
    name: string;
}

/**
 * Helper to create temporary git repositories for integration testing.
 *
 * Uses `execSync` to run raw git commands so there are no ESM/CJS
 * module-resolution issues with `simple-git` in the Jest environment.
 */
export class TestRepo {
    /** Absolute path to the repository root */
    readonly dir: string;

    private constructor(dir: string) {
        this.dir = dir;
    }

    /**
     * Create a temporary git repository with an optional list of commits.
     * An initial "root commit" is always created so the repo is non-empty.
     *
     * @example
     *   const repo = await TestRepo.create([
     *     { message: 'feat: add login' },
     *     { message: 'fix: fix crash' },
     *   ]);
     *   // ... run tests ...
     *   repo.destroy();
     */
    static async create(commits: RepoCommit[] = []): Promise<TestRepo> {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-repo-'));
        const repo = new TestRepo(dir);

        repo.git('init --initial-branch=main');
        repo.git('config user.email "test@test.com"');
        repo.git('config user.name "Tester"');

        // First commit — without it, the repo has no HEAD and many commands fail
        fs.writeFileSync(path.join(dir, 'initial.txt'), 'root', 'utf-8');
        repo.git('add .');
        repo.git('commit -m "root commit"');

        for (const c of commits) {
            repo.commit(c.message);
        }

        return repo;
    }

    /** Add a file with unique content, stage everything, and commit. */
    commit(message: string): void {
        // Write unique content so git always sees a change
        fs.appendFileSync(path.join(this.dir, 'CHANGES'), `${message}\n`, 'utf-8');
        this.git('add .');

        // Escape double quotes inside the message
        const safe = message.replace(/"/g, '\\"');
        this.git(`commit -m "${safe}"`);
    }

    /** Create a lightweight tag at HEAD. */
    tag(name: string): void {
        this.git(`tag ${name}`);
    }

    /** Create and switch to a new branch. */
    branch(name: string): void {
        this.git(`checkout -b ${name}`);
    }

    /** Remove the entire temporary directory. */
    destroy(): void {
        fs.rmSync(this.dir, {recursive: true, force: true});
    }

    /** Get the current HEAD hash (short form). */
    headHash(): string {
        return this.git('rev-parse --short HEAD').toString().trim();
    }

    private git(args: string): Buffer {
        return execSync(`git ${args}`, {cwd: this.dir});
    }
}
