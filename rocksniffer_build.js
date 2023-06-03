const { execSync } = require('child_process');
const fs = require('fs-extra');

// Remove any old Rocksniffer cache files
const releasePath = "./RockSniffer/RockSniffer/bin/x64/Release/net6.0-windows";
if (fs.existsSync(releasePath)) {
    fs.removeSync(releasePath);
    console.log(`Removed directory: ${releasePath}`);
}

// Note: RockSniffer has lots of warnings in the build
//TODO: Eventually go through all warnings in RockSniffer and resolve them
try {
    console.log('Executing dotnet build on RockSniffer...');
    const buildOutput = execSync('dotnet build /p:Configuration=Release /p:Platform=x64', { cwd: './RockSniffer' });
    console.log(`RockSniffer Build Output:\n${buildOutput}`)
}

catch (error) {
    console.error(`Error executing dotnet build: ${error.message}`);
}