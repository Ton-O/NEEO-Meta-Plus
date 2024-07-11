const  fs = require ( "fs");
const path = require ( 'path');

const { createLogger,transports,format} = require ( 'winston');

const { combine, timestamp, json } = format;
const logger = createLogger({
    defaultMeta: { component: 'G-TV' },
    format: format.combine(
        format.timestamp({
            format: 'YYMMDD-HH:mm:ss'
        }),
        format.json(),
        format.printf(info => {
            return `${info.timestamp} ${info.level}: ${info.message}`;
          })
      ),
   transports: [
       new transports.Console({ level: 'debug' })
     ]
 });

const express = require ( 'express');

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
var NewCode
var Coderequested=false;


async function getSession(MyHost,MyCerts) {
return new Promise(function (resolve, reject) {

    let host = MyHost 
    let options = {
    pairing_port : 6467,
    remote_port : 6466,
    name : 'androidtv-remote', 
    cert : MyCerts}
    myAndroidRemote = new AndroidRemote(host, options)
    myAndroidRemote.on('secret', () => {
        logger.debug(`We need a new secret; provide this via web interface please (for example: port http://10.0.1.99:6468/secret?secret=1cba6d )`);
        Coderequested=true;                 // set signal that we need a secret code (provided via web-interface of this container)
        }
    )

    myAndroidRemote.on('powered', (powered) => {
        logger.debug(`Powered: ${powered}`);
    });

    myAndroidRemote.on('volume', (volume) => {
        logger.debug(`Volume: ${volume.level} / ${volume.maximum} | Muted : " + ${volume.muted}`);
    });

    myAndroidRemote.on('current_app', (current_app) => {
        logger.debug(`Current App : ${current_app}`);
    });

    myAndroidRemote.on('error', (error) => {
        logger.debug(`Error: ${error}`);
    });

    myAndroidRemote.on('unpaired', () => {
        logger.debug(`Unpaired`);
    });

    myAndroidRemote.on('ready',  () => {
        logger.debug(`Connection with GoogleTV is ready`);
        resolve(myAndroidRemote)
    });
    myAndroidRemote.start().then (() => {
    })
    
  })
}

async function HandleDownload(MyType,MyElement,res)
{
    MyType = MyType.toLowerCase();                  
    if (["images","irdevices","devices","firmware"].includes(MyType))
        {var Path = "/opt/meta/NoCloud/"+MyType
        var FilePath = Path + "/"+MyElement
        var ResolvedPath = path.resolve(FilePath);         // Resolve the path that is defined to the actual path
        if (ResolvedPath.substring(0,Path.length) == Path) // And check to see if the path is not manipulated to download files that aren;t supposed to.
            {logger.info(`Request to download type  ${MyType} ${MyElement}`)
            //var myFile = new File(ResolvedPath);
            if (fs.existsSync(ResolvedPath))
                {logger.info(`File successfuly downloaded: ${ResolvedPath}`)
                    res.download(ResolvedPath)
                }
            else
                {logger.error(`File not found: ${ResolvedPath}`)
                res.status(404).json({"Status": "fail",error: 404, reason: "File not found"});
                } 
            }
        else   
            {logger.error(`Manipulation found:  ${MyType} ${MyElement}`)
            res.status(505).json({"Status": "fail",error: 505, reason: "Invalid path manipulation"});
            } 
        }
    else
        {logger.error(`Invalid type:  ${MyType} ${MyElement}`)
        res.status(506).json({"Status": "fail",error: 506, reason: "Type not allowed"});
        }
}

async function FillInCodeRequest(code)
{
    logger.info("Sending code");
    logger.info(code);
    myAndroidRemote.sendCode(code);
    logger.info("Need to get new certificate")
    let NewCert = MyCert;
    if (NewCert.key.length == 0)  { 
        logger.info("Need to get new certificate")
        NewCert = myAndroidRemote.getCertificate();
        logger.info(`Writing certificates to .ssh`)    
        fs.writeFile('/opt/meta/.ssh/GoogleCert.pem',  JSON.stringify(NewCert.cert), (err) =>
            { if (err)
                throw err;
            logger.info('Write cert complete');
            });  
        fs.writeFile('/opt/meta/.ssh/GoogleKey.pem',    JSON.stringify(NewCert.key), (err) => 
            {if (err) 
                throw err;
            logger.info('Write key complete');
            });  
    }

}
async function LoadCert()
{
    fs.access('/opt/meta/.ssh/GoogleCert.pem', fs.constants.F_OK | fs.constants.W_OK, (err) => {
        if (err) {
            logger.info("No certificates to load")
        } else {
            logger.info("Certificates available, we will now load them")
            let cert = fs.readFileSync('/opt/meta/.ssh/GoogleCert.pem')
            let key = fs.readFileSync('/opt/meta/.ssh/GoogleKey.pem')
            MyCert.cert = JSON.parse(cert)
            MyCert.key = JSON.parse(key)
            logger.info("Certificates loaded")            }
        });
}
async function Handle_NewSecretCode(Newcode) 
{let MyMessage;
    //http://10.0.0.99:6468/secret?secret=fced8e
    logger.info(`Received secret code: ${Newcode}`);
    if (Coderequested == true)
    {    MyMessage =  "Thank you for code " + Newcode;
        FillInCodeRequest(Newcode);
        Coderequested = false;
    }
    else
         MyMessage =  "Thanks for providing this code, but no pairing code was asked for....";        
    logger.info(MyMessage);
    return MyMessage;

}

async function main() {
    //var Return = getSession()
    await LoadCert();
    logger.info(`Loaded cert: ${MyCert}`)
	server.use(bodyParser.json());
	server.use(bodyParser.urlencoded({
			extended: true
	}));
    let config = {
        "webPort" : 6468,
        "friendlyDeviceName" : "GoogleTV"
        } 

	await server.listen(config.webPort, () => {
		logger.info(`Webserver running on port: ${config.webPort}`);
    });
		
	server.get("/shutdown", (req, res, next) => {
        res.sendFile(__dirname + '/index.html');
    });
    server.post("/secret", async (req, res, next) => {
        NewCode=req.body.secret
        let MyResult = await Handle_NewSecretCode(NewCode);
        res.json({"Type": "Post", "Status": MyResult});        
    });
    server.get("/secret", async (req, res, next) => {
        NewCode=req.query.secret;
        let MyResult = await Handle_NewSecretCode(NewCode);
        res.json({"Status": MyResult});        
    });
    server.get("/api",  (req, res, next) => {
        logger.info(`GTV: ${req.query}`)
        MyHost = req.query.host
        logger.info(`GET GoogleTV Call for ${MyHost}`)
         HandleApi(req,res,next)
    });
    server.get("/dapi",  (req, res, next) => {
        logger.info(`GTV: ${req.query}`)
        MyHost = req.query.host
        logger.info(`GET download Call for ${MyHost}`)
         //HandleApi(req,res,next)
    });
    server.get("/download",  (req, res, next) => {
        var MyType=req.query.type;
        logger.info(`GET (download)  ${MyType}`)
        if (MyType != undefined && MyType != "")
            {var MyName = req.query.name;
            if (MyName != undefined && MyName != "")
                HandleDownload(MyType,MyName,res);
            else
                {logger.error(`Missing object name:  ${MyType} ${MyElement}`)
                res.status(404).json({
                    error: 404,
                    message: "Route not found."
                })    
                res.status(504).json({"Status": "fail",error:504, reason: "Object name not given"});
                }
            }
        else
            {logger.error(`Missing object Type:  ${MyType} ${MyElement}`)    
            res.json({"Status": "fail",reason: "Type of object not given"});        
        }
    });
    server.post("/api",  (req, res, next) => {
        logger.info(`GTV: ${req.body}`)
        MyHost = req.body.host
        logger.info(`POST GoogleTV Call for ${MyHost}`)
         HandleApi(req,res,next)
    });

}

async function sendPower() {
    
    GetConnection(MyHost).then  ((androidRemote) => {
        logger.info("Toggling power");
        androidRemote.sendPower();
    })
};

async function sendKey(key) {
    logger.debug(`Send key: ${key}; ${RemoteKeyCode[key]}`);

    GetConnection(MyHost).then  ((androidRemote) => {
        androidRemote.sendKey(RemoteKeyCode[key], RemoteDirection.SHORT);
    })
};

async function sendAppLink(AppLink) {
    logger.debug(`Send appLink: ${AppLink}`);

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
                sendKey(req.body.theAction);
                break;            
            case 'sendPower':
                sendPower();
                break;            
            case 'sendAppLink':
                sendAppLink(req.body.AppLink);
                break;            
                // am start -a android.intent.action.VIEW -n org.xbmc.kodi/.Splash
            default:
                res.json({"Status": "Error"});
                logger.info(`resolve default`)
                return;
                break;
    }
    res.json({"Status": "Ok"});
}

function GetConnection(MyHost) {
  return new Promise(function (resolve, reject) {

    logger.debug(`Checking availability of connection`);
    let connectionIndex = Connections.findIndex((con) => {return con.Host == MyHost});
    if  (connectionIndex < 0) {
        logger.debug(`Connection not yet created, doing now for: ${MyHost}`)
        getSession(MyHost,MyCert).then ((Connection) => { 
	        GotSession(Connection);
            myAndroidRemote = Connection;
            resolve(Connection); 
        })
	}
    else {
        myAndroidRemote = Connections[connectionIndex].Connector
        resolve(myAndroidRemote)
    }
    })
 }
function GotSession(Connection) {
    myAndroidRemote = Connection 
    Connections.push({"Host": MyHost, "Connector": Connection});
}
main();