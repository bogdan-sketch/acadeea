module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'auth',
        'recipes',
        'stock',
        'tasks',
        'materials',
        'consumables',
        'mobile-ios',
        'mobile-android',
        'web',
        'api',
        'infra',
        'ci',
        'deps',
      ],
    ],
  },
};
