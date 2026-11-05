var path = require('path');

module.exports = {
    target: 'web',
    // Keep development bundles compatible with pages that disallow eval in their CSP.
    devtool: 'source-map',
    entry: { ui: './dist/ui/main.js' },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name]/bundle.js',
    },
};
