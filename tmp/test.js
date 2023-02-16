const fs = require('fs');
const crypto = require('crypto');

// Read the binary file
fs.readFile('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Rocksmith2014\\dlc\\rs1compatibilitydisc_p.psarc', (err, data) => {
  if (err) throw err;

  // Generate an MD5 hash from the contents of the file
  const hash = crypto.createHash('md5').update(data).digest('hex');

  // Encode the hash in base64
  const base64Hash = Buffer.from(hash, 'hex').toString('base64');

  console.log(`Base64 encoded hash: ${base64Hash}`);
});