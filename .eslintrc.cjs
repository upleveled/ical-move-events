/** @type {import('@typescript-eslint/utils').TSESLint.Linter.Config} */
const config = {
  extends: ['upleveled'],
  plugins: ['eslint-comments'],
  rules: {
    // Warn on eslint-disable directives without matching eslint-enable, while still allowing
    // disabling rules for the whole file
    // https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/disable-enable-pair.html
    'eslint-comments/disable-enable-pair': ['warn', { allowWholeFile: true }],
    // Warn on duplicate ESLint disable directives
    // https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/no-duplicate-disable.html
    'eslint-comments/no-duplicate-disable': 'warn',
    // Warn on ESLint disable directives without a rule name
    // https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/no-unlimited-disable.html
    'eslint-comments/no-unlimited-disable': 'warn',
    // Warn on unused ESLint disable directives
    // https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/no-unused-disable.html
    'eslint-comments/no-unused-disable': 'warn',
    // Warn on missing description text for ESLint disable comments
    // https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/require-description.html
    'eslint-comments/require-description': 'warn',
  },
};

module.exports = config;
