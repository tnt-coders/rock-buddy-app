const { execSync } = require('child_process');

// Note: RockSniffer has lots of warnings in the build
//TODO: Eventually go through all warnings in RockSniffer and resolve them
try {
    console.log('Executing dotnet build on RockSniffer...');
    const output = execSync('dotnet build /p:Configuration=Release /p:Platform=x64', { cwd: './RockSniffer' });
    console.log(`RockSniffer Build Output:\n${output}`)
}

catch (error) {
    console.error(`Error executing dotnet build: ${error.message}`);
}