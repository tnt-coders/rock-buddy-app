const { execSync } = require('child_process');
const _msbuild = require('msbuild');

let msbuild = new _msbuild();
msbuild.sourcePath = './RockSniffer/Rocksniffer.sln';
msbuild.configuration = 'Release';

// Suppress warnings (I know this is bad practice but this isn't my code lol)
let overrideParams = [];
overrideParams.push('/p:Platform=x64');
overrideParams.push('/p:WarningLevel=0');

msbuild.config('overrideParams', overrideParams);

try {
    const output = execSync('dotnet restore', { cwd: './Rocksniffer/Rocksniffer' });
    console.log(`Command output:\n${output}`);
} catch (error) {
    console.error(`Error executing command: ${error.message}`);
}

msbuild.build();