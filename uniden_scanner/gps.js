"use strict";
let timerGPS;
let watchPositionID;
let currentCoords;
const sendGPSInfoIntervalMilliseconds = 2000;
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
function toggleWatchGPSPositionSync() {
    try {
        toggleWatchGPSPosition();
    }
    catch (e) {
        alert("Aborting toggling watching GPS position: " +
            (e instanceof Error) ? e.message : "unknown");
    }
}
window.toggleWatchGPSPositionSync = toggleWatchGPSPositionSync;
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
