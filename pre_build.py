import os
import shutil
import subprocess

# Build RockSniffer
def build_rocksniffer(rocksniffer_srcdir):

    # Remove any old RockSniffer cache files
    release_path = "./RockSniffer/RockSniffer/bin/x64/Release/net6.0-windows"
    if os.path.exists(release_path):

        try:
            shutil.rmtree(release_path)
            print(f'Removed directory: {release_path}')
        except Exception as e:
            print(f'Error: {e}')

    # Note: RockSniffer has lots of warnings in the build
    #TODO: Eventually go through all warnings in RockSniffer and resolve them
    print('Executing dotnet build on RockSniffer...')

    try:
        build_output = subprocess.run('dotnet build /p:Configuration=Release /p:Platform=x64', shell=True, cwd=rocksniffer_srcdir, check=True)
        print(f'RockSniffer Build Output: {build_output}')
    except Exception as e:
        print(f'Error executing dotnet build: {e}')

build_rocksniffer('./RockSniffer')