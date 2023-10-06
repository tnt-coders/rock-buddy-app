export class SoundEffect {
    _sounds: HTMLAudioElement[] = [];
    _lastMisses?: number;
    _enabled: boolean = false;

    constructor(type: string, path: string | null) {
        this.enable(type, path)
    }

    async enable(type: string, path: string | null) {
        const srcdir = await window.api.getSrcDir();
        const sounds = [];

        if (type === "guitar_hero") {
            for (let i = 0; i < 6; i++) {
                sounds.push(new Audio(srcdir + `/../media/guitar_hero/miss${i + 1}.mp3`));
            }
        }
        else if (type === "oof") {
            sounds.push(new Audio(srcdir + '/../media/oof.mp3'));
        }
        else if (type === "custom" && path !== null) {
            sounds.push(new Audio(path));
        }
        else if (type === "none") {
            return;
        }
        else {
            throw new Error("Invalid sound encountered trying to add miss SFX.");
        }

        this._sounds = sounds;

        // Make sure it doesn't play straight after disabling and enabling
        this._lastMisses = undefined;
        this._enabled = true;
    }
    
    public enabled(): boolean {
        return this._enabled;
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