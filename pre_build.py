import os
import shutil
import subprocess

# Build RockSniffer
def build_rocksniffer(rocksniffer_srcdir):

    # Note: RockSniffer has lots of warnings in the build
    #TODO: Eventually go through all warnings in RockSniffer and resolve them
    print('Executing dotnet build on RockSniffer...')

    try:
        build_output = subprocess.run('dotnet build /p:LangVersion=12.0 /p:Configuration=Release /p:Platform=x64', shell=True, cwd=rocksniffer_srcdir, check=True)
        print(f'RockSniffer Build Output: {build_output}')
    except Exception as e:
        print(f'Error executing dotnet build: {e}')

build_rocksniffer('./RockSniffer')