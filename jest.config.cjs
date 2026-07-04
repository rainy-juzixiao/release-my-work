/**
 * Jest configuration for testing the config module
 *
 * This project is ESM ("type": "module"), so Jest config is in .cjs to
 * keep it in CommonJS mode — no module-resolution surprises.
 */
module.exports = {
  testEnvironment: 'node',

  moduleFileExtensions: ['ts', 'js', 'json'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },

  moduleNameMapper: {
    '^#@/(.*)\\.js$': '<rootDir>/src/$1',
  },

  testMatch: ['<rootDir>/tests/**/*.test.ts'],

  // Collect coverage only from the source module under test
  collectCoverageFrom: ['src/config/index.ts'],
};
