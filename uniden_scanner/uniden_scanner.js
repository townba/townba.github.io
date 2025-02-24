"use strict";
const ProductIDs = {
    unknown: -1,
    BC125AT: 0x0017,
    BCD325P2: 0x001A,
};
class UnidenScanner {
    static encoder = new TextEncoder();
    static decoder = new TextDecoder("ascii");
    device = undefined;
    inEndpoint = undefined;
    outEndpoint = undefined;
    readBuffer = "";
    productID = ProductIDs.unknown;
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
            throw new Error("already connected");
        }
        const device = await navigator.usb.requestDevice({
            filters: [{ vendorId: UnidenScanner.VENDOR_ID }]
        });
        if (!device) {
            throw new Error("nothing connected");
        }
        this.productID = device.productId;
        if (!Object.values(ProductIDs).includes(this.productID)) {
            throw new Error("unknown Uniden product ID: 0x" +
                this.productID.toString(16).toUpperCase());
        }
        this.device = device;
        await device.open();
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
                        if (inEndpoint && outEndpoint) {
                            this.inEndpoint = inEndpoint;
                            this.outEndpoint = outEndpoint;
                            await device.selectConfiguration(config.configurationValue);
                            return device.claimInterface(interf.interfaceNumber);
                        }
                    }
                }
            }
        }
        const msg = "endpoints not found";
        this.log(msg);
        throw new Error(msg);
    }
    async close() {
        if (!this.device) {
            return;
        }
        try {
            return await this.device.close();
        }
        finally {
            this.device = undefined;
            this.inEndpoint = undefined;
            this.outEndpoint = undefined;
        }
    }
    async sendCommand(cmd, timeout) {
        const prefix = cmd.split(",")[0] ?? "";
        if (prefix.charAt(0) == "$") {
            cmd.replace(/\*[0-9A-F]{2}$/, "");
        }
        await this.write(cmd);
        if (prefix.charAt(0) != "$") {
            return await this.read(prefix, timeout);
        }
    }
    log(s) {
        console.log(s);
        this.eventCallback("log", s);
    }
    async write(cmd) {
        if (!this.device || this.outEndpoint === undefined) {
            throw new Error("not connected");
        }
        await this.device.transferOut(this.outEndpoint, UnidenScanner.encoder.encode(cmd + "\r"));
        this.eventCallback("sent", cmd);
    }
    async read(cmd, timeout = 200) {
        const ms = Date.now();
        if (!this.device || this.inEndpoint === undefined) {
            throw new Error("not connected");
        }
        const result = await Promise.race([
            this.device.transferIn(this.inEndpoint, 4096),
            new Promise((_resolve, reject) => {
                setTimeout(() => reject(new Error("timed out: " + cmd)), timeout);
            })
        ]);
        if (result instanceof USBInTransferResult && result.data) {
            this.readBuffer += UnidenScanner.decoder.decode(result.data);
        }
        this.eventCallback("received", this.readBuffer);
        let cr;
        while ((cr = this.readBuffer.indexOf("\r")) >= 0) {
            const line = this.readBuffer.slice(0, cr);
            this.readBuffer = this.readBuffer.slice(cr + 1);
            if (line.split(",")[0] === cmd) {
                return;
            }
        }
        const newTimeout = timeout - (Date.now() - ms);
        if (newTimeout > 0) {
            await this.read(cmd, timeout);
        }
        else {
            throw new Error("timed out");
        }
    }
}
async function _exampleUsage() {
    let programming = false;
    const scanner = new UnidenScanner();
    try {
        await scanner.connect();
        await scanner.sendCommand("PRG");
        programming = true;
        for (const cmd of ["MDL", "VER"]) {
            await scanner.sendCommand(cmd);
        }
    }
    finally {
        if (programming) {
            await scanner.sendCommand("EPG");
        }
        await scanner.close();
    }
}
