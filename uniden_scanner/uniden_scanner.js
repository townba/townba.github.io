"use strict";
// Copyright 2023, 2024 Bradley A. Town
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
class UnidenScanner {
    static encoder = new TextEncoder();
    static decoder = new TextDecoder("ascii");
    device = undefined;
    inEndpoint = undefined;
    outEndpoint = undefined;
    readBuffer = "";
    static BC125AT_PRODUCT_ID = 0x0017;
    static BCD325P2_PRODUCT_ID = 0x001A;
    static VENDOR_ID = 0x1965;
    static USB_CDC_DATA = 0x0A;
    eventCallback = (_eventType, _data) => { };
    constructor(eventCallback) {
        if (eventCallback) {
            this.eventCallback = eventCallback;
        }
    }
    async connect() {
        if (this.device) {
            return Promise.reject(new Error("already connected"));
        }
        // const devices = await navigator.usb.getDevices();
        let device;
        // TODO: Allow unpairing and repairing.
        // TODO: I saw one case where it thought it was paired but it couldn't
        // communicate. In cases like that, we should reestablish the connection.
        // if (devices.length == 1 && devices[0]) {
        //   device = devices[0];
        // } else {
        device = await navigator.usb.requestDevice({
            // TODO: Consider not including the product IDs in the filters so we can
            // get other devices, too.
            filters: [
                {
                    vendorId: UnidenScanner.VENDOR_ID,
                    productId: UnidenScanner.BC125AT_PRODUCT_ID
                },
                {
                    vendorId: UnidenScanner.VENDOR_ID,
                    productId: UnidenScanner.BCD325P2_PRODUCT_ID
                }
            ]
        });
        // }
        if (!device) {
            return Promise.reject(new Error("nothing connected"));
        }
        console.log(device);
        this.device = device;
        await device.open();
        this.log("device is open");
        // Check each configuration, interface, and alternate.
        for (const config of device.configurations) {
            for (const interf of config.interfaces) {
                for (const alternate of interf.alternates) {
                    if (alternate.interfaceClass !== UnidenScanner.USB_CDC_DATA) {
                        continue;
                    }
                    let inEndpoint;
                    let outEndpoint;
                    for (const endpoint of alternate.endpoints) {
                        if (endpoint.type !== "bulk") {
                            continue;
                        }
                        if (endpoint.direction === "in") {
                            inEndpoint = endpoint.endpointNumber;
                        }
                        else if (endpoint.direction === "out") {
                            outEndpoint = endpoint.endpointNumber;
                        }
                        // We found both endpoints, so we're done.
                        if (inEndpoint && outEndpoint) {
                            this.inEndpoint = inEndpoint;
                            this.outEndpoint = outEndpoint;
                            this.log("endpoints found; calling selectConfiguration");
                            return device.selectConfiguration(config.configurationValue)
                                .catch(err => {
                                const msg = "selectConfiguration: " + err;
                                this.log(msg);
                                throw new Error(msg);
                            })
                                .then(() => device.claimInterface(interf.interfaceNumber))
                                .catch(err => {
                                const msg = "claimInterface: " + err;
                                this.log(msg);
                                throw new Error(msg);
                            });
                        }
                    }
                }
            }
        }
        this.log("endpoints not found");
        throw new Error("endpoints not found");
    }
    async close() {
        if (!this.device) {
            return Promise.resolve();
        }
        try {
            return await this.device.close();
            // TODO(townba): For some reason, when I call `forget`, I can't figure out
            // how to reconnect to the device without refreshing the page.
            // return await this.device.forget();
        }
        finally {
            this.device = undefined;
            this.inEndpoint = undefined;
            this.outEndpoint = undefined;
        }
    }
    async sendCommand(cmd, timeout) {
        const prefix = cmd.split(",")[0] ?? "";
        // If it's an NMEA 0183 sentence, drop any checksum that may have been
        // added. The BCD325P2 doesn't use it.
        if (prefix.charAt(0) == "$") {
            cmd.replace(/\*[0-9A-F]{2}$/, "");
        }
        this.log("attempting to write: " + cmd);
        await this.write(cmd);
        this.eventCallback("sent", cmd);
        if (prefix.charAt(0) != "$") {
            // NMEA sentences don't get responses.
            return await this.read(prefix, timeout);
        }
    }
    log(s) {
        console.log(s);
        this.eventCallback("log", s);
    }
    latlongAsGPSString(latlongAsDecimal, isLongitude) {
        if (latlongAsDecimal == null) {
            return ",";
        }
        // The BCD325P2 only uses the first four decimal points of precision, so
        // 0.99999 is treated like 0.9999.
        const places = 4;
        const n = Math.round(Math.abs(latlongAsDecimal) * 60 * 10 ** places);
        return Math.floor(n / (60 * 10 ** places)).toString().padStart(isLongitude ? 3 : 2, "0") +
            ((n / 10 ** places) % 60).toFixed(places).padStart(places + (places > 0 ? 1 : 0) + 2, "0") + "," +
            (latlongAsDecimal < 0 ? (isLongitude ? "W" : "S") : (isLongitude ? "E" : "N"));
    }
    clampNumber(n, min, max) {
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
    wrapDegrees(n) {
        return ((n % 360) + 360) % 360;
    }
    static calculateNMEA0183Checksum(sentence) {
        return "*" + sentence.split("").map((e) => {
            return e.charCodeAt(0);
        }).reduce((a, v) => {
            return a ^ v;
        }).toString(16).toUpperCase();
    }
    async sendGPSInformation(coords) {
        // Time format: HHMMSS
        const now = new Date();
        const timeGPSString = now.getUTCHours().toString().padStart(2, "0") +
            now.getUTCMinutes().toString().padStart(2, "0") +
            now.getUTCSeconds().toString().padStart(2, "0");
        // Handle out-of-range numbers like Google Maps does.
        // https://developers.google.com/maps/documentation/javascript/reference/coordinates#LatLng
        const latitudeGPSString = this.latlongAsGPSString(this.clampNumber(coords.latitude, -90, 90), false);
        const longitudeGPSString = this.latlongAsGPSString(this.wrapDegrees(coords.longitude + 180) - 180, true);
        // The BCD325P2 reports altitudes between -999 feet and 9999 feet
        // inclusive, but it will accept numbers well beyond that and clamp them
        // to those limits itself.
        const altitudeGPSString = (coords.altitude == null) ? "" :
            this.clampNumber(Math.round(coords.altitude), Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).toString();
        // Convert from meters per second to knots. The BCD325P2 ignores any
        // fractional part, so 0.999 is treated like 0. Negative speeds don't
        // work because it appears to read it as an eight-bit integer and then
        // drops the high bit, so - 1 -> 0xFF -> 0x7F. Limit speed based on
        // special relativity for future firmware updates.
        const speedGPSString = (coords.speed == null) ? "" :
            (this.clampNumber(coords.speed, 0, 299792458) * 1.94384449244).toFixed(0);
        const headingGPSString = (coords.heading == null) ? "" :
            this.wrapDegrees(Math.round(coords.heading)).toString().padStart(3, "0");
        // The BCD325P2 does not use the checksum, but we provide it anyway.
        // Note: The BCD325P2 only updates its heading when the speed is nonzero or
        // was nonzero before the current update.
        const sentenceGPRMC = `GPRMC,${timeGPSString},A,${latitudeGPSString},` +
            `${longitudeGPSString},${speedGPSString},${headingGPSString}`;
        let cmd = "$" + sentenceGPRMC + UnidenScanner.calculateNMEA0183Checksum(sentenceGPRMC);
        this.log("trying to write: " + cmd);
        await this.write(cmd);
        this.eventCallback("sent", cmd);
        // Send `GGA` even when we don't have an altitude; otherwise, the
        // BCD325P2 may show its previous altitude.
        // The BCD325P2 only uses the latitude and longitude from an `RMC`
        // sentence. It ignores their values in the `GGA` sentence.
        const sentenceGPGGA = `GPGGA,,,,,,,,,${altitudeGPSString},M`;
        cmd = "$" + sentenceGPGGA + UnidenScanner.calculateNMEA0183Checksum(sentenceGPGGA);
        this.log("trying to write: " + cmd);
        await this.write(cmd);
        this.eventCallback("sent", cmd);
        return Promise.resolve();
    }
    async write(cmd) {
        if (!this.device || this.outEndpoint === undefined) {
            return Promise.reject(new Error("not connected"));
        }
        await this.device.transferOut(this.outEndpoint, UnidenScanner.encoder.encode(cmd + "\r"));
        return Promise.resolve();
    }
    async read(cmd, timeout = 200) {
        const ms = Date.now();
        if (!this.device || this.inEndpoint === undefined) {
            return Promise.reject(new Error("not connected"));
        }
        const timeoutPromise = new Promise((_resolve, reject) => {
            setTimeout(() => { reject(new Error("timed out: " + cmd)); }, timeout);
        });
        // NOTE(townba): If we time out, we can't abort the transferIn, so it's
        // orphaned. (It may get fulfilled later.)
        const result = await Promise.race([
            this.device.transferIn(this.inEndpoint, 4096),
            timeoutPromise
        ]);
        if (result instanceof USBInTransferResult && result.data) {
            this.readBuffer += UnidenScanner.decoder.decode(result.data);
        }
        let cr;
        // If we've read an entire line, check it.
        while ((cr = this.readBuffer.indexOf("\r")) >= 0) {
            const line = this.readBuffer.slice(0, cr);
            this.readBuffer = this.readBuffer.slice(cr + 1);
            if (line.split(",")[0] === cmd) {
                this.eventCallback("response", line);
                return;
            }
        }
        const newTimeout = timeout - (Date.now() - ms);
        if (newTimeout > 0) {
            // Keep reading.
            return this.read(cmd, timeout);
        }
        else {
            // Ran out of time.
            return Promise.reject(new Error("timed out"));
        }
    }
}
// async function exampleUsage(): Promise<void> {
//   const startProgrammingCommand = "PRG";
//   const endProgrammingCommand = "EPG";
//   const identifierCommands = ["MDL", "VER"];
//   
//   const scanner = new UnidenScanner();
//   try {
//     try {
//       try {
//         await scanner.connect();
//       } catch (e) {
//         return Promise.reject(
//           new Error("no scanner connected: " +
//                     (e instanceof Error) ? (e as Error).message : "unknown"));
//       }
//       await scanner.sendCommand(startProgrammingCommand);
//       for (const cmd of identifierCommands) {
//         await scanner.sendCommand(cmd);
//       }
//       return await scanner.sendCommand(endProgrammingCommand);
//     } catch (e) {
//       return Promise.reject(
//         new Error("skipping remaining commands: " +
//                   (e instanceof Error) ? (e as Error).message : "unknown"));
//   }
//   } finally {
//     return await scanner.close();
//   }
// }
