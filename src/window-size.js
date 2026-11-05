// Shared limits keep Config validation and native window resizing in sync.
const MINIMUM_SIZE = Object.freeze({ width: 640, height: 480 });
const MAXIMUM_SIZE = 16384;

module.exports = { MINIMUM_SIZE, MAXIMUM_SIZE };
