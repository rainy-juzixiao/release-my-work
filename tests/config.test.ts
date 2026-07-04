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
import * as fs from 'node:fs';

import {
    loadConfigFromYaml,
    defaultConfig,
} from '#@/config/index.js';

const fixturesDir = path.join(__dirname, 'fixtures');

const fixturePath = (name: string): string => path.join(fixturesDir, name);

/** Build a temporary YAML fixture, run `fn`, then clean it up. */
function withTempYaml(content: string, fn: (p: string) => void): void {
    const tmp = path.join(fixturesDir, `__tmp_${Date.now()}.yaml`);
    try {
        fs.writeFileSync(tmp, content, 'utf-8');
        fn(tmp);
    } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
}

describe('defaultConfig', () => {
    it('should have expected top-level values', () => {
        expect(defaultConfig.releaseType).toBe('node');
        expect(defaultConfig.packageName).toBe('release-my-work');
        expect(defaultConfig.includeVInTag).toBe(true);
        expect(defaultConfig.versioning).toBe('default');
        expect(defaultConfig.bumpMinorPreMajor).toBe(true);
        expect(defaultConfig.bumpPatchForMinorPreMajor).toBe(false);
        expect(defaultConfig.releaseAs).toBe('');
        expect(defaultConfig.prerelease).toBe(false);
        expect(defaultConfig.prereleaseType).toBe('');
        expect(defaultConfig.changelogPath).toBe('CHANGELOG.md');
        expect(defaultConfig.changelogType).toBe('default');
        expect(defaultConfig.changelogHost).toBe('https://github.com');
        expect(defaultConfig.extraFiles).toEqual([]);
        expect(defaultConfig.releaseSearchDepth).toBe(400);
        expect(defaultConfig.commitSearchDepth).toBe(500);
        expect(defaultConfig.sequentialCalls).toBe(false);
        expect(defaultConfig.skipLabeling).toBe(false);
    });

    it('should have 11 changelog sections', () => {
        expect(defaultConfig.changelogSections).toHaveLength(11);
    });

    it('should have default pullRequest config', () => {
        expect(defaultConfig.pullRequest.titlePattern).toBe(
            'chore${scope}: release${component} ${version}',
        );
        expect(defaultConfig.pullRequest.header).toBe('');
        expect(defaultConfig.pullRequest.footer).toBe('');
        expect(defaultConfig.pullRequest.draft).toBe(false);
        expect(defaultConfig.pullRequest.labels).toEqual([
            'autorelease: pending',
        ]);
        expect(defaultConfig.pullRequest.releaseLabel).toEqual({
            autorelease: 'tagged',
        });
        expect(defaultConfig.pullRequest.skipLabel).toBe('');
        expect(defaultConfig.pullRequest.date).toBe(true);
    });

    it('should have default github config', () => {
        expect(defaultConfig.github.fork).toBe(false);
        expect(defaultConfig.github.draft).toBe(false);
        expect(defaultConfig.github.prerelease).toBe(false);
        expect(defaultConfig.github.skipGitHubRelease).toBe(false);
        expect(defaultConfig.github.signoff).toBe('');
    });
});

describe('loadConfigFromYaml', () => {
    it('should return a complete ReleaseConfig from a valid YAML file', () => {
        const config = loadConfigFromYaml(fixturePath('valid-config.yaml'));
        expect(config).toBeDefined();
        expect(typeof config).toBe('object');
    });

    it('should override defaults for camelCase keys present in the YAML', () => {
        const config = loadConfigFromYaml(fixturePath('valid-config.yaml'));

        expect(config.versioning).toBe('always-bump-patch');
        expect(config.prerelease).toBe(true);

        expect(config.github.fork).toBe(true);
        expect(config.github.draft).toBe(true);
        expect(config.github.prerelease).toBe(true);
        expect(config.github.signoff).toBe('Test Bot <bot@example.com>');
    });

    it('should keep defaults for kebab-case keys that do not match', () => {
        const config = loadConfigFromYaml(fixturePath('valid-config.yaml'));

        expect(config.releaseType).toBe('node');
        expect(config.packageName).toBe('release-my-work');
        expect(config.includeVInTag).toBe(true);
        expect(config.bumpMinorPreMajor).toBe(true);
        expect(config.bumpPatchForMinorPreMajor).toBe(false);
        expect(config.releaseAs).toBe('');
        expect(config.prereleaseType).toBe('');
        expect(config.changelogPath).toBe('CHANGELOG.md');
        expect(config.changelogType).toBe('default');
        expect(config.changelogHost).toBe('https://github.com');
        expect(config.extraFiles).toEqual([]);
        expect(config.releaseSearchDepth).toBe(400);
        expect(config.commitSearchDepth).toBe(500);
        expect(config.sequentialCalls).toBe(false);
        expect(config.skipLabeling).toBe(false);
    });

    it('should keep defaults for pull-request (kebab-case key, no match)', () => {
        const config = loadConfigFromYaml(fixturePath('valid-config.yaml'));

        expect(config.pullRequest.titlePattern).toBe(
            'chore${scope}: release${component} ${version}',
        );
        expect(config.pullRequest.header).toBe('');
        expect(config.pullRequest.footer).toBe('');
        expect(config.pullRequest.draft).toBe(false);
        expect(config.pullRequest.labels).toEqual(['autorelease: pending']);
        expect(config.pullRequest.releaseLabel).toEqual({
            autorelease: 'tagged',
        });
        expect(config.pullRequest.skipLabel).toBe('');
        expect(config.pullRequest.date).toBe(true);
    });

    it('should keep defaults for changelog-sections (kebab-case key)', () => {
        const config = loadConfigFromYaml(fixturePath('valid-config.yaml'));

        expect(config.changelogSections).toHaveLength(11);
        expect(config.changelogSections[0]).toEqual({
            type: 'feat',
            section: 'Features',
            hidden: false,
        });
    });

    it('should keep defaults for skip-github-release (kebab-case nested key)', () => {
        const config = loadConfigFromYaml(fixturePath('valid-config.yaml'));

        expect(config.github.skipGitHubRelease).toBe(false);
    });

    it('should keep defaults when partial YAML does not override them', () => {
        const config = loadConfigFromYaml(fixturePath('partial-config.yaml'));

        expect(config.releaseType).toBe('node');
        expect(config.packageName).toBe('release-my-work');
        expect(config.bumpMinorPreMajor).toBe(true);
        expect(config.pullRequest.labels).toEqual(['autorelease: pending']);
    });

    it('should override for camelCase keys in partial YAML', () => {
        const config = loadConfigFromYaml(fixturePath('partial-config.yaml'));

        expect(config.github.fork).toBe(true);
        expect(config.github.draft).toBe(false);
        expect(config.github.signoff).toBe('');
    });

    it('should return default config when YAML resolves to null', () => {
        withTempYaml('null\n', (yamlPath) => {
            const config = loadConfigFromYaml(yamlPath);
            expect(config).toEqual(defaultConfig);
        });
    });

    it('should return default config when YAML resolves to undefined (~)', () => {
        withTempYaml('~\n', (yamlPath) => {
            const config = loadConfigFromYaml(yamlPath);
            expect(config).toEqual(defaultConfig);
        });
    });

    it('should throw when YAML content is empty', () => {
        withTempYaml('', (yamlPath) => {
            expect(() => loadConfigFromYaml(yamlPath)).toThrow();
        });
    });

    it('should throw when YAML contains only comments', () => {
        withTempYaml('# just a comment\n# another comment\n', (yamlPath) => {
            expect(() => loadConfigFromYaml(yamlPath)).toThrow();
        });
    });

    it('should throw when the YAML file does not exist', () => {
        expect(() =>
            loadConfigFromYaml(fixturePath('__does_not_exist.yaml')),
        ).toThrow();
    });

    it('should throw for malformed YAML content', () => {
        expect(() =>
            loadConfigFromYaml(fixturePath('invalid.yaml')),
        ).toThrow();
    });

    it('should throw when path is a directory', () => {
        expect(() => loadConfigFromYaml(fixturesDir)).toThrow();
    });
});
