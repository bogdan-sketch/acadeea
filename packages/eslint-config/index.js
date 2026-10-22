module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict',
    'plugin:prettier/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-extraneous-class': 'off',
    // Crashes to load under eslint 8.57 + @typescript-eslint 8.60 ("allowShortCircuit"
    // of undefined). Disabled to keep lint runnable; the base style check is minor.
    '@typescript-eslint/no-unused-expressions': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
};
