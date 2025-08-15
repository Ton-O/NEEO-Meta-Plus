const path = require('path');
const settings = require(path.join(__dirname,'settings'));
// Next line gets the location of the startup file, then uses that to find its logComponents.js file
const StartupPath = process.env.StartupPath;
const {logModules,produceNrSnapshotWhenError} = require(path.join(StartupPath,'logComponents'));

const LOG_TYPE = {'ALWAYS':{Code:'A', Color:'\x1b[33m'}, 'INFO':{Code:'I', Color:'\x1b[32m'}, 'VERBOSE':{Code:'V', Color:'\x1b[36m'}, 'WARNING':{Code:'W', Color:'\x1b[35m'}, 'ERROR':{Code:'E', Color:'\x1b[31m'}, 'FATAL':{Code:'F', Color:'\x1b[41m'}, 'DEBUG':{Code:'D', Color:'\x1b[36m'}}
const LOG_LEVEL = {'MUTED':[LOG_TYPE.ALWAYS], 'QUIET':[LOG_TYPE.ALWAYS,LOG_TYPE.FATAL, LOG_TYPE.ERROR], 
                    'WARNING':[LOG_TYPE.ALWAYS,LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING],
                    'INFO': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO],
                    'VERBOSE': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO, LOG_TYPE.VERBOSE],
                    'DEBUG': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO, LOG_TYPE.VERBOSE,LOG_TYPE.DEBUG]
                }

//Initialise Severity Level;
var mySeverity = null;
var mySeverityText = null;
var myComponents = [];
const REPRODUCE_MESSAGES = 2;
const SEVERITYFILTER_DISABLED = 1;
const SEVERITYFILTER_ENABLED = 0;
var forceDisplay = SEVERITYFILTER_ENABLED;

var last_Error=0;
var messageStack=[];
var firstPos=0;
var nextPos=0;
var queuedItems=0;
const max_TimeForceDisplay = 1000;
var produceNrSnapshot = produceNrSnapshotWhenError;
if (produceNrSnapshot == undefined)
   produceNrSnapshot = 200;

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
//metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Loglevel "+mySeverityText});

function getLoglevels(theModule = undefined)
{   try {
        let logArray = [];
        logArray.push({Name:"ALL",LOG_LEVEL:'',TextLevel:mySeverityText});
        if (theModule != undefined && theModule.toUpperCase() != "ALL")
        {   let CompIndex =myComponents.findIndex((Comp) => {return Comp.Name == theModule});
            if (CompIndex!= -1)
            {   logArray = []; // clear the "ALL" component
                let bb = JSON.stringify(myComponents[CompIndex])    
                logArray.push(JSON.parse(bb));
                logArray[logArray.length-1].LOG_LEVEL=''
            }
        }
        else
            { logModules.MetaComponents.forEach((metaComponent) =>
                {let CompIndex =myComponents.findIndex((Comp) => {return Comp.Name == metaComponent    });
                if (CompIndex!= -1)
                    {let bb = JSON.stringify(myComponents[CompIndex])
                    logArray.push(JSON.parse(bb));
                    logArray[logArray.length-1].LOG_LEVEL=''
                    }
                else
                    {logArray.push({Name:metaComponent,LOG_LEVEL:"",TextLevel:"Following global"});
                    logArray[logArray.length-1].LOG_LEVEL='';
                    }
                })
            }
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
                {if (NewLogLevel!="" && NewLogLevel != undefined)    // First check if any supplied new loglevel is valid           
                    if (LOG_LEVEL[NewLogLevel] == undefined)
                        {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Invalid loglevel requested "+Module+": "+NewLogLevel});
                        return -12;
                        }
                metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"MetaCore is overriding global loglevel to "+NewLogLevel});
                mySeverity = LOG_LEVEL[NewLogLevel];
                mySeverityText = NewLogLevel;
                return 0;
                }
            }
        else    
            {if (NewLogLevel!="" && NewLogLevel != undefined)    // First check if any supplied new loglevel is valid           
                if (LOG_LEVEL[NewLogLevel] == undefined)
                    {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Invalid loglevel requested "+Module+": "+NewLogLevel});
                    return -12;
                    }
            let CompIndex = myComponents.findIndex((Comp) => {return Comp.Name == Module    });
            let oldLogLevel = "''";
            if (CompIndex!= -1) {
                for (var i = myComponents.length - 1; i >= 0; i--) {
                    if (myComponents[i].Name === Module) 
                        {oldLogLevel = myComponents[i].TextLevel;
                        metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Removing old loglevel "+ oldLogLevel + " for component "+Module});
                        myComponents.splice(i, 1);
                        }
                   }
                }
            if (NewLogLevel!="")    // In case it is not a remove            
                {   metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Setting log for component "+Module+" from "+oldLogLevel+" to "+NewLogLevel});
                    myComponents.push({Name:Module,LOG_LEVEL:LOG_LEVEL[NewLogLevel],TextLevel:NewLogLevel});
                    return 8;
                }
            else
                {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Component "+Module+" is now following global loglevel "+mySeverityText});
                return -12;
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
function metaMessageParamHandler(theArg)
{
    if (Array.isArray(theArg)) 
        console.log('\x1b[0m\x1b[2m', JSON.stringify(theArg), '\x1b[0m') 
    else
        console.log('\x1b[0m\x1b[2m', theArg, '\x1b[0m') 

}

function metaMessage(message) 
{
      try {
        if ((message.type==LOG_TYPE.FATAL|| (message.type==LOG_TYPE.ERROR &&message.component!="labelHelper"))&&produceNrSnapshot)
        {   let d = new Date();  // Labelhelper spits out spurious errors, so ignore these "as severe"
            if (last_Error == 0 || d.getTime() - last_Error > max_TimeForceDisplay)
            {   console.log('\x1b[31m',"******** Severe error: Message type =",message.type,"Component:",message.component,"content:",message.content,"********")
                if (SEVERITYFILTER_ENABLED)
                {   forceDisplay = SEVERITYFILTER_DISABLED
                    console.log('\x1b[31m',"******** Severity-filter disabled for",max_TimeForceDisplay," microseconds ********")

                    if (queuedItems)
                    {   console.log('\x1b[31m',"******** So we'll reproduce all",produceNrSnapshot," last messages ********")
                        forceDisplay = REPRODUCE_MESSAGES;
                    }
                }
            }
            last_Error = d.getTime();
        }

        if (forceDisplay)
        {   let d = new Date();
            if (d.getTime() - last_Error < max_TimeForceDisplay)
            {   if (forceDisplay == REPRODUCE_MESSAGES)
                {   let j = firstPos;
                    for (let i = 0;i<queuedItems;i++)
                        {produceMessage(messageStack[j]);
                        if (++j > produceNrSnapshot)  j=0;  // round robin buffer, so skip to being
                        }
                    forceDisplay==SEVERITYFILTER_ENABLED;
                    console.log('\x1b[31m',"******** Message type =",message.type,"Reproduction of",produceNrSnapshot," messages done ********" )                   
                }
                produceMessage(message,forceDisplay)
                queuedItems=0;
            }
            else 
                {forceDisplay = SEVERITYFILTER_ENABLED;
                console.log('\x1b[31m',"******** Original severity-filter enabled again")
                }
        }
        if (forceDisplay == SEVERITYFILTER_ENABLED)
        {   handleOneMessage(message,forceDisplay)  
            if (queuedItems==produceNrSnapshot) 
            {   if (++nextPos > produceNrSnapshot)
                    nextPos=0;
                if (++firstPos > produceNrSnapshot)
                    firstPos=0;
            }
            else
                {++queuedItems;
                ++nextPos;
                }
            messageStack[nextPos]= message;

        }
    }
    catch (err) {console.log("error in metamessage",err)}
}


function produceMessage(message)
{try {
    console.log('\x1b[4m', (new Date()).toLocaleString() + "\x1b[0m \x1b[36m\x1b[7m" + (message.deviceId ? message.deviceId : "no deviceId") + "\x1b[0m - " + message.component + "\x1b[0m: ", message.type.Color, (typeof message.content == 'object' ? "JSON Object":message.content), '\x1b[0m');
    if (typeof message.content == 'object' || Array.isArray(message.content ))
        metaMessageParamHandler(message.content)
    if (message.params!=undefined)
        metaMessageParamHandler(message.params)
    return 1;  // signal message is written
}
catch(err) {console.log("Err in producemessage",err)}

}

function handleOneMessage(message,Forced) 
{try {
    let CompIndex = myComponents.findIndex((Comp) => {return Comp.Name == message.component    });
        if (mySeverity ) {//&& myComponents) {
            if ((CompIndex == -1 && mySeverity.includes(message.type)) ||(CompIndex != -1   && myComponents[CompIndex].LOG_LEVEL.includes(message.type) ))    // Check module specific 
                produceMessage(message)
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
