var path = require('path');

module.exports = {
    target: 'electron-renderer',
    entry: {
        sniffer: './dist/sniffer/main.js',
        stats: './dist/stats/main.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name]/bundle.js'
    },
};