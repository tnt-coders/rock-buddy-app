export class SoundEffect {
    _sounds: HTMLAudioElement[] = [];
    _lastMisses?: number;
    _enabled: boolean = false;

    public static async create(type: string, path: string | null) {
        let soundEffect = new SoundEffect();
        await soundEffect.enable(type, path);
        return soundEffect;
    }

    public enabled(): boolean {
        return this._enabled;
    }

    async enable(type: string, path: string | null) {
        const srcdir = await window.api.getSrcDir();
        const sounds = [];

        if (type === 'guitar_hero') {
            for (let i = 0; i < 6; i++) {
                sounds.push(new Audio(await window.api.pathJoin(srcdir, '../media/guitar_hero', 'miss' + (i + 1) + '.mp3')));
            }
        }
        else if (type == 'doh') {
            const files = await window.api.readDir(await window.api.pathJoin(srcdir, '../media/doh'));
            for (let i = 0; i < files.length; i++) {
                sounds.push(new Audio(await window.api.pathJoin(srcdir, '../media/doh', files[i])));
            }
        }
        else if (type === 'oof') {
            sounds.push(new Audio(await window.api.pathJoin(srcdir, '../media/oof.mp3')));
        }
        else if (type === 'oof2') {
            sounds.push(new Audio(await window.api.pathJoin(srcdir, '../media/oof2.wav')));
        }

        // If a file is selected, load it
        else if (type === 'custom') {
            if (path !== null) {
                sounds.push(new Audio(path));
            }
            else {
                throw new Error('Miss SFX set to "Custom", but no file has been selected.');
            }
        }

        // If a directory is selected load all audio files in the directory
        else if (type === 'custom_multi') {
            if (path !== null) {
                const files = await window.api.readDir(path);
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.wav')) {
                        sounds.push(new Audio(await window.api.pathJoin(path, file)));
                    }
                }
            }
            else {
                throw new Error('Miss SFX set to "Custom (multi)", but no folder has been selected.');
            }
        }
        else if (type === 'none') {
            return;
        }
        else {
            throw new Error('Invalid type encountered trying to add miss SFX: "' + type + '"');
        }

        this._sounds = sounds;

        // Make sure it doesn't play straight after disabling and enabling
        this._lastMisses = undefined;
        this._enabled = true;
    }
    
    disable() {
        for (let sound of this._sounds) {
            sound.remove();
        }

        this._enabled = false;
    }

    update(misses: number | undefined) {
        if (!this._enabled) return;
        if (misses === undefined) return;

        if (this._lastMisses !== undefined) {
            if (misses > this._lastMisses) {
                this.playSound();
            } 
        }

        this._lastMisses = misses
    }

    async playSound() {
        if (this._sounds.length === 0) return;
        this._sounds[Math.floor(Math.random() * this._sounds.length)].play().catch(err => console.log(err))
    }
}