const backendConfig = require('@ackee/styleguide-backend-config/eslint')

module.exports = {
  ...backendConfig,
  ignorePatterns: ['dist', 'src/openapi', 'docs'],
  parserOptions: {
    project: '.eslint.tsconfig.json',
  },
}
