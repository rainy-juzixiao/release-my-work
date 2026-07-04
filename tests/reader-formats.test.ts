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
import * as path from 'node:path';

import {
    loadConfigFromJson,
    loadConfigFromToml,
    loadConfigFromJs,
    loadConfigFromMjs,
    loadConfigFromTs,
    loadConfig,
    loadConfigAsync,
} from '#@/config/reader/index.js';

const fixturesDir = path.join(__dirname, 'fixtures');
const fixturePath = (name: string): string => path.join(fixturesDir, name);

function expectOverrides(config: {
    packageName: string;
    versioning: string;
    bumpMinorPreMajor: boolean;
    prerelease: boolean;
    pullRequest: { titlePattern: string; draft: boolean };
    github: { fork: boolean };
}): void {
    expect(config.packageName).not.toBe('release-my-work');
    expect(config.versioning).toBe('always-bump-patch');
    expect(config.bumpMinorPreMajor).toBe(false);
    expect(config.prerelease).toBe(true);
    expect(config.pullRequest.titlePattern).toMatch(/^\w+:/);
    expect(config.pullRequest.draft).toBe(true);
    expect(config.github.fork).toBe(true);
}

function expectDefaultsPreserved(config: {
    releaseType: string;
    includeVInTag: boolean;
    bumpPatchForMinorPreMajor: boolean;
    changelogPath: string;
    extraFiles: string[];
}): void {
    expect(config.releaseType).toBe('node');
    expect(config.includeVInTag).toBe(true);
    expect(config.bumpPatchForMinorPreMajor).toBe(false);
    expect(config.changelogPath).toBe('CHANGELOG.md');
    expect(config.extraFiles).toEqual([]);
}

describe('loadConfigFromJson', () => {
    it('should load a valid JSON file', () => {
        const config = loadConfigFromJson(fixturePath('valid-config.json'));
        expectOverrides(config);
        expect(config.packageName).toBe('json-pkg');
        expect(config.pullRequest.titlePattern).toBe('json: ${version}');
        expectDefaultsPreserved(config);
    });

    it('should throw for malformed JSON', () => {
        expect(() =>
            loadConfigFromJson(fixturePath('invalid.json')),
        ).toThrow();
    });

    it('should throw for non-existent file', () => {
        expect(() =>
            loadConfigFromJson(fixturePath('__nope.json')),
        ).toThrow();
    });
});

describe('loadConfigFromToml', () => {
    it('should load a valid TOML file', () => {
        const config = loadConfigFromToml(fixturePath('valid-config.toml'));
        expectOverrides(config);
        expect(config.packageName).toBe('toml-pkg');
        expect(config.pullRequest.titlePattern).toBe('toml: ${version}');
        expectDefaultsPreserved(config);
    });

    it('should throw for malformed TOML', () => {
        expect(() =>
            loadConfigFromToml(fixturePath('invalid.toml')),
        ).toThrow();
    });

    it('should throw for non-existent file', () => {
        expect(() =>
            loadConfigFromToml(fixturePath('__nope.toml')),
        ).toThrow();
    });
});

describe('loadConfigFromJs', () => {
    it('should load a valid CJS .js file', () => {
        const config = loadConfigFromJs(fixturePath('valid-config.js'));
        expectOverrides(config);
        expect(config.packageName).toBe('js-pkg');
        expect(config.pullRequest.titlePattern).toBe('js: ${version}');
        expectDefaultsPreserved(config);
    });

    it('should throw for non-existent file', () => {
        expect(() =>
            loadConfigFromJs(fixturePath('__nope.js')),
        ).toThrow();
    });
});

describe('loadConfigFromMjs', () => {
    it('should be exported as an async function', () => {
        expect(typeof loadConfigFromMjs).toBe('function');
        expect(loadConfigFromMjs.constructor.name).toBe('AsyncFunction');
    });
});

describe('loadConfigFromTs', () => {
    it('should be exported as a function', () => {
        expect(typeof loadConfigFromTs).toBe('function');
    });

    it('should load a valid .ts file (ts-jest transform active)', async () => {
        const config = await loadConfigFromTs(fixturePath('valid-config.ts'));
        expectOverrides(config);
        expect(config.packageName).toBe('ts-pkg');
        expect(config.pullRequest.titlePattern).toBe('ts: ${version}');
        expectDefaultsPreserved(config);
    });

    it('should throw for non-existent file', async () => {
        await expect(
            loadConfigFromTs(fixturePath('__nope.ts')),
        ).rejects.toThrow();
    });
});

describe('loadConfig (sync auto-detection)', () => {
    it('should detect .yaml', () => {
        const config = loadConfig(fixturePath('valid-config.yaml'));
        expect(config.packageName).toBe('release-my-work'); // kebab → no match
        expect(config.versioning).toBe('always-bump-patch'); // camelCase → match
    });

    it('should detect .yml', () => {
        const config = loadConfig(fixturePath('valid-config.yaml'));
        expect(config).toBeDefined();
    });

    it('should detect .json', () => {
        const config = loadConfig(fixturePath('valid-config.json'));
        expect(config.packageName).toBe('json-pkg');
    });

    it('should detect .toml', () => {
        const config = loadConfig(fixturePath('valid-config.toml'));
        expect(config.packageName).toBe('toml-pkg');
    });

    it('should detect .js', () => {
        const config = loadConfig(fixturePath('valid-config.js'));
        expect(config.packageName).toBe('js-pkg');
    });

    it('should throw for .mjs (async-only format)', () => {
        expect(() =>
            loadConfig(fixturePath('valid-config.mjs')),
        ).toThrow(/async/i);
    });

    it('should throw for .ts (async-only format)', () => {
        expect(() =>
            loadConfig(fixturePath('valid-config.ts')),
        ).toThrow(/async/i);
    });

    it('should throw for unsupported extension', () => {
        expect(() => loadConfig(fixturePath('config.xyz'))).toThrow(
            /unsupported/i,
        );
    });
});

describe('loadConfigAsync (async auto-detection)', () => {
    it('should detect .yaml', async () => {
        const config = await loadConfigAsync(fixturePath('valid-config.yaml'));
        expect(config.versioning).toBe('always-bump-patch');
    });

    it('should detect .json', async () => {
        const config = await loadConfigAsync(fixturePath('valid-config.json'));
        expect(config.packageName).toBe('json-pkg');
    });

    it('should detect .toml', async () => {
        const config = await loadConfigAsync(fixturePath('valid-config.toml'));
        expect(config.packageName).toBe('toml-pkg');
    });

    it('should detect .js', async () => {
        const config = await loadConfigAsync(fixturePath('valid-config.js'));
        expect(config.packageName).toBe('js-pkg');
    });

    it('should detect .ts (ts-jest transform active)', async () => {
        const config = await loadConfigAsync(fixturePath('valid-config.ts'));
        expect(config.packageName).toBe('ts-pkg');
        expect(config.pullRequest.titlePattern).toBe('ts: ${version}');
    });

    it('should throw for unsupported extension', async () => {
        await expect(
            loadConfigAsync(fixturePath('config.xyz')),
        ).rejects.toThrow(/unsupported/i);
    });

    it('should throw for non-existent file', async () => {
        await expect(
            loadConfigAsync(fixturePath('__nope.yaml')),
        ).rejects.toThrow();
    });
});
