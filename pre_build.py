import os
import shutil
import subprocess

# Build RockSniffer
def build_rocksniffer(rocksniffer_srcdir):

    # Remove any old RockSniffer build files
    rocksniffer_bin = "./RockSniffer/RockSniffer/bin"
    if os.path.exists(rocksniffer_bin):

        try:
            shutil.rmtree(rocksniffer_bin)
            print(f'Removed directory: {rocksniffer_bin}')
        except Exception as e:
            print(f'Error: {e}')

    # Note: RockSniffer has lots of warnings in the build
    #TODO: Eventually go through all warnings in RockSniffer and resolve them
    print('Executing dotnet build on RockSniffer...')

    try:
        build_output = subprocess.run('dotnet build /p:LangVersion=10.0 /p:Configuration=Release /p:Platform=x64', shell=True, cwd=rocksniffer_srcdir, check=True)
        print(f'RockSniffer Build Output: {build_output}')
    except Exception as e:
        print(f'Error executing dotnet build: {e}')

build_rocksniffer('./RockSniffer')