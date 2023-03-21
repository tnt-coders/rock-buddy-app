var path = require('path');

module.exports = {
  target: 'electron-renderer',
  entry: {
    sniffer: './dist/sniffer/sniffer.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/bundle.js'
  },
};