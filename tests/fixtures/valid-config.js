/* eslint-env node */
module.exports = {
    packageName: 'js-pkg',
    versioning: 'always-bump-patch',
    bumpMinorPreMajor: false,
    prerelease: true,
    pullRequest: {
        titlePattern: 'js: ${version}',
        draft: true,
    },
    github: {
        fork: true,
    },
};
