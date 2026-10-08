const express = require('express');
const logModule="BroadlinkManager";


process.env.StartupPath="/opt/meta"    // small trick (for now) to incorporate this module into logLevel environment from meta.js
const { metaMessage, LOG_TYPE,OverrideLoglevel,initialiseLogSeverity } = require("./metaMessage");

// TIP: If you experience problems with modules below this GoogleTV.js level, comment the following line (by placing // in front of it)
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

const State = Object.freeze({
  init: 'init',
  discover: 'discover',
  xmit: 'xmit',
  xmitGC: 'xmitGC',
  GCToBroad: 'GCToBroad',
  BroadtoGC: 'BroadtoGC',
  LirctoGC: 'LirctoGC',
  rcve: 'rcve'
});

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
async function CheckDevs(mac)
{
    for(let ind=0;ind<devs.length;ind++)
    if (devs[ind].mac == mac)
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
    metaLog({type:LOG_TYPE.ERROR, content:"Broadlink: host not found" + mac})
    return 0
}

let discoveryPromise = null; 

async function Discover_Broadlinks(timeout = 2500) {
    // Als er al een scan loopt, gebruik die belofte
    if (discoveryPromise) {
        return discoveryPromise;
    }

    // Start a new scan-promise
    discoveryPromise = new Promise((resolve) => {
        metaLog({type: LOG_TYPE.DEBUG, content: "Broadlink scan started forcibly..."});
        
        if (!Array.isArray(devs)) {
            devs = [];
        }

        broadlink.discover(Number(timeout))
            .then((result) => {
                if (result && result.length > 0) {
                    // Loop over all found entries
                    result.forEach((newDev) => {
                        newDev.mac = newDev.mac.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
                        const newKey = newDev.mac ? newDev.mac.toString() : newDev.host.address;                        
                        newDev.lastDiscovered = Date.now();
                        const existingIndex = devs.findIndex((oldDev) => {
                            const oldKey = oldDev.mac ? oldDev.mac.toString() : oldDev.host.address;
                            return oldKey === newKey;
                        });

                        if (existingIndex !== -1) {
                            // AuthL: if olddevice is already authenticated, keep that state
                            if (devs[existingIndex].authenticated === true) {
                                newDev.authenticated = true;
                            }
                            
                            // replace old entry by new one (for timeout-check)
                            devs[existingIndex].host = newDev.host;
                            metaLog({type: LOG_TYPE.DEBUG, content: `Broadlink cache updated for device: ${newDev.mac}`});
                        } else {
                            // New device, add to cache
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
                // Laat in de logs zien hoe oud de entry is
                const ageSec = Math.round((Date.now() - devs[ind].lastDiscovered) / 1000);
                metaLog({
                    type: LOG_TYPE.DEBUG, 
                    content: `Broadlink device in cache: MAC: ${devs[ind].mac} | Last seen: ${ageSec}s ago | Auth: ${devs[ind].authenticated || false}`
                });
            }
            discoveryPromise = null; 
            resolve(devs);
        }, timeout);
    });

    return discoveryPromise;
}

async function Connect_Broadlink(req,timeout = 2500) {
//    let host = req.query.host;
    let mac = req.query.mac;
    if (devs == undefined) {
        metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink device-list empty; discovering now"});
        await Discover_Broadlinks(timeout); 
    } else {
        for (let ind = 0; ind < devs.length; ind++) 
            if (devs[ind].mac == mac) 
                {metaLog({type: LOG_TYPE.DEBUG, content: "Reuse Broadlink device: " + devs[ind].mac});
                return await CheckDevs(mac);
                }
        await Discover_Broadlinks(timeout); // Try to find the device again
    }
    
    metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink device not in cache/list; checking now " + mac});    
    return await CheckDevs(mac);
}

async function CheckDevs(mac) {
    for(let ind=0; ind < devs.length; ind++) {
        if (devs[ind].mac == mac) {
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

function Clean_Broadlink_Cache(maxAgeMs = 12 * 60 * 60 * 1000) {
    if (!Array.isArray(devs) || devs.length === 0) return;

    const now = Date.now();
    const initialCount = devs.length;

    // Filter apparaten: behoud alleen degene waarvan de leeftijd binnen de grens valt
    devs = devs.filter((dev) => {
        // Mocht een apparaat (om wat voor reden dan ook) geen timestamp hebben, geef hem het voordeel van de twijfel
        if (!dev.lastDiscovered) return true; 

        const age = now - dev.lastDiscovered;
        const isFresh = age < maxAgeMs;

        if (!isFresh) {
            metaLog({
                type: LOG_TYPE.VERBOSE, 
                content: `Evicting stale Broadlink device from cache: ${dev.name} (IP: ${dev.host.address}), not seen for > 12 hours.`
            });
        }
        return isFresh;
    });

    const removedCount = initialCount - devs.length;
    //if (removedCount > 0) 
        metaLog({type: LOG_TYPE.VERBOSE, content: `Cache cleaning completed. Removed ${removedCount} stale device(s).`});
}

async function xmitIR(TheAction,req,res) {
    let result = "ok";
    let mac = req.query.mac;
    if (mac == undefined)
        mac = req.query.ip
    metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink_Driver: Send GC requested for " + mac});

    // Add element to queue
    sendingQueue = sendingQueue.then(async () => {
        try {
            let activeDev = await Connect_Broadlink(req);  
            
            if (!activeDev) {
                throw new Error("Device not found on netwerk");
            }

            let data = req.query.stream;
            metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink_Driver: GC data " + data});
            let ConvData;
            if (TheAction === State.xmitGC) {
                ConvData = Convert_GC_to_Broadlink(data);  
            }
            else 
                if (TheAction === State.GCToBroad)
                    {ConvData = Convert_GC_to_Broadlink(Stream); 
                    return ConvData
                    }
                else 
                    if (TheAction === State.BroadtoGC)
                        {ConvData = Convert_GC_to_Broadlink(data); 
                        return ConvData
                        }
                    else
                        if (TheAction === State.LirctoGC)
                            {ConvData = lirc2gc(data);
                            return ConvData;
                            }

            metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink_Driver: Conversion done, sending this data " + ConvData});
            
            result = await activeDev.sendData(Buffer.from(ConvData, 'hex'));
            
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

    let currentState = State.init;


    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: connecting-request"})
    await Connect_Broadlink(req);  
    metaLog({type:LOG_TYPE.DEBUG, content:"Broadlink_Driver discover",params:devs})
    res.send(devs);
});

app.get('/discover', async (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: reply all discovered devices requested"})
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
    res.send(await xmitIR(State.xmitGC,req,res) )
    return;
    await Connect_Broadlink(req);  
    let data = req.query.stream;
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Sending data" + data})
    await dev.sendData(Buffer.from(data, 'hex'));
    res.send('OK');
});

let sendingQueue = Promise.resolve(); // Starting point of queue

app.get('/xmitGC', async (req, res) => {
    let result = "ok";
    let mac = req.query.mac;
  /*  if (mac == undefined)
        mac = req.query.ip*/
    metaLog({type: LOG_TYPE.VERBOSE, content: "Broadlink_Driver: Send GC requested for " + mac});
    res.send(await xmitIR(State.xmitGC,req,res) )

//    res.send(result);
});
app.get('/GCToBroad', async (req, res) => {
    let Stream = req.query.stream;
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Conversion GC to Broadlink requested"})
    let ConvData = Convert_GC_to_Broadlink(Stream);    
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Conversion done, returning this data " + ConvData})
    res.send(ConvData);
});

app.get('/BroadtoGC', async (req, res) => {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: Conversion Broadlink to GC requested"})
    let data = req.query.stream;
    let ConvData = Convert_GC_to_Broadlink(data); 
    metaLog({type:LOG_TYPE.VERBOSE, content:"Broadlink_Driver: GC data " + ConvData})
    res.send(ConvData);
});

app.get('/LirctoGC', async (req, res) => {
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
    for (let count = 0; count <5; count++) // if nothing discovered, immediately try 5 times then give up
        {await Discover_Broadlinks(15000); 
        if  (devs.length) 
            break;
        else    
            metaLog({type: LOG_TYPE.VERBOSE, content: "Nothing received so far, retrying"});        
        }

    metaLog({type: LOG_TYPE.VERBOSE, content: "Initial discovery completed. Starting 10-minute interval."});

    // Then scan network a bit relaxter to discover the Broadlink devices that weren't found previously
    const ONE_MINUTE = 1 * 60 * 1000
    for (let count = 0; count <8; count++) 
        {await Discover_Broadlinks(10000); 
        metaLog({type: LOG_TYPE.VERBOSE, content: "Second sweep for Broadlink devices done"});
        await new Promise(resolve => setTimeout(resolve, ONE_MINUTE));
        }

    const TEN_MINUTES = 10 * 60 * 1000;
    const TWELVE_HOURS = 1 * 60 * 60 * 1000;

    
    setInterval(async () => {
        metaLog({type: LOG_TYPE.VERBOSE, content: "Starting periodic 10-minute Broadlink network scan..."});
        try {
            await Discover_Broadlinks(5000); 
            metaLog({type: LOG_TYPE.VERBOSE, content: "Periodic Broadlink scan completed."});
        } catch (err) {
            metaLog({type: LOG_TYPE.ERROR, content: "Error during periodic Broadlink scan: " + err});
        }
    }, TEN_MINUTES);

    setInterval(() => {
        metaLog({type: LOG_TYPE.VERBOSE, content: "Starting periodic 12-hour cache cleanup..."});
        Clean_Broadlink_Cache(TWELVE_HOURS);
    }, TWELVE_HOURS);
}

main();

    