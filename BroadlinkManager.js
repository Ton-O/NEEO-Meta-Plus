const express = require('express');
const logModule="BroadlinkManager";


process.env.StartupPath="/opt/meta"    // small trick (for now) to incorporate this module into logLevel environment from meta.js
const { metaMessage, LOG_TYPE,OverrideLoglevel,initialiseLogSeverity } = require("./metaMessage");

// TIP: If you experience problems with modules below this GoogleTV.js level, comment the following line (by oplacing // in front of it)
console.error = console.info = console.debug = console.warn = console.trace = console.dir = console.dirxml = console.group = console.groupEnd = console.time = console.timeEnd = console.assert = console.profile = function() {};
// TIP: The line above... with console.error etc change it to //console.error.... etc
function metaLog(message) {
  let initMessage = { component:logModule, type:LOG_TYPE.INFO, content:'', deviceId: '' };
  let myMessage = {...initMessage, ...message}
  return metaMessage (myMessage); 
} 

initialiseLogSeverity(logModule); 
//OverrideLoglevel("DEBUG",logModule)

const broadlink = require('node-broadlink');
const binascii = {
    hexlify: (buf) => buf.toString('hex'),
    b2a_hex: (buf) => buf.toString('hex'),
    unhexlify: (str) => Buffer.from(str, 'hex')
};
const struct = {
    pack: (format, value) => {
        let b;
        if (format === '>B') { b = Buffer.alloc(1); b.writeUInt8(value); }
        else if (format === '>H') { b = Buffer.alloc(2); b.writeUInt16BE(value); }
        else if (format === '<H') { b = Buffer.alloc(2); b.writeUInt16LE(value); }
        return b;
    }
};

const app = express();


const TIMEOUT = 30;
const TICK = 32.84;
var devs;
var dev;
function shutdown_server() {
    // Node.js equivalent voor Werkzeug shutdown
    process.exit();
}

function format_durations(data) {
    let result = '';
    for (let i = 0; i < data.length; i++) {
        if (result.length > 0) result += ' ';
        result += (i % 2 === 0 ? '+' : '-') + data[i].toString();
    }
    return result;
}

function to_microseconds(bytes) {
    let result = [];
    let index = 4;
    while (index < bytes.length) {
        let chunk = bytes[index];
        index += 1;
        if (chunk === 0) {
            chunk = bytes[index];
            chunk = 256 * chunk + bytes[index + 1];
            index += 2;
        }
        result.push(Math.round(chunk * TICK));
        if (chunk === 0x0d05) break;
    }
    return result;
}

function lirc2gc(cmd) {
    let result = ""; 
    let NextByte = false; 
    cmd = cmd.replace(/,/g, ' ');     
    for (let code of cmd.split(" ")) {
        if (code === "") continue;
        if (NextByte) result += ",";
        else NextByte = true;
        result += Math.round(Math.abs(parseInt(code, 16) * 0.038400)).toString();
    }
    return "sendir,1:1,1,38400,3,1," + result;
}

function gc2lirc(gccmd) {
    let frequency = parseInt(gccmd.split(",")[3]) * 1.0 / 1000000;
    let pulses = gccmd.split(",").slice(6);
    return pulses.map(code => Math.round(parseInt(code) / frequency));
}

function lirc2broadlink(pulses) {
    let array = Buffer.alloc(0);
    for (let pulse of pulses) {
        pulse = Math.floor(pulse * 269 / 8192);
        if (pulse < 256) {
            array = Buffer.concat([array, struct.pack('>B', pulse)]);
        } else {
            array = Buffer.concat([array, Buffer.from([0x00]), struct.pack('>H', pulse)]);
        }
    }
    let packet = Buffer.concat([Buffer.from([0x26, 0x00]), struct.pack('<H', array.length)]);
    packet = Buffer.concat([packet, array, Buffer.from([0x0d, 0x05])]);
    let remainder = (packet.length + 4) % 16;
    if (remainder) packet = Buffer.concat([packet, Buffer.alloc(16 - remainder, 0)]);
    return packet;
}

function Convert_GC_to_Broadlink(stream) { 
    let pulses = gc2lirc(stream);
    let packet = lirc2broadlink(pulses);
    let result = binascii.b2a_hex(packet);
    return result; 
}

function Convert_Broadlink_to_GC(stream) { 
    let data = Buffer.from(stream, 'hex');
    let durations = to_microseconds(data);
    metaLog({type:LOG_TYPE.DEBUG, content:"Broadlink: durations" + durations})
    let result = lirc2gc(durations.map(d => d.toString(16)).join(' '));
    return result;
}
async function CheckDevs(host)
{
    for(let ind=0;ind<devs.length;ind++)
    if (devs[ind].mac == host)
    {   dev=devs[ind];
        metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink device in cache:"+dev.mac})
        if (dev.autenticated!=true)
        {   metaLog({type:LOG_TYPE.DEBUG, content:"AUTH required"})
            await    dev.auth()
            metaLog({type:LOG_TYPE.DEBUG, content:"AUTH succeeded"})
            devs[ind].authenticated=true;
        }
        return dev;
        }
    console.log("Broadlink host not found:",host,devs)
    return 0
}

let discoveryPromise = null; 

async function Discover_Broadlinks(timeout = 2500) {
    // Als er al een scan loopt, gebruik die belofte
    if (discoveryPromise) {
        return discoveryPromise;
    }

    // Start een nieuwe scan-belofte
    discoveryPromise = new Promise((resolve) => {
        metaLog({type: LOG_TYPE.DEBUG, content: "Broadlink scan started forcibly..."});
        
        // Zorg dat devs in ieder geval een array is bij de start
        if (!Array.isArray(devs)) {
            devs = [];
        }

        broadlink.discover(Number(timeout))
            .then((result) => {
                if (result && result.length > 0) {
                    // Loop door alle nieuw gevonden apparaten heen
                    result.forEach((newDev) => {console.log(newDev);
newDev.mac = newDev.mac
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
                        // Bepaal de unieke sleutel (MAC-adres heeft voorkeur, oars IP)
                        const newKey = newDev.mac ? newDev.mac.toString() : newDev.host.address;
                        
                        // Zoek of dit apparaat al in onze huidige cache staat
                        const existingIndex = devs.findIndex((oldDev) => {
                            const oldKey = oldDev.mac ? oldDev.mac.toString() : oldDev.host.address;
                            return oldKey === newKey;
                        });

                        if (existingIndex !== -1) {
                            // BEHOUD AUTHENTICATIE: Als het oude apparaat al geauthenticeerd was, 
                            // neem die status dan over naar het nieuwe object
                            if (devs[existingIndex].authenticated === true) {
                                newDev.authenticated = true;
                            }
                            
                            // Vervang het oude apparaat door de verse netwerkinstantie
                            devs[existingIndex] = newDev;
                            metaLog({type: LOG_TYPE.DEBUG, content: `Broadlink cache updated for device: ${newDev.mac}`});
                        } else {
                            // Het is een gloednieuw apparaat, voeg hem toe aan de lijst
                            devs.push(newDev);
                            metaLog({type: LOG_TYPE.DEBUG, content: `Broadlink new device added to cache: ${newDev.mac}`});
                        }
                    });
                    
                    metaLog({type: LOG_TYPE.DEBUG, content: `Broadlink background scan done. Total cache now contains ${devs.length} devices.`});
                }
                else {
                    metaLog({type: LOG_TYPE.VERBOSE, content: `Broadlink scan did not provide new devices, keeping current cache (${devs.length} devices)`});
                }
            })
            .catch((err) => {
                metaLog({type: LOG_TYPE.ERROR, content: "Error during background scan: " + err});
            });

        setTimeout(() => { 
            for(let ind = 0; ind < devs.length; ind++) {
                metaLog({type: LOG_TYPE.DEBUG, content: "Broadlink device in cache: " + devs[ind].name + " MAC: " + devs[ind].mac + " IP: " + devs[ind].host.address + " (Auth: " + (devs[ind].authenticated || false) + ")"});
            }
            
            // Reset the promise blocker to allow future scans
            discoveryPromise = null; 
            resolve(devs);
        }, timeout);
    });

    return discoveryPromise;
}


async function Connect_Broadlink(req) {
    let host = req.query.host;
    if (devs == undefined) {
        metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink device-list empty; discovering now"});
        await Discover_Broadlinks(7500); 
    } else {
        let Found=false;
        for (let ind = 0; ind < devs.length; ind++) 
            if (devs[ind].mac == host) 
                {metaLog({type: LOG_TYPE.DEBUG, content: "Reuse Broadlink device: " + devs[ind].mac});
                Found=true;
                break;
                }
        if (!Found)       
            await Discover_Broadlinks(7500); // Try to find the device again
    }
    
    metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink device not in cache/list; checking now " + host});    
    return await CheckDevs(host);
}

async function CheckDevs(host) {
    for(let ind=0; ind < devs.length; ind++) {
        if (devs[ind].mac == host) {
            let localDev = devs[ind]; 
            if (localDev.authenticated != true) {   
                await localDev.auth();
                metaLog({type:LOG_TYPE.DEBUG, content:"AUTH succeeded"});
                devs[ind].authenticated = true;
            }
            return localDev;
        }
    }
    return null;
}


// --- Routes ---

app.get('/', (req, res) => res.send('Server Works!'));

app.get('/QUIT', (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Received shutdown request"})
    res.send('Server shutting down...');
    shutdown_server();
});

app.get('/init', async (req, res) => {
    // [["--type 0x520d --host 192.168.73.47 --mac e870729eab7a","--type 0x6539 --host 192.168.73.36 --mac a043b0542a78","--type 0x653c --host 192.168.73.34 --mac a043b031f30d"]]
    //  [{"host":{"address":"192.168.73.47","family":"IPv4","port":80,"size":128},"mac":[232,112,114,158,171,122],"deviceType":21005,"model":"RM4C mini","manufacturer":"Broadlink","name":"NEEO-Beta","isLocked":false,"id":[0,0,0,0],"key":[9,118,40,52,63,233,158,35,118,92,21,19,172,207,139,2],"count":60487,"iv":{"type":"Buffer","data":[86,46,23,153,109,9,61,40,221,179,186,105,90,46,111,88]},"TYPE":"RM4MINI","socket":{"_events":{},"_eventsCount":0,"type":"udp4"}},{"host":{"address":"192.168.73.36","family":"IPv4","port":80,"size":128},"mac":[160,67,176,84,42,120],"deviceType":25913,"model":"RM4C mini","manufacturer":"Broadlink","name":"智能遥控","isLocked":false,"id":[0,0,0,0],"key":[9,118,40,52,63,233,158,35,118,92,21,19,172,207,139,2],"count":12266,"iv":{"type":"Buffer","data":[86,46,23,153,109,9,61,40,221,179,186,105,90,46,111,88]},"TYPE":"RM4MINI","socket":{"_events":{},"_eventsCount":0,"type":"udp4"}},{"host":{"address":"192.168.73.34","family":"IPv4","port":80,"size":128},"mac":[160,67,176,49,243,13],"deviceType":25916,"model":"RM4 pro","manufacturer":"Broadlink","name":"Wi-Fi pro","isLocked":false,"id":[0,0,0,0],"key":[9,118,40,52,63,233,158,35,118,92,21,19,172,207,139,2],"count":58771,"iv":{"type":"Buffer","data":[86,46,23,153,109,9,61,40,221,179,186,105,90,46,111,88]},"TYPE":"RM4MINI","socket":{"_events":{},"_eventsCount":0,"type":"udp4"}}] 
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: connecting-request"})
    await Connect_Broadlink(req);  
    metaLog({type:LOG_TYPE.DEBUG, content:"Broadlink_Driver discover",params:devs})
    res.send(devs);
});

app.get('/discover', async (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: discover all devices"})
    await Discover_Broadlinks(15000)
    res.json(devs);
});

app.get("/OverrideLogLevel", async (req, res, next) => {
        let logLevel = req.query.logLevel
        metaLog({type:LOG_TYPE.INFO, content:"Setting loglevel for BroadLinkManager through get to"+logLevel})
        OverrideLoglevel(logLevel,logModule);
        res.json({"Type": "OverrideLogLevel", "Status": "Processed"});        
    });


app.get('/xmit', async (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: xmit-request"})
    await Connect_Broadlink(req);  
    let data = req.query.stream;
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Sending data" + data})
    await dev.sendData(Buffer.from(data, 'hex'));
    res.send('OK');
});

let sendingQueue = Promise.resolve(); // Startpunt van de wachtrij

app.get('/xmitGC', async (req, res) => {
    let result = "ok";
    let host = req.query.host;
    metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink_Driver: Send GC requested for " + host});

    // Add element to queue
    sendingQueue = sendingQueue.then(async () => {
        try {
            let activeDev = await Connect_Broadlink(req);  
            
            if (!activeDev) {
                throw new Error("Device nnot found on netwerk");
            }

            let data = req.query.stream;
            metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink_Driver: GC data " + data});
            
            let ConvData = Convert_GC_to_Broadlink(data);  
            metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink_Driver: Conversion done, sending this data " + ConvData});
            
            await activeDev.sendData(Buffer.from(ConvData, 'hex'));
            
            // small delay added for stability 
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch(err) {
            metaLog({type: LOG_TYPE.ERROR, content: "err in xmitGC: " + err});
            result = err.message || err;
        }
    });

    // Wait for request to be completed, then send response
    await sendingQueue;
    res.send(result);
});
app.get('/GCToBroad', (req, res) => {
    let Stream = req.query.stream;
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Conversion GC to Broadlink requested"})
    let ConvData = Convert_GC_to_Broadlink(Stream);    
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Conversion done, returning this data " + ConvData})
    res.send(ConvData);
});

app.get('/BroadtoGC', (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Conversion Broadlink to GC requested"})
    let data = req.query.stream;
    let ConvData = Convert_GC_to_Broadlink(data); 
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: GC data " + ConvData})
    res.send(ConvData);
});

app.get('/LirctoGC', (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Conversion LIRC to GC requested"})
    let data = req.query.stream.replace(/'/g, '');
    let ConvData = lirc2gc(data);
    res.send(ConvData);
});

app.get('/rcve', async (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Learning requested"})
    await Connect_Broadlink(req);
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Learning for " + TIMEOUT + "ms"})
    await dev.enterLearning();
    let start = Date.now() / 1000;
    let data = null;
    while ((Date.now() / 1000) - start < TIMEOUT) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            data = await dev.checkData();
            if (data) break;
        } catch (e) { continue; }
    }
    res.send(data ? data.toString('hex') : 'timeout');
});


app.listen(5384, '0.0.0.0', () => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Server started on port 5384"})
});

async function main() {
    metaLog({type: LOG_TYPE.VERBOSE, content: "Initial discovery started..."});
    
    // Initially gather all Broadlink devices from the network; then periodically (every 10 minutes) run discovery to add/replace entries 
    await Discover_Broadlinks(15000); 
    metaLog({type: LOG_TYPE.VERBOSE, content: "Initial discovery completed. Starting 10-minute interval."});

    const TEN_MINUTES = 10 * 60 * 1000;
    
    setInterval(async () => {
        metaLog({type: LOG_TYPE.VERBOSE, content: "Starting periodic 10-minute Broadlink network scan..."});
        try {
            await Discover_Broadlinks(15000); 
            metaLog({type: LOG_TYPE.VERBOSE, content: "Periodic Broadlink scan completed."});
        } catch (err) {
            metaLog({type: LOG_TYPE.ERROR, content: "Error during periodic Broadlink scan: " + err});
        }
    }, TEN_MINUTES);
}

main();

    