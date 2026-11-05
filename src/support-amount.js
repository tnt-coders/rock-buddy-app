// Match the website's USD amount rules in both the renderer and the main process.
function supportAmount(value) {
    if (typeof value !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(value)) return null;
    const cents = Math.round(Number(value) * 100);
    return cents >= 500 ? (cents / 100).toFixed(2) : null;
}

module.exports = { supportAmount };
