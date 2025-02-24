"use strict";
let scanner;
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
    if (!scanner) {
        const outputTextArea = document.getElementById("output");
        if (!(outputTextArea instanceof HTMLTextAreaElement)) {
            throw new Error("outputTextArea is not an HTMLTextAreaElement");
        }
        const tmpScanner = new UnidenScanner(getScannerEventCallback(outputTextArea));
        await tmpScanner.connect();
        scanner = tmpScanner;
    }
    const commands = inputEditor.value.split("\n")
        .filter((line) => !line.match(/^\s*(#.*)?$/));
    for (const command of commands) {
        await scanner.sendCommand(command, command === "CLR" ? 30000 : undefined);
    }
}
function sendCommandsSync() {
    try {
        sendCommands();
    }
    catch (e) {
        alert("Aborting sending commands: " +
            (e instanceof Error) ? e.message : "unknown");
    }
}
window.sendCommandsSync = sendCommandsSync;
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
    if (inputElement instanceof HTMLTextAreaElement) {
        inputEditor = inputElement;
        inputElement.focus();
    }
    resetCommands();
}
document.addEventListener("DOMContentLoaded", init, false);
