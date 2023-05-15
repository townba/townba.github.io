"use strict";
// Copyright 2023 Brad Town
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
class UnidenBC125AT {
    static encoder = new TextEncoder();
    static decoder = new TextDecoder();
    device = undefined;
    inEndpoint = undefined;
    outEndpoint = undefined;
    readBuffer = "";
    static BC125AT_PRODUCT_ID = 0x0017;
    static BC125AT_VENDOR_ID = 0x1965;
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
        const device = await navigator.usb.requestDevice({
            filters: [{
                    vendorId: UnidenBC125AT.BC125AT_VENDOR_ID,
                    productId: UnidenBC125AT.BC125AT_PRODUCT_ID
                }]
        });
        this.device = device;
        await device.open();
        // Check each configuration, interface, and alternate.
        for (const config of device.configurations) {
            for (const intf of config.interfaces) {
                for (const alternate of intf.alternates) {
                    if (alternate.interfaceClass !== UnidenBC125AT.USB_CDC_DATA) {
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
                            return device.selectConfiguration(config.configurationValue)
                                .then(() => device.claimInterface(intf.interfaceNumber));
                        }
                    }
                }
            }
        }
        throw new Error("endpoints not found");
    }
    async close() {
        if (!this.device) {
            return Promise.resolve();
        }
        try {
            await this.device.close();
            return await this.device.forget();
        }
        finally {
            this.device = undefined;
            this.inEndpoint = undefined;
            this.outEndpoint = undefined;
        }
    }
    async sendCommand(cmd, timeout) {
        const prefix = cmd.split(",")[0] ?? "";
        await this.write(cmd);
        this.eventCallback("sent", cmd);
        return await this.read(prefix, timeout);
    }
    async write(cmd) {
        if (!this.device || this.outEndpoint === undefined) {
            return Promise.reject(new Error("not connected"));
        }
        await this.device.transferOut(this.outEndpoint, UnidenBC125AT.encoder.encode(cmd + "\r"));
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
        const result_2 = await Promise.race([
            this.device.transferIn(this.inEndpoint, 4096),
            timeoutPromise
        ]);
        if (result_2 instanceof USBInTransferResult) {
            this.readBuffer += UnidenBC125AT.decoder.decode(result_2.data);
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
async function exampleUsage() {
    const startProgrammingCommand = "PRG";
    const endProgrammingCommand = "EPG";
    const identifierCommands = ["MDL", "VER"];
    const scanner = new UnidenBC125AT();
    try {
        try {
            try {
                await scanner.connect();
            }
            catch (e) {
                return Promise.reject(new Error("no scanner connected: " +
                    (e instanceof Error) ? e.message : "unknown"));
            }
            await scanner.sendCommand(startProgrammingCommand);
            for (const cmd of identifierCommands) {
                await scanner.sendCommand(cmd);
            }
            return await scanner.sendCommand(endProgrammingCommand);
        }
        catch (e) {
            return Promise.reject(new Error("skipping remaining commands: " +
                (e instanceof Error) ? e.message : "unknown"));
        }
    }
    finally {
        return await scanner.close();
    }
}
