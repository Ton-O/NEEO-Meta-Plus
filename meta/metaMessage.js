const path = require('path');
const settings = require(path.join(__dirname,'settings'));
const logmodules = require(path.join(__dirname,'logComponents'));


const LOG_TYPE = {'ALWAYS':{Code:'A', Color:'\x1b[33m'}, 'INFO':{Code:'I', Color:'\x1b[32m'}, 'VERBOSE':{Code:'V', Color:'\x1b[36m'}, 'WARNING':{Code:'W', Color:'\x1b[35m'}, 'ERROR':{Code:'E', Color:'\x1b[31m'}, 'FATAL':{Code:'F', Color:'\x1b[41m'}, 'DEBUG':{Code:'D', Color:'\x1b[36m'}}
const LOG_LEVEL = {'QUIET':[LOG_TYPE.ALWAYS], 
                    'WARNING':[LOG_TYPE.ALWAYS,LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING],
                    'INFO': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO],
                    'VERBOSE': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO, LOG_TYPE.VERBOSE],
                    'DEBUG': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO, LOG_TYPE.VERBOSE,LOG_TYPE.DEBUG]
                }

//Initialise Severity Level;
var mySeverity = null;
var mySeverityText = null;
var myComponents = [];
if (mySeverity == null) { 
    if (settings.LogSeverity) // Getting loglevel from the settigns.json file (note, can be overwritten by passing argument at runtime)
        { mySeverity = LOG_LEVEL[settings.LogSeverity];
        mySeverityText = settings.LogSeverity;  // Did the user override this setting during runtime?
        }
    else 
        {mySeverity == LOG_LEVEL.QUIET; 
        mySeverityText = "QUIET"
        }
    }
metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Loglevel "+mySeverityText});

function getLoglevels()
{   try {
        let logArray = [];
        logArray.push({Name:"ALL",LOG_LEVEL:mySeverity,TextLevel:mySeverityText});
        logmodules.MetaComponents.forEach((metaComponent) => 
            {let CompIndex =myComponents.findIndex((Comp) => {return Comp.Name == metaComponent    });
            if (CompIndex!= -1) 
                logArray.push(myComponents[CompIndex]);
                //console.log(myComponents[CompIndex].Name,myComponents[CompIndex].TextLevel)
            else
                //console.log(metaComponent,"follows global")
                logArray.push({Name:metaComponent,LOG_LEVEL:"",TextLevel:"Following global"});
        })
        return logArray;
}
catch (err) {console.log(err)}
}
function OverrideLoglevel(NewLogLevel,Module) {
    if (Module != undefined && Module != '')
        {if (Module == "ALL")
            {if (NewLogLevel=="")
                {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Cannot remove global loglevel "+mySeverityText});
                return -4;

            }
            else
                {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"MetaCore is overriding global loglevel to "+NewLogLevel});
                mySeverity = LOG_LEVEL[NewLogLevel];
                mySeverityText = NewLogLevel;
                return 0;
                }
            }
        else    
            {let CompIndex = myComponents.findIndex((Comp) => {return Comp.Name == Module    });
            let oldLogLevel = "''";
            if (CompIndex!= -1) {
                for (var i = myComponents.length - 1; i >= 0; i--) {
                    if (myComponents[i].Name === Module) 
                        {oldLogLevel = myComponents[i].TextLevel;
                        metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Removing old loglevel "+ oldLogLevel + " for component "+Module});
                        myComponents.splice(i, 1);
                        return 4;
                        }
                   }
                }
            if (NewLogLevel!="")    // In case it is not a remove            
                {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Setting log for component "+Module+" from "+oldLogLevel+" to "+NewLogLevel});
                myComponents.push({Name:Module,LOG_LEVEL:LOG_LEVEL[NewLogLevel],TextLevel:NewLogLevel});
                return 8;
            }
            else
                {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Component "+Module+" is now following global loglevel "+mySeverityText});
                return 12;
            }
            }
        }
    else
        {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"MetaCore without module; overriding global loglevel to "+NewLogLevel})
        mySeverity = LOG_LEVEL[NewLogLevel];
        mySeverityText = NewLogLevel;
        return 16;
        }
}

function initialiseLogSeverity(sever) 
{ 
      mySeverity = LOG_LEVEL[sever];mySeverityText = sever;
      if (mySeverity==undefined)
        {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Unknown Loglevel requested; 'QUIET' substituted "+sever})
        mySeverity = LOG_LEVEL["QUIET"];mySeverityText = "QUIET";
        }
      metaMessage({component:"metaMessage",type:LOG_TYPE.VERBOSE, content:"inited Loglevel "+mySeverityText});
}
function initialiseLogComponents(comp) 
{
    myComponents = comp;
}

function metaMessage(message) {

try {
    let CompIndex = myComponents.findIndex((Comp) => {return Comp.Name == message.component    });
    if (mySeverity ) {//&& myComponents) {
        if ((CompIndex == -1 && mySeverity.includes(message.type)) 
            ||(CompIndex != -1   && myComponents[CompIndex].LOG_LEVEL.includes(message.type)    // Check modue specific
        )) 
            {console.log('\x1b[4m', (new Date()).toLocaleString() + "\x1b[0m \x1b[36m\x1b[7m" + (message.deviceId ? message.deviceId : "no deviceId") + "\x1b[0m - " + message.component + "\x1b[0m: ", message.type.Color, (typeof message.content == 'object' ? "JSON Object":message.content), '\x1b[0m');
            if (typeof message.content == 'object') { console.log('\x1b[0m\x1b[2m', message.content, '\x1b[0m') };
            if (Array.isArray(message.content)) { console.log('\x1b[0m\x1b[2m', JSON.stringify(message.content), '\x1b[0m') };
            }
        }
    }
    catch(err) {console.log("Err in metamessage",err)}
}

exports.getLoglevels = getLoglevels;
exports.OverrideLoglevel = OverrideLoglevel;
exports.metaMessage = metaMessage;
exports.LOG_TYPE = LOG_TYPE;
exports.LOG_LEVEL = LOG_LEVEL;
exports.initialiseLogSeverity = initialiseLogSeverity;
exports.initialiseLogComponents = initialiseLogComponents;
