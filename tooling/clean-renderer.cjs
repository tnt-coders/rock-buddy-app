const fs = require('node:fs');
const path = require('node:path');

// Remove compiled pages from earlier builds before creating the single renderer bundle.
fs.rmSync(path.join(__dirname, '..', 'dist'), { recursive: true, force: true });
