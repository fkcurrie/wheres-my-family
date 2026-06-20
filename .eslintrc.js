module.exports = {
  extends: ['expo', 'prettier'],
  plugins: ['prettier'],
  ignorePatterns: ['scratch', 'web-dashboard', 'gcp-backend', 'dist', 'public'],
  rules: {
    'prettier/prettier': 'error',
  },
};
