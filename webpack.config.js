var path = require('path');

module.exports = {
    target: 'electron-renderer',
    entry: {
        sniffer: './dist/sniffer/main.js',
        search: './dist/search/main.js',
        stats: './dist/stats/main.js',
        rank: './dist/rank/main.js',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name]/bundle.js',
    },
};