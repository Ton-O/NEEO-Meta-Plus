
const fs = require('fs').promises; 
const { access } = require('node:fs/promises');
const path = require ( 'path');
const logModule="GoogleTV";


const express = require ( 'express');
process.env.StartupPath="/opt/meta"    // small trick (for now) to incorporate GoogleTV.js into logLevel environment from meta.js
const { metaMessage, LOG_TYPE,OverrideLoglevel,initialiseLogSeverity } = require("./metaMessage");
console.error = console.info = console.debug = console.warn = console.trace = console.dir = console.dirxml = console.group = console.groupEnd = console.time = console.timeEnd = console.assert = console.profile = function() {};
function metaLog(message) {
  let initMessage = { component:'GoogleTV', type:LOG_TYPE.INFO, content:'', deviceId: '' };
  let myMessage = {...initMessage, ...message}
  return metaMessage (myMessage); 
} 

initialiseLogSeverity(logModule); 
OverrideLoglevel("DEBUG",logModule)
const server = express();
const bodyParser = require ( 'body-parser');
 const {
    AndroidRemote,
    RemoteKeyCode,
    RemoteDirection
} = require ( "androidtv-remote");

const { resolve } = require ( "path");

var Connections = []
var myAndroidRemote;
var MyHost;
var MyCert = {cert: "",key:""}
var NewCode;
var Coderequested=false;
var CodeRequestedForHost;


function getSession(MyHost,MyCerts) {
return new Promise(function (resolve, reject) {
    try {
    let host = MyHost 
    let options = {
    pairing_port : 6467,
    remote_port : 6466,
    name : 'androidtv-remote', 
    cert : MyCerts}
    myAndroidRemote = new AndroidRemote(host, options)

    myAndroidRemote.on('secret', () => {
        metaLog({type:LOG_TYPE.ALLWAYS, content:'We need a new secret; provide this via web interface please (for example: port http://10.0.0.1:6468/secret?secret=1cba6d)'});
        metaLog({type:LOG_TYPE.ALLWAYS, content:'`replace 10.0.01 with the ip-address of meta, and fill in code that is shown on screen`'});
        Coderequested=true;                 // set signal that we need a secret code (provided via web-interface of this container)
        CodeRequestedForHost=MyHost;
        }
    )
    myAndroidRemote.on('powered', (powered) => {
         globalPowered = powered;
         metaLog({type:LOG_TYPE.DEBUG, content:'Powered:',params: powered});
     });
    myAndroidRemote.on('volume', (volume) => {
        metaLog({type:LOG_TYPE.DEBUG, content:'Volume:',params: volume.level});
        metaLog({type:LOG_TYPE.DEBUG, content:'Volume maximum:',params: volume.maximum});
        metaLog({type:LOG_TYPE.DEBUG, content:'Muted:',params: volume.muted});
    });
    myAndroidRemote.on('current_app', (current_app) => {
        metaLog({type:LOG_TYPE.DEBUG, content:'Current App:',params: current_app});
    });
    myAndroidRemote.on('error', (error) => {
        metaLog({type:LOG_TYPE.ERROR, content:'Error:',params: err});
    });
    myAndroidRemote.on('unpaired', () => {
        metaLog({type:LOG_TYPE.DEBUG, content:'Unpaired'});
    });
    myAndroidRemote.on('ready',  () => {
        metaLog({type:LOG_TYPE.VERBOSE, content:'Connection with GoogleTV is ready'});
        myAndroidRemote.Ready=true;
        metaLog({type:LOG_TYPE.VERBOSE, content:'flagged ready`'});
        setTimeout(() => {
            resolve(myAndroidRemote) // add a short delay before actually using the remote. allows init of android-remote lib
        }, 500);
    });
    myAndroidRemote.start().then (() => {
        //myAndroidRemote
    })
}
catch(err) {console.log(err)}
  })
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function HandleDownload(MyType,MyElement,res)
{
    MyType = MyType.toLowerCase();                  
    if (["images","irdevices","devices","firmware"].includes(MyType))
        {var Path = "/opt/meta/NoCloud/"+MyType
        var FilePath = Path + "/"+MyElement
        var ResolvedPath = path.resolve(FilePath);         // Resolve the path that is defined to the actual path
        if (ResolvedPath.substring(0,Path.length) == Path) // And check to see if the path is not manipulated to download files that aren;t supposed to.
            {metaLog({type:LOG_TYPE.INFO, content:"Request to download type "+MyType,params: MyElement});
            //var myFile = new File(ResolvedPath);
            if (await exists(ResolvedPath))
                {metaLog({type:LOG_TYPE.INFO, content:"File successfully downloaded: "+MyType,params: ResolvedPath});
                    res.download(ResolvedPath)
                }
            else
                {metaLog({type:LOG_TYPE.ERROR, content:"File not found:"+MyType,params: ResolvedPath});
                res.status(404).json({"Status": "fail",error: 404, reason: "File not found"});
                } 
            }
        else   
            {metaLog({type:LOG_TYPE.ERROR, content:"Manipulation found: "+MyType,params: MyElement});
            res.status(505).json({"Status": "fail",error: 505, reason: "Invalid path manipulation"});
            } 
        }
    else
        {metaLog({type:LOG_TYPE.ERROR, content:"Invalid type"+MyType,params: MyElement});
        res.status(506).json({"Status": "fail",error: 506, reason: "Type not allowed"});
        }
}

async function FillInCodeRequest(code,thisDevice)
{
    metaLog({type:LOG_TYPE.INFO, content:"Sending code",params: code});
    myAndroidRemote.sendCode(code);
    metaLog({type:LOG_TYPE.INFO, content:"Need to get new certificate"});
    let NewCert = MyCert;
    if (NewCert.key.length == 0)  { 
        metaLog({type:LOG_TYPE.INFO, content:"Need to get new certificate"});
        NewCert = myAndroidRemote.getCertificate();
        const theCert = `/opt/meta/.ssh/GoogleCert@${thisDevice}.pem`;
        const theCertKey = `/opt/meta/.ssh/GoogleKey@${thisDevice}.pem`;
        metaLog({type:LOG_TYPE.INFO, content:"Saving certificate as",params:theCert});
        fs.writeFile(theCert,  JSON.stringify(NewCert.cert), (err) =>
            { if (err)
                throw err;
            });  
        fs.writeFile(theCertKey,    JSON.stringify(NewCert.key), (err) => 
            {if (err) 
                throw err;
            });  
    }

}

async function load_file(theCert,thekey)
{

    try {    
        await fs.access(theCert, fs.constants.F_OK);
    } catch (err) {
        metaLog({type:LOG_TYPE.INFO, content:"Certificate "+theCert+ " not found"});
        return 0;
    }
    try {
        metaLog({type:LOG_TYPE.INFO, content:"Certificate "+theCert+" is available, we will now load it"});

        const certData = await fs.readFile(theCert);
        const keyData = await fs.readFile(thekey);

        MyCert.cert = JSON.parse(certData);
        MyCert.key = JSON.parse(keyData);     
	metaLog({type:LOG_TYPE.INFO, content:"Loading successfull "+theCert});
        return MyCert;
    } catch (err) {
        metaLog({type:LOG_TYPE.INFO, content:"Error loading "+theCert,params:err});
        return 0;
    }

}

async function LoadSpecificCert(thisDevice)
{   
    const Part1 = "/opt/meta/.ssh/Google"
    var   Part2C = "Cert"
    var   Part2K = "Key"
    var   Part5 = "@"+thisDevice
    const Part9 = ".pem"
    var theCert = Part1+Part2C+Part5+Part9
    
    var theKey  = Part1+Part2K+Part5+Part9
    

    //var theCertKey = `/opt/meta/.ssh/GoogleKey@${thisDevice}.pem`;
    var theCertJSON = await load_file(theCert,theKey)
    if (theCertJSON!=0)
        return theCertJSON

    theCert = Part1+Part2C+Part9
    theKey  = Part1+Part2K+Part9
    metaLog({type:LOG_TYPE.VERBOSE, content:"No specific certificate found, trying to load generic one: ",params:theCert});
    return load_file(theCert,theKey)
}

async function Handle_NewSecretCode(Newcode) 
{let MyMessage;
    //http://10.0.0.99:6468/secret?secret=fced8e
    metaLog({type:LOG_TYPE.INFO, content:"Received secret code:",params:Newcode});
    if (Coderequested == true)
    {    MyMessage =  "Thank you for code " + Newcode;
        FillInCodeRequest(Newcode,CodeRequestedForHost);
        Coderequested = false;
    }
    else
         MyMessage =  "Thanks for providing this code, but no pairing code was asked for....";        
    metaLog({type:LOG_TYPE.INFO, content:Newcode});
    return MyMessage;

}

async function main() {
	server.use(bodyParser.json());
	server.use(bodyParser.urlencoded({
			extended: true
	}));
    let config = {
        "webPort" : 6468,
        "friendlyDeviceName" : "GoogleTV"
        } 

	await server.listen(config.webPort, () => {
		metaLog({type:LOG_TYPE.INFO, content:"Webserver running on port" ,params:config.webPort});
    });
		
	server.get("/shutdown", (req, res, next) => {
        res.sendFile(__dirname + '/index.html');
    });
    server.post("/secret", async (req, res, next) => {
        NewCode=req.body.secret
        let MyResult = await Handle_NewSecretCode(NewCode);
        res.json({"Type": "Post", "Status": MyResult});        
    });
    server.get("/OverrideLogLevel", async (req, res, next) => {
        let logLevel = req.query.logLevel
        metaLog({type:LOG_TYPE.INFO, content:"Setting loglevel for GoogleTV through get to"+logLevel})
        OverrideLoglevel(logLevel,logModule);
        res.json({"Type": "OverrideLogLevel", "Status": "Processed"});        
    });
    server.get("/secret", async (req, res, next) => {
        NewCode=req.query.secret;
        let MyResult = await Handle_NewSecretCode(NewCode);
        res.json({"Status": MyResult});        
    });
    server.get("/api",  (req, res, next) => {
        MyHost = req.query.host
        metaLog({type:LOG_TYPE.INFO, content:"GoogleTV API Call for" ,params:MyHost});
        HandleApi(req,res,next)
    });
    server.get("/init", async (req, res, next) => { // here we look for a Google-certificate created befiore for this SPECIFIC device.
        try {const parms = { host: MyIP, port: Myport, mac: MyMac } = req.query;
            const resultaat = await LoadSpecificCert(parms.host);
            metaLog({type:LOG_TYPE.INFO, content:"Init Connection with" ,params:parms.host});
            res.send("Succesvol uitgevoerd");
        } catch (err) {
            metaLog({type:LOG_TYPE.ERROR, content:"Something's wrong within GoogleTV init call" ,params:err});
            next(err);
        }
    });
    server.get("/download",  (req, res, next) => {
        var MyType=req.query.type;
        metaLog({type:LOG_TYPE.INFO, content:"Download "+MyType});
        if (MyType != undefined && MyType != "")
            {var MyName = req.query.name;
            if (MyName != undefined && MyName != "")
                HandleDownload(MyType,MyName,res);
            else
                {metaLog({type:LOG_TYPE.ERROR, content:"Missing object name:"+ MyType ,params:MyElement});
                res.status(404).json({
                    error: 404,
                    message: "Route not found."
                })    
                res.status(504).json({"Status": "fail",error:504, reason: "Object name not given"});
                }
            }
        else
            {metaLog({type:LOG_TYPE.ERROR, content:"Missing object type:"+ MyType ,params:MyElement});
            res.json({"Status": "fail",reason: "Type of object not given"});        
        }
    });
    server.post("/api",  (req, res, next) => {
        MyHost = req.body.host
         HandleApi(req,res,next)
    });

}

async function sendPower(desiredState) {

    androidRemote = await GetConnection(MyHost)

    const waitForPowerEvent = new Promise((resolve) => {
        androidRemote.once('powered', (powered) => {
            metaLog({type:LOG_TYPE.INFO, content:"Powerstate event received... `"+ powered});
            resolve(powered); // returning state to function that is waiting on us
        });
    });
    metaLog({type:LOG_TYPE.INFO, content:"sendPower (Toggle) will be send"});
    await androidRemote.sendPower(); // toggle power; this should trigger a powered event which shows the toggled powerstate.
    metaLog({type:LOG_TYPE.INFO, content:"sendPower (Toggle) sent"});

    const newStatus = await waitForPowerEvent;
    metaLog({type:LOG_TYPE.DEBUG, content:"Desired: "+desiredState+"; current state: "+ newStatus});

    if (desiredState === 'ON')
    {   if (!newStatus) {
            metaLog({type:LOG_TYPE.INFO, content:"Desired: "+desiredState+"; however, device is OFF... toggle power"});
            await androidRemote.sendPower();
        }
    }
    else    // Desiredstate = off
        if (newStatus) {
            metaLog({type:LOG_TYPE.INFO, content:"Desired: "+desiredState+"; however, device is ON... toggle power"});
            await androidRemote.sendPower();
        }

};

async function sendKey(key) {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Send key "+key,params:RemoteKeyCode[key]});
    GetConnection(MyHost)
    .catch(error => metaLog({type:LOG_TYPE.VERBOSE, content:"We do not have a connection setup yet",params:error}))
    .then  ((androidRemote) => {metaLog({type:LOG_TYPE.DEBUG, content:'Got connection;SendKey'});
        androidRemote.sendKey(RemoteKeyCode[key], RemoteDirection.SHORT)
	metaLog({type:LOG_TYPE.VERBOSE, content:"Send key done"+key,params:RemoteKeyCode[key]});
    })
};

async function sendAppLink(AppLink) {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Send appLink: ",params:AppLink});

    GetConnection(MyHost).then  ((androidRemote) => {
        androidRemote.sendAppLink(AppLink);
    })
};

 function HandleApi(req,res,next)
{
    switch(req.body.action){
            case 'sendKey':
                sendKey(req.body.key);
                break;						
            case 'sendAction':
                metaLog({type:LOG_TYPE.DEBUG, content:"Received action-request ",params:req.body.theAction});
                sendKey(req.body.theAction );
                break;            
            case 'sendPower':
                metaLog({type:LOG_TYPE.DEBUG, content:"Received power-request ",params:req.body.DesiredState});
                sendPower(req.body.DesiredState);
                break;            
            case 'sendAppLink':
                sendAppLink(req.body.AppLink);
                break;            
                // am start -a android.intent.action.VIEW -n org.xbmc.kodi/.Splash
            default:
                res.json({"Status": "Error"});
                return;
                break;
    }
    res.json({"Status": "Ok"});
}

 function GetConnection(MyHost) {
  return new Promise(async function (resolve, reject) {

    metaLog({type:LOG_TYPE.DEBUG, content:"Checking availability of connection"});
    let connectionIndex = Connections.findIndex((con) => {return con.Host == MyHost});
    if  (connectionIndex < 0) {
        metaLog({type:LOG_TYPE.DEBUG, content:"Connection not yet created, doing now for "+MyHost});
        await LoadSpecificCert(MyHost);
        getSession(MyHost,MyCert).then ((Connection) => { 
                GotSession(Connection);
                myAndroidRemote = Connection;
                resolve(Connection); 
            })
	}
    else {
        myAndroidRemote = Connections[connectionIndex].Connector
        metaLog({type:LOG_TYPE.VERBOSE, content:"Connection found for "+MyHost});
        // metaLog({type:LOG_TYPE.DEBUG, content:"myAndroidRemote",params:myAndroidRemote});
        resolve(myAndroidRemote)
    }
    })
 }
function GotSession(Connection) {
    myAndroidRemote = Connection 
    Connections.push({"Host": MyHost, "Connector": Connection});
}
main();
