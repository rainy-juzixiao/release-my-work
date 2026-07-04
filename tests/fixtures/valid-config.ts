/* eslint-env node */
export default {
    packageName: 'ts-pkg',
    versioning: 'always-bump-patch',
    bumpMinorPreMajor: false,
    prerelease: true,
    pullRequest: {
        titlePattern: 'ts: ${version}',
        draft: true,
    },
    github: {
        fork: true,
    },
};
