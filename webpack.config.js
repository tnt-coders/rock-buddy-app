var path = require('path');

module.exports = {
    target: 'electron-renderer',
    entry: {
        sniffer: './dist/sniffer/main.js',
        search: './dist/search/main.js',
        profile: './dist/profile/main.js',
        rank: './dist/rank/main.js',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name]/bundle.js',
    },
};