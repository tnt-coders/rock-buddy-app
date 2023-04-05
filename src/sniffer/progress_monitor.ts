// import { approxEqual } from "../common/functions";
// import { sussyError, sussyWarning, clearSussyWarning } from "./functions";
// import { Rocksniffer } from "./rocksniffer";

// // private static readonly pauseThreshold: number = 10; // Time that a song must be paused before detecting a pause has occurred
// // private static readonly minPauseRate: number = 10 * 60; // seconds (only allow pausing once every 10 minutes for verified scores)

// export class ProgressMonitor {
//     private static readonly refreshRate: 100 // milliseconds
//     private static readonly songLengthTolerance: number = 5 // seconds (play time must be within 5 seconds of the length of the song for verified scores)

//     private _rocksniffer: Rocksniffer;
//     private _previousRocksnifferData: any = null;

//     private _refreshCounter = 0;
//     private _pauseCounter = 0;
//     private _pauseTime = 0;
//     private _lastPauseTime = 0;
    
//     private _verifiedScore = true;

//     public constructor(rocksniffer: Rocksniffer) {
//         this._rocksniffer = rocksniffer;
//     }

//     public start(): void {
//         setInterval(this.refresh.bind(this), ProgressMonitor.refreshRate);
//     }

//     private async refresh(): Promise<void> {
//         const rocksnifferData = await this._rocksniffer.sniff() as any;
//         if (rocksnifferData === null) {
//             return;
//         }

//         // Cannot proceed until we have a previous data set to work with
//         if (this._previousRocksnifferData === null) {
//             this._previousRocksnifferData = rocksnifferData;
//             return;
//         }

//         const songTime = rocksnifferData['memoryReadout']['songTimer'];
//         const previousSongTime = this._previousRocksnifferData['memoryReadout']['songTimer'];
//         const previousSongLength = this._previousRocksnifferData['songDetails']['songLength'];

//         // If song time is 0 we are not in a song
//         // Reset values and return
//         if (approxEqual(songTime, 0)) {

//             // If we were just in a song, check if the score is verified. If it is record it!
//             if (!approxEqual(previousSongTime, 0)) {
//                 if (this._verifiedScore) {
//                     //TODO record verified score
//                 }
//             }
//             this._pauseCounter = 0;
//             this._pauseTime = 0;
//             this._lastPauseTime = 0;
//             this._verifiedScore = true;

//             return;
//         }

//         // Check if a song has started
//         else if (approxEqual(previousSongTime, 0)) {

//             // Synchronize the counter with the song start time
//             this._refreshCounter = songTime * 1000 / Sniffer.refreshRate;
//         }

//         // Check if the song is paused (limited for verified scores)
//         else if (approxEqual(songTime, previousSongTime)) {

//             // Sometimes previous data has the same time even without pausing
//             // This ensures that a full second passes before counting that a pause has occurred
//             if (this._pauseCounter < Sniffer.pauseThreshold) {
//                 this._pauseCounter++;
//             }

//             // If we are already paused these times will match
//             else if (!approxEqual(this._pauseTime, songTime)) {
//                 this._pauseTime = songTime;

//                 // If the song was previously paused check if it was long enough ago to keep the score verified
//                 if (!approxEqual(this._lastPauseTime, 0)) {
//                     if (this._pauseTime - this._lastPauseTime > Sniffer.minPauseRate) {
//                         console.log("PAUSE TIME: " + this._pauseTime);
//                         console.log("LASTPTIME: " + this._lastPauseTime);
//                         console.log("ERROR1");
//                         sussyError();
//                         this._verifiedScore = false;
//                     }
//                 }

//                 if (this._verifiedScore) {
//                     console.log("PREVIOUS TIME: " + previousSongTime);
//                     console.log("CURRENT TIME: " + songTime);
//                     console.log("Here I am");
//                     sussyWarning();
//                 }
//             }
//         }
//     }
// };