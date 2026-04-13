module.exports = {
  env: { browser: true, es2021: true, node: true },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['import', 'react'],
  extends: ['eslint:recommended'],
  rules: {
    // 패턴 B/C: 같은 스코프 내 선언 전 참조 금지
    'no-use-before-define': ['error', {
      functions: false,  // [R-07] 함수 선언문은 완전 호이스팅 → 허용
      classes: true,
      variables: true,
    }],

    // 패턴 A: 순환 임포트 금지
    'import/no-cycle': ['error', {
      maxDepth: 5,            // [R-08] 깊이 5로 제한
      ignoreExternal: true,
    }],

    // 모듈 임포트 순서 강제
    'import/order': ['warn', {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
      'newlines-between': 'ignore',
    }],
  },
  settings: {
    react: { version: 'detect' },
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.cjs'],
};
