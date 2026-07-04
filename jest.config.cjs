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
    // Strip .js extension from relative imports so Jest resolves .ts files
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Project-internal path alias
    '^#@/(.*)\\.js$': '<rootDir>/src/$1',
  },

  testMatch: ['<rootDir>/tests/**/*.test.ts'],

  // Collect coverage from the config module and utilities
  collectCoverageFrom: [
    'src/config/**/*.ts',
    'src/utils/**/*.ts',
  ],
};
