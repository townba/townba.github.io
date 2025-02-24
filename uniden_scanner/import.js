"use strict";
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
    input.onchange = async () => {
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
                commands.push(...importBC125ATSS(fullText, deleteEmptyChannels, importAllSettings, header));
            }
            else if (fullText.match(/^[0-9.]+\r?\n/)) {
            }
            else if (!fullText.match(/\t/)) {
                commands.push(...importChirp(fullText, deleteEmptyChannels, header));
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
    const pat = /^(?:(?<nonescaped>[^\u0000-\u001F",]+)|(?:"(?<escaped>(?:[^"]|"")*)")|)(?<next>[,\n]|\r\n|$)/;
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
