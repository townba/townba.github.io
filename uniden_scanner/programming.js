"use strict";
let scanner;
let timerGPS;
let watchPositionID;
let currentCoords;
const sendGPSInfoIntervalMilliseconds = 2000;
class Channel {
    static invalidTagRegExp = /[^\x20-\x2B\x2D-\x7E]/g;
    static ctcssTones = [
        67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4,
        88.5, 91.5, 94.8, 97.4, 100.0, 103.5, 107.2, 110.9,
        114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2,
        151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
        177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5,
        203.5, 206.5, 210.7, 218.1, 225.7, 229.1, 233.6, 241.8,
        250.3, 254.1
    ];
    static dcsCodes = [
        23, 25, 26, 31, 32, 36, 43, 47,
        51, 53, 54, 65, 71, 72, 73, 74,
        114, 115, 116, 122, 125, 131, 132, 134,
        143, 145, 152, 155, 156, 162, 165, 172,
        174, 205, 212, 223, 225, 226, 243, 244,
        245, 246, 251, 252, 255, 261, 263, 265,
        266, 271, 274, 306, 311, 315, 325, 331,
        332, 343, 346, 351, 356, 364, 365, 371,
        411, 412, 413, 423, 431, 432, 445, 446,
        452, 454, 455, 462, 464, 465, 466, 503,
        506, 516, 523, 526, 532, 546, 565, 606,
        612, 624, 627, 631, 632, 654, 662, 664,
        703, 712, 723, 731, 732, 734, 743, 754
    ];
    _location;
    _name;
    _frequency;
    modulation;
    _toneCode;
    _delay;
    lockout;
    priority;
    constructor() {
        this._location = 1;
        this._name = "";
        this._frequency = 0;
        this.modulation = Channel.Modulation.AUTO;
        this._toneCode = 0;
        this._delay = 2;
        this.lockout = false;
        this.priority = false;
    }
    isEmpty() {
        return this._name === "" && this._frequency === 0;
    }
    static isValidLocation(given) {
        return given >= 1 && given <= 500;
    }
    get location() { return this._location; }
    set location(given) {
        if (Channel.isValidLocation(given)) {
            this._location = given;
        }
    }
    static isValidName(given) {
        return !given.match(this.invalidTagRegExp) && given.length <= 16;
    }
    get name() { return this._name; }
    set name(given) {
        this._name = given.replace(Channel.invalidTagRegExp, "?").slice(0, 16);
    }
    static isValidFrequency(given) {
        return (given === 0 ||
            (given >= 25000000 && given <= 54000000) ||
            (given >= 108000000 && given <= 174000000) ||
            (given >= 225000000 && given <= 380000000) ||
            (given >= 400000000 && given <= 512000000));
    }
    get frequency() { return this._frequency; }
    set frequency(given) {
        if (Channel.isValidFrequency(given)) {
            this._frequency = given;
        }
    }
    static isValidCtcssTone(given) {
        return Channel.ctcssTones.indexOf(given) >= 0;
    }
    static isValidDcsCode(given) {
        return Channel.dcsCodes.indexOf(given) >= 0;
    }
    get toneCode() {
        return this._toneCode;
    }
    set ctcssTone(given) {
        const i = Channel.ctcssTones.indexOf(given);
        if (i >= 0) {
            this._toneCode = i + 64;
        }
    }
    set dcsCode(given) {
        const i = Channel.dcsCodes.indexOf(given);
        if (i >= 0) {
            this._toneCode = i + 128;
        }
    }
    setCtcssDcsOff() {
        this._toneCode = 0;
    }
    setCtcssDcsSearch() {
        this._toneCode = 127;
    }
    setCtcssDcsNone() {
        this._toneCode = 240;
    }
    static isValidDelay(given) {
        return [-10, -5, 0, 1, 2, 3, 4, 5].indexOf(given) >= 0;
    }
    get delay() { return this._delay; }
    set delay(delayGiven) {
        if (delayGiven <= -7.5)
            this._delay = -10;
        else if (delayGiven < 0)
            this._delay = -5;
        else if (delayGiven < 0.5)
            this._delay = 0;
        else if (delayGiven < 1.5)
            this._delay = 1;
        else if (delayGiven < 2.5)
            this._delay = 2;
        else if (delayGiven < 3.5)
            this._delay = 3;
        else if (delayGiven < 4.5)
            this._delay = 4;
        else
            this._delay = 5;
    }
    getCommand() {
        let modulation = "AUTO";
        switch (this.modulation) {
            case Channel.Modulation.AUTO:
                modulation = "AUTO";
                break;
            case Channel.Modulation.AM:
                modulation = "AM";
                break;
            case Channel.Modulation.FM:
                modulation = "FM";
                break;
            case Channel.Modulation.NFM:
                modulation = "NFM";
                break;
        }
        return ["CIN", this.location, (this.name === "" ? " " : this.name),
            ("00000000" + Math.floor(this.frequency / 100)).slice(-8),
            modulation, this.toneCode, this.delay,
            this.lockout ? "1" : "0", this.priority ? "1" : "0"]
            .join(",");
    }
}
(function (Channel) {
    let Modulation;
    (function (Modulation) {
        Modulation[Modulation["AUTO"] = 0] = "AUTO";
        Modulation[Modulation["AM"] = 1] = "AM";
        Modulation[Modulation["FM"] = 2] = "FM";
        Modulation[Modulation["NFM"] = 3] = "NFM";
    })(Modulation = Channel.Modulation || (Channel.Modulation = {}));
    ;
})(Channel || (Channel = {}));
let inputEditor;
function clearResponses() {
    const outputTextArea = document.getElementById("output");
    if (outputTextArea instanceof HTMLTextAreaElement) {
        outputTextArea.value = "";
    }
}
window.clearResponses = clearResponses;
function getScannerEventCallback(output) {
    if (!(output instanceof HTMLTextAreaElement)) {
        return undefined;
    }
    return function (eventType, data) {
        output.value += "[" + eventType + "] " + data + "\n";
        output.scrollTop = output.scrollHeight;
        if (eventType === "response") {
            const parts = data.split(",");
            if (parts.length >= 2 && parts[1] !== undefined) {
                if (["ERR", "NG"].includes(parts[1])) {
                    const errorCountSpan = document.getElementById("error_count");
                    if (errorCountSpan) {
                        errorCountSpan.innerText =
                            (parseInt(errorCountSpan.innerText) + 1).toString();
                    }
                }
            }
        }
    };
}
async function sendCommands() {
    let shouldConnect = false;
    const outputTextArea = document.getElementById("output");
    if (outputTextArea instanceof HTMLTextAreaElement) {
        if (!scanner) {
            scanner = new UnidenScanner(getScannerEventCallback(outputTextArea));
            shouldConnect = true;
        }
    }
    if (!scanner) {
        throw new Error("unable to create UnidenScanner class");
    }
    try {
        if (shouldConnect) {
            try {
                await scanner.connect();
            }
            catch (e) {
                scanner = undefined;
                return;
            }
        }
        const commands = inputEditor.value
            .split("\n").filter((fullLine) => {
            const line = fullLine;
            return line.length > 0 && line[0] !== "#";
        });
        for (const command of commands) {
            await scanner.sendCommand(command, command === "CLR" ? 30000 : undefined);
        }
    }
    catch (e) {
        throw new Error("skipping remaining commands: " +
            (e instanceof Error) ? e.message : "unknown");
    }
}
window.sendCommands = sendCommands;
function latlongAsGPSString(latlongAsDecimal, isLongitude) {
    if (latlongAsDecimal == null) {
        return ",";
    }
    const places = 4;
    const n = Math.round(Math.abs(latlongAsDecimal) * 60 * 10 ** places);
    return Math.floor(n / (60 * 10 ** places)).toString().padStart(isLongitude ? 3 : 2, "0") +
        ((n / 10 ** places) % 60).toFixed(places).padStart(places + (places > 0 ? 1 : 0) + 2, "0") + "," +
        (latlongAsDecimal < 0 ? (isLongitude ? "W" : "S") : (isLongitude ? "E" : "N"));
}
function clampNumber(n, min, max) {
    if (n < min) {
        return min;
    }
    else if (n > max) {
        return max;
    }
    else {
        return n;
    }
}
function wrapDegrees(n) {
    return ((n % 360) + 360) % 360;
}
function addNMEA0183Checksum(sentence) {
    return sentence + "*" + sentence.split("").map((v) => {
        return v.charCodeAt(0);
    }).reduce((a, v) => {
        return a ^ v;
    }).toString(16).toUpperCase().padStart(2, "0");
}
async function sendGPSInformation(coords) {
    if (!scanner) {
        return;
    }
    const now = new Date();
    const timeGPSString = now.getUTCHours().toString().padStart(2, "0") +
        now.getUTCMinutes().toString().padStart(2, "0") +
        now.getUTCSeconds().toString().padStart(2, "0");
    const latitudeGPSString = latlongAsGPSString(clampNumber(coords.latitude, -90, 90), false);
    const longitudeGPSString = latlongAsGPSString(wrapDegrees(coords.longitude + 180) - 180, true);
    const altitudeGPSString = (coords.altitude == null) ? "" :
        clampNumber(Math.round(coords.altitude), Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).toString();
    const speedGPSString = (coords.speed == null) ? "" :
        (clampNumber(coords.speed, 0, 299792458) * 1.94384449244).toFixed(0);
    const headingGPSString = (coords.heading == null) ? "" :
        wrapDegrees(Math.round(coords.heading)).toString().padStart(3, "0");
    await scanner.write("$" + addNMEA0183Checksum(`GPRMC,${timeGPSString},A,` +
        `${latitudeGPSString},${longitudeGPSString},${speedGPSString},` +
        `${headingGPSString}`));
    await scanner.write("$" + addNMEA0183Checksum(`GPGGA,${timeGPSString},` +
        `${latitudeGPSString},${longitudeGPSString},1,,,${altitudeGPSString},M`));
}
async function toggleWatchGPSPosition() {
    const gpsInfoSpan = document.getElementById("gps_info");
    if (!watchPositionID) {
        watchPositionID = navigator.geolocation.watchPosition((position) => {
            currentCoords = position.coords;
            if (gpsInfoSpan) {
                gpsInfoSpan.innerText = new Date().toString() + ": " + JSON.stringify(position.coords);
            }
        });
    }
    else {
        navigator.geolocation.clearWatch(watchPositionID);
        watchPositionID = undefined;
        if (gpsInfoSpan) {
            gpsInfoSpan.innerText = "(stopped) " + gpsInfoSpan.innerText;
        }
    }
}
window.toggleWatchGPSPosition = toggleWatchGPSPosition;
async function sendGPSInformationAndSetTimer() {
    if (typeof currentCoords !== "undefined") {
        if (scanner) {
            await sendGPSInformation(currentCoords);
        }
    }
    timerGPS = window.setTimeout(sendGPSInformationAndSetTimer, sendGPSInfoIntervalMilliseconds);
}
async function toggleSendGPSTimer() {
    const outputTextArea = document.getElementById("output");
    let shouldConnect = false;
    if (outputTextArea instanceof HTMLTextAreaElement) {
        if (!scanner) {
            scanner = new UnidenScanner(getScannerEventCallback(outputTextArea));
            shouldConnect = true;
        }
    }
    if (!scanner) {
        throw new Error("Unable to create UnidenScanner class.");
    }
    if (shouldConnect) {
        await scanner.connect();
    }
    if (!timerGPS) {
        await sendGPSInformationAndSetTimer();
    }
    else {
        clearTimeout(timerGPS);
        timerGPS = undefined;
    }
}
function toggleSendGPSTimerSync() {
    try {
        toggleSendGPSTimer();
    }
    catch (e) {
        alert("Aborting sending GPS information: " +
            (e instanceof Error) ? e.message : "unknown");
    }
}
window.toggleSendGPSTimerSync = toggleSendGPSTimerSync;
function makeError(lineNumber, message) {
    return ("# Import error" +
        (lineNumber ? (", line " + lineNumber) : "") +
        ": " + message);
}
function makeWarning(lineNumber, message) {
    return ("# Import warning" +
        (lineNumber ? (", line " + lineNumber) : "") +
        ": " + message);
}
function parseIntRange(value, min, max, { header, lineNumber, warningMessage, errorMessage }) {
    const result = parseInt(value ?? "");
    if (Number.isNaN(result) || result < min || result > max) {
        if (errorMessage) {
            header.push(makeError(lineNumber, errorMessage + ": " + value));
            return undefined;
        }
        else if (warningMessage) {
            header.push(makeWarning(lineNumber, warningMessage + ": " + value));
            return undefined;
        }
    }
    return result;
}
;
function splitCSV(text) {
    const pat = /^(?:(?<nonescaped>[^\x00-\x1F",]+)|(?:"(?<escaped>(?:[^"]|"")*)")|)(?<next>[,\n]|\r\n|$)/;
    const ret = [];
    let row = [];
    while (text) {
        const match = pat.exec(text);
        if (!match || match[0] === undefined || !match.groups) {
            throw new Error("invalid CSV");
        }
        text = text.slice(match[0].length);
        let field = "";
        const nonescaped = match.groups["nonescaped"];
        const escaped = match.groups["escaped"];
        const next = match.groups["next"];
        if (nonescaped !== undefined) {
            field = nonescaped;
        }
        else if (escaped !== undefined) {
            field = escaped.replace(/""/g, '"');
        }
        row.push(field);
        if (next === ",") {
        }
        else if (next && ["\n", "\r\n"].indexOf(next) >= 0) {
            ret.push(row);
            row = [];
        }
        else {
            ret.push(row);
            return ret;
        }
    }
    if (row.length) {
        ret.push(row);
    }
    return ret;
}
function importBC125ATSS(fullText, deleteEmptyChannels, importAllSettings, header) {
    header.push(makeWarning(0, "not all settings are imported"));
    return fullText.split("\n")
        .map((line) => line.replace("\r", ""))
        .map((line, lineNumber0) => {
        const lineNumber = lineNumber0 + 1;
        if (line.startsWith("Misc\t") && importAllSettings) {
            const parts = line.split("\t");
            const backlightMap = {
                "Off": "AF", "On": "AO", "Squelch": "SQ", "Key": "KY", "K+S": "KS"
            };
            const backlight = backlightMap[parts[1] ?? ""] ??
                (header.push(makeWarning(lineNumber, "invalid backlight")),
                    undefined);
            const keyBeepMap = { "Auto": 0, "Off": 99 };
            const keyBeep = keyBeepMap[parts[2] ?? ""] ??
                (header.push(makeWarning(lineNumber, "invalid key beep")),
                    undefined);
            const keyLockMap = { "On": 1, "Off": 0 };
            const keyLock = keyLockMap[parts[3] ?? ""] ??
                (header.push(makeWarning(lineNumber, "invalid key lock")),
                    undefined);
            const contrast = parseIntRange(parts[4], 1, 15, {
                header, lineNumber,
                warningMessage: "invalid contrast"
            });
            const chargeTime = parseIntRange(parts[5], 1, 14, {
                header, lineNumber,
                warningMessage: "invalid charge time"
            });
            const volume = parseIntRange(parts[6], 0, 15, {
                header, lineNumber,
                warningMessage: "invalid volume"
            });
            const squelch = parseIntRange(parts[7], 0, 15, {
                header, lineNumber,
                warningMessage: "invalid squelch"
            });
            const bandPlanMap = { "USA": 0, "Canada": 1 };
            const bandPlan = bandPlanMap[parts[8] ?? ""] ??
                (header.push(makeWarning(lineNumber, "invalid band plan")), 0);
            return [
                (backlight !== undefined) ?
                    ["# Backlight", "BLT," + backlight] : [],
                (keyBeep !== undefined && keyLock !== undefined) ?
                    ["# Key beep and lock", "KBP," + keyBeep + "," + keyLock] : [],
                (contrast !== undefined) ? ["# Contrast", "CNT," + contrast] : [],
                (chargeTime !== undefined) ?
                    ["# Battery charge time", "BSV," + chargeTime] : [],
                (volume !== undefined) ? ["# Volume", "VOL," + volume] : [],
                (squelch !== undefined) ? ["# Squelch", "SQL," + squelch] : [],
                (bandPlan !== undefined) ? ["# Band plan", "BPL," + bandPlan] : [],
            ].flat().join("\n");
        }
        else if (line.startsWith("Priority\t") && importAllSettings) {
            const parts = line.split("\t");
            if (parts.length < 2) {
                return "";
            }
            const priorityMap = {
                "Off": 0, "On": 1, "Plus": 2, "DND": 3
            };
            const priority = priorityMap[parts[1] ?? ""] ??
                (header.push(makeWarning(lineNumber, "invalid priority")),
                    undefined);
            return (priority !== undefined) ? `# Priority\nPRI,${priority}` : "";
        }
        else if (line.startsWith("WxPri\t") && importAllSettings) {
            const parts = line.split("\t");
            if (parts.length < 2) {
                return "";
            }
            const wxPriMap = { "Off": 0, "On": 1 };
            const wxPri = wxPriMap[parts[1] ?? ""] ??
                (header.push(makeWarning(lineNumber, "invalid weather alert priority")),
                    undefined);
            return (wxPri !== undefined) ?
                `# Weather alert priority\nWXS,${wxPri}` : "";
        }
        if (!line.startsWith("C-Freq\t")) {
            return "";
        }
        const parts = line.split("\t");
        const channel = new Channel;
        const location = parseInt(parts[1] ?? "");
        if (Channel.isValidLocation(location)) {
            channel.location = location;
        }
        else {
            header.push(makeError(lineNumber, "invalid location: " + parts[1]));
            return "";
        }
        const name = parts[2];
        if (name === undefined) {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] no name given`));
        }
        else {
            if (!Channel.isValidName(name)) {
                header.push(makeWarning(lineNumber, `[channel ${channel.location}] ` +
                    "invalid name, modifying/truncating: " + parts[2]));
            }
            channel.name = name;
        }
        const frequency = parseInt(parts[3] ?? "");
        if (Channel.isValidFrequency(frequency)) {
            channel.frequency = frequency;
        }
        else {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid frequency: ` + parts[3]));
        }
        if (channel.isEmpty()) {
            if (deleteEmptyChannels) {
                return "DCH," + channel.location;
            }
            return "";
        }
        const modeMap = {
            "Auto": Channel.Modulation.AUTO, "AM": Channel.Modulation.AM,
            "FM": Channel.Modulation.FM, "NFM": Channel.Modulation.NFM
        };
        const mode = modeMap[parts[4] ?? ""];
        if (mode !== undefined) {
            channel.modulation = mode;
        }
        else {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid mode: ` + parts[4]));
        }
        channel.setCtcssDcsSearch();
        if (parts[5] === "Off") {
            channel.setCtcssDcsOff();
        }
        else if (parts[5] === "Srch") {
            channel.setCtcssDcsSearch();
        }
        else if (parts[5] === "NoTone") {
            channel.setCtcssDcsNone();
        }
        else if (parts[5] !== undefined && parts[5].match(/^[CD]/)) {
            const num = parseFloat(parts[5].slice(1));
            if (parts[5][0] === "C") {
                if (Channel.isValidCtcssTone(num)) {
                    channel.ctcssTone = num;
                }
                else {
                    header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid CTCSS tone: ` +
                        parts[5]));
                }
            }
            else if (parts[5][0] === "D") {
                if (Channel.isValidDcsCode(num)) {
                    channel.dcsCode = num;
                }
                else {
                    header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid DCS code: ` +
                        parts[5]));
                }
            }
        }
        else if (parts[5] !== undefined) {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] unknown CTCSS/DCS setting: ` +
                parts[5]));
        }
        const booleanMap = { "On": true, "Off": false };
        const lockout = booleanMap[parts[6] ?? ""];
        if (lockout !== undefined) {
            channel.lockout = lockout;
        }
        else {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid lockout: ` + parts[6]));
        }
        const delay = parseFloat(parts[7] ?? "");
        if (Channel.isValidDelay(delay)) {
            channel.delay = delay;
        }
        else {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid delay: ` + parts[7]));
        }
        const priority = booleanMap[parts[8] ?? ""];
        if (priority !== undefined) {
            channel.priority = priority;
        }
        else {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid priority: ` + parts[8]));
        }
        return channel.getCommand();
    })
        .filter((line) => line);
}
function importChirp(fullText, deleteEmptyChannels, header) {
    const commands = [];
    const chirp = splitCSV(fullText);
    if (!chirp) {
        header.push(makeError(0, "empty file"));
        return [];
    }
    const csvHeader = chirp[0];
    let locationIndex = undefined;
    let nameIndex;
    let frequencyIndex;
    let toneIndex;
    let ctoneIndex;
    let rtoneIndex;
    let dtcsIndex;
    let modeIndex;
    let skipIndex;
    if (csvHeader) {
        locationIndex = csvHeader.indexOf("Location");
        nameIndex = csvHeader.indexOf("Name");
        frequencyIndex = csvHeader.indexOf("Frequency");
        toneIndex = csvHeader.indexOf("Tone");
        ctoneIndex = csvHeader.indexOf("cToneFreq");
        rtoneIndex = csvHeader.indexOf("rToneFreq");
        dtcsIndex = csvHeader.indexOf("DtcsCode");
        modeIndex = csvHeader.indexOf("Mode");
        skipIndex = csvHeader.indexOf("Skip");
    }
    if (locationIndex === undefined) {
        header.push(makeError(0, "Location field not found"));
        return [];
    }
    if (frequencyIndex === undefined) {
        header.push(makeError(0, "Frequency field not found"));
        return [];
    }
    for (let i = 1; i < chirp.length; ++i) {
        const lineNumber = i + 1;
        const row = chirp[i];
        if (row === undefined) {
            header.push(makeError(lineNumber, "invalid row"));
            continue;
        }
        const channel = new Channel;
        const location = parseInt(row[locationIndex] ?? "");
        if (Channel.isValidLocation(location)) {
            channel.location = location;
        }
        else {
            if (location === 0) {
                header.push(makeWarning(lineNumber, "invalid location 0, using channel 500"));
                channel.location = 500;
            }
            else {
                header.push(makeError(lineNumber, "invalid location: " +
                    row[locationIndex]));
                continue;
            }
        }
        if (nameIndex !== undefined) {
            const name = row[nameIndex];
            if (name === undefined) {
                header.push(makeWarning(lineNumber, `[channel ${channel.location}] no name given`));
            }
            else {
                if (!Channel.isValidName(name)) {
                    header.push(makeWarning(lineNumber, `[channel ${channel.location}] ` +
                        "invalid name, modifying/truncating: " + row[nameIndex]));
                }
                channel.name = name;
            }
        }
        const frequency = parseInt(row[frequencyIndex] ?? "") * 1000000;
        if (Channel.isValidFrequency(frequency)) {
            channel.frequency = frequency;
        }
        else {
            header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid frequency: ` +
                row[frequencyIndex]));
        }
        if (channel.isEmpty()) {
            if (deleteEmptyChannels) {
                commands.push("DCH," + channel.location);
            }
            continue;
        }
        if (modeIndex !== undefined) {
            const modeMap = {
                "Auto": Channel.Modulation.AUTO, "AM": Channel.Modulation.AM,
                "FM": Channel.Modulation.FM, "NFM": Channel.Modulation.NFM
            };
            const mode = modeMap[row[modeIndex] ?? ""];
            if (mode !== undefined) {
                channel.modulation = mode;
            }
            else {
                header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid mode: ` + row[modeIndex]));
            }
        }
        channel.setCtcssDcsSearch();
        if (toneIndex !== undefined) {
            const tone = row[toneIndex] ?? "";
            if (tone === "TSQL" || tone === "Tone") {
                let primaryIndex = ctoneIndex;
                let secondaryIndex = rtoneIndex;
                if (tone === "TSQL") {
                    primaryIndex = rtoneIndex;
                    secondaryIndex = ctoneIndex;
                }
                try {
                    let index = primaryIndex;
                    if (index === undefined) {
                        index = secondaryIndex;
                    }
                    const toneString = (index !== undefined) ? row[index] : undefined;
                    if (toneString === undefined) {
                        throw new Error("no CTCSS tone given");
                    }
                    const tone = parseFloat(toneString);
                    if (Channel.isValidCtcssTone(tone)) {
                        channel.ctcssTone = tone;
                    }
                    else {
                        header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid CTCSS tone: ` +
                            row[toneIndex]));
                    }
                }
                catch (e) {
                    header.push(makeWarning(lineNumber, `[channel ${channel.location}] error with CTCSS tone: ` +
                        (e instanceof Error) ? e.message : "unknown"));
                }
            }
            else if (tone === "DTCS") {
                try {
                    const dtcsString = (dtcsIndex !== undefined) ? row[dtcsIndex] : undefined;
                    if (dtcsIndex === undefined || dtcsString === undefined) {
                        throw new Error("no DCS code given");
                    }
                    const code = parseFloat(dtcsString);
                    if (Channel.isValidCtcssTone(code)) {
                        channel.dcsCode = code;
                    }
                    else {
                        header.push(makeWarning(lineNumber, `[channel ${channel.location}] invalid DCS code: ` +
                            row[dtcsIndex]));
                    }
                }
                catch (e) {
                    header.push(makeWarning(lineNumber, `[channel ${channel.location}] error with DCS code: ` +
                        (e instanceof Error) ? e.message : "unknown"));
                }
            }
            else if (tone !== "") {
                header.push(makeWarning(lineNumber, `[channel ${channel.location}] unsupported tone mode`));
            }
        }
        if (skipIndex !== undefined) {
            const skipString = row[skipIndex] ?? "";
            if (skipString === "") {
            }
            else if (skipString === "S") {
                channel.lockout = true;
            }
            else if (skipString === "P") {
                channel.priority = true;
            }
            else {
                header.push(makeWarning(lineNumber, `[channel ${channel.location}] unsupported skip setting`));
            }
        }
        commands.push(channel.getCommand());
    }
    return commands;
}
function importFile() {
    const deleteEmptyChannelsCheckbox = document.getElementById("delete_empty_channels");
    const importAllSettingsCheckbox = document.getElementById("import_all_settings");
    let deleteEmptyChannels = false;
    if (deleteEmptyChannelsCheckbox instanceof HTMLInputElement) {
        deleteEmptyChannels = deleteEmptyChannelsCheckbox.checked;
    }
    let importAllSettings = false;
    if (importAllSettingsCheckbox instanceof HTMLInputElement) {
        importAllSettings = importAllSettingsCheckbox.checked;
    }
    const input = document.createElement("input");
    input.accept = ".bc125at_ss,.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values";
    input.type = "file";
    input.onchange = async (_) => {
        if (!input.files) {
            return;
        }
        inputEditor.value = "";
        const header = [];
        if (!deleteEmptyChannels) {
            header.push(makeWarning(0, "ignored empty channels"));
        }
        if (!importAllSettings) {
            header.push(makeWarning(0, "dropping non-channel settings"));
        }
        const commands = ["# Enter programming mode", "PRG"];
        for (const file of input.files) {
            header.push("# Imported " + file.name);
            header.push("# Last modified " + new Date(file.lastModified).toString());
            const fullText = await file.text();
            if (fullText.match("^(C-Freq|CloseCall|CloseCallBands|Conventional|Custom|GeneralSearch|Misc|Priority|Service|WxPri)\t")) {
                commands.push.apply(commands, importBC125ATSS(fullText, deleteEmptyChannels, importAllSettings, header));
            }
            else if (fullText.match(/^[0-9.]+\r?\n/)) {
            }
            else if (!fullText.match(/\t/)) {
                commands.push.apply(commands, importChirp(fullText, deleteEmptyChannels, header));
            }
            else {
                header.push(makeError(1, "unknown file format"));
            }
        }
        commands.push("# Exit programming mode\nEPG");
        inputEditor.value = header.concat(commands).join("\n") + "\n";
    };
    input.click();
}
window.importFile = importFile;
function resetCommands() {
    const inputElement = document.getElementById("input");
    if (inputElement) {
        const originalCommands = inputElement.getAttribute("data-original");
        inputEditor.value = originalCommands ?? "";
    }
}
window.resetCommands = resetCommands;
function init() {
    const mayBeSupported = "usb" in navigator;
    const supportedSpan = document.getElementById("supported");
    if (supportedSpan) {
        supportedSpan.innerText =
            mayBeSupported ? "appears to be" : "is not";
    }
    const sendButton = document.getElementById("send");
    if (sendButton instanceof HTMLInputElement) {
        sendButton.disabled = !mayBeSupported;
    }
    const inputElement = document.getElementById("input");
    if (inputElement) {
        inputEditor = inputElement;
        inputElement.focus();
    }
    resetCommands();
}
document.addEventListener("DOMContentLoaded", init, false);
