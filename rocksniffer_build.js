const { execSync } = require('child_process');

// Note: RockSniffer has lots of warnings in the build
//TODO: Eventually go through all warnings in RockSniffer and resolve them
try {
    console.log('Executing dotnet build on RockSniffer...');
    const cleanOutput = execSync('dotnet clean', { cwd: './RockSniffer' });
    console.log(`RockSniffer Clean Output:\n${cleanOutput}`);
    
    const buildOutput = execSync('dotnet build /p:Configuration=Release /p:Platform=x64', { cwd: './RockSniffer' });
    console.log(`RockSniffer Build Output:\n${buildOutput}`)
}

catch (error) {
    console.error(`Error executing dotnet build: ${error.message}`);
}