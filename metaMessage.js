const path = require('path');
const settings = require(path.join(__dirname,'settings'));
// Next line gets the location of the startup file, then uses that to find its logComponents.js file
var StartupPath = process.env.StartupPath;
if (StartupPath != "/opt/meta")
   StartupPath = "/opt"; 

const {logModules,produceNrSnapshotWhenError} = require(path.join(StartupPath,'logComponents'));

const LOG_TYPE = {'ALWAYS':{Code:'A', Color:'\x1b[33m'}, 'INFO':{Code:'I', Color:'\x1b[32m'}, 'VERBOSE':{Code:'V', Color:'\x1b[36m'}, 'WARNING':{Code:'W', Color:'\x1b[35m'}, 'ERROR':{Code:'E', Color:'\x1b[31m'}, 'FATAL':{Code:'F', Color:'\x1b[41m'}, 'DEBUG':{Code:'D', Color:'\x1b[36m'}}
const LOG_LEVEL = {'MUTED':[LOG_TYPE.ALWAYS], 'QUIET':[LOG_TYPE.ALWAYS,LOG_TYPE.FATAL, LOG_TYPE.ERROR], 
                    'WARNING':[LOG_TYPE.ALWAYS,LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING],
                    'INFO': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO],
                    'VERBOSE': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO, LOG_TYPE.VERBOSE],
                    'DEBUG': [LOG_TYPE.ALWAYS,  LOG_TYPE.FATAL, LOG_TYPE.ERROR, LOG_TYPE.WARNING, LOG_TYPE.INFO, LOG_TYPE.VERBOSE,LOG_TYPE.DEBUG]
                }
var etcTimezone = "Utc";
const fs = require('fs');
// See if we can set date&time to our timezone; if not, 
try 
  {let data = fs.readFileSync('/etc/timezone');
  etcTimezone = data.toString().split('\n')[0]
  }
  catch(err) {console.log("Could not read local timezone, default Utc used",err)}
//Initialise Severity Level;
var globalSeverity = null;              // These 2 variables have been defined for performance-reasons; global settings are also defined in myComponents array
var globalSeverityText = null;          // See previous line
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

if (globalSeverity == null) { 
    if (settings.LogSeverity) // Getting loglevel from the settigns.json file (note, can be overwritten by passing argument at runtime)
        { globalSeverity = LOG_LEVEL[settings.LogSeverity];
        globalSeverityText = settings.LogSeverity;  // Did the user override this setting during runtime?
        }
    else 
        {globalSeverity == LOG_LEVEL.QUIET; 
        globalSeverityText = "QUIET"
        }
    }
//metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Loglevel "+globalSeverityText});

function getLoglevel(theModule )
{

}

function getLoglevels(theModule = undefined)
{
    initialiseLogSeverity(theModule);
    let logArray = [];
    myComponents.forEach((metaComponent) => {
        if (theModule == undefined || theModule == metaComponent.Name)
            {let bb = JSON.stringify(metaComponent) // stringify so we get a duplicate instead of inheritance
            if (metaComponent.logComponent.toUpperCase() != "GLOBAL" && metaComponent.Global)
                {bb = JSON.parse(bb);
                bb.logLevel = "Following global" 
                bb = JSON.stringify(bb);
                }
            logArray.push(JSON.parse(bb));
            logArray[logArray.length-1].LOG_LEVEL=''
            }
    })
     
    logArray.sort(function(a, b){return a.Name.toUpperCase() > b.Name.toUpperCase() ? 1 : -1; })
    return logArray;
}

function SavelogComponents_file()
{
    var theFileName = path.join(StartupPath,'logComponents.js')  
    var logComponentLines = [];
    logComponentLines.push('const logModules = [ ')
    for (let i = 0;i<myComponents.length;i++) 
    {   let MyBuffer = '                    {logComponent: "'+myComponents[i].Name+'",';
            MyBuffer = MyBuffer + 'logLevel:"'+ myComponents[i].logLevel+'",'
            MyBuffer = MyBuffer + 'FollowGlobal:'+(myComponents[i].Global?'true':'false')+","
            MyBuffer = MyBuffer + 'Enum:'+ myComponents[i].Enum+'}'
            if (i< myComponents.length -1)
                MyBuffer = MyBuffer + ','
            else
                MyBuffer = MyBuffer + ']'
        logComponentLines.push(MyBuffer)
    } 
    logComponentLines.push("const produceNrSnapshotWhenError = "+produceNrSnapshot)
    logComponentLines.push("module.exports = {logModules,produceNrSnapshotWhenError};\n");  // Create last line (exports) that will contain GlobalLogLevel too
    return new Promise(function(resolve, reject) {      // And write these lines with adjusted values to logComponents.js
        let logComponentjsNEW = logComponentLines.join('\n')
        fs.writeFile(theFileName, logComponentjsNEW, 'utf-8', function(err) {
            if (err) {console.log("write-err",err);reject(err);}
            else  resolve(logComponentjsNEW);
        });
    });
}

function OverrideLoglevel(NewLogLevelParm,Module,ORIGIN = "META") 
{
    let NewLogLevelText = NewLogLevelParm;
    let NewLogLevel;
    if (NewLogLevelParm!="" && NewLogLevelParm != undefined) {    // First check if any supplied new loglevel is valid
        NewLogLevel = LOG_LEVEL[NewLogLevelParm];
        if (NewLogLevel == undefined)
            {metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Invalid loglevel requested "+Module+": "+NewLogLevelParm});
            return -12;
        }
    }
    else
        NewLogLevelText="";

    // first, get the latest content of the logComponents.js file; this makes sure that changes that were applied from other components (by metaCore f.e.) aren't discarded

    initialiseLogSeverity(ORIGIN);
    let CompIndex;
    let MyMessage = "";
    let GlobalIndex = myComponents.findIndex((Comp) => {return Comp.Name == "Global"} );
    if (Module != undefined && Module != '') {
        CompIndex = myComponents.findIndex((Comp) => {return Comp.Name == Module    });
        if (CompIndex == GlobalIndex) {     // we have a request to change the global loglevel
            if (NewLogLevelText=="") {
                metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Cannot remove global loglevel "+globalSeverityText});
                return -4;
            }
            myComponents[GlobalIndex].LOG_LEVEL=NewLogLevel;
            myComponents[GlobalIndex].logLevel=NewLogLevelText;
            MyMessage = "MetaCore is overriding global loglevel to "+NewLogLevelText;
            globalSeverity = NewLogLevel;globalSeverityText = NewLogLevelText;
        }
        else 
        if (CompIndex != -1)
        {    if (NewLogLevelText!="") {   // First check if any supplied new loglevel is valid           
                MyMessage = "Setting log for component "+Module+" to "+NewLogLevelText;
                myComponents[CompIndex].Global = false;
            }
            else {
                if (ORIGIN=="META")
                {   MyMessage = "Setting log for component "+Module+" to follow global "+myComponents[GlobalIndex].logLevel;
                    myComponents[CompIndex].Global = true;
                    //NewLogLevel=myComponents[GlobalIndex].LOG_LEVEL;
                }
                else
                {   metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Cannot remove global loglevel for BRAIN: "+globalSeverityText});
                    return -4;
                }
            }
        }
        else 
        {Console.log("Invalid module specified:",Module,";ignoring this")
            return -1
        }
    }
    else
        {console.log("We probably need to code this section.... metaMessage ##99")
        return 99;
        }

    metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:MyMessage});
    myComponents[CompIndex].LOG_LEVEL=NewLogLevel;myComponents[CompIndex].logLevel=NewLogLevelText
    myComponents.sort(function(a, b){return a.Name > b.Name ? -1 : 1; })

    SavelogComponents_file();
}    

function initialiseLogSeverity(ORIGIN = "META") 
{ // This is the first initialisation of logLevels, obtained from logComponents.js
// If desired, it can be overridden by every component (by the OverrideLogLevel function), but initially,this is it.
    myComponents = [];
        const requireUncached = module => {
        delete require.cache[require.resolve(module)];
        return require(module);
    };
    const {logModules} = requireUncached(path.join(StartupPath,'logComponents')); 
    logModules.forEach((metaComponent) =>
        {metaComponent.ORIGIN = ORIGIN;
         metaComponent.Name = metaComponent.logComponent;
        metaComponent.LOG_LEVEL = LOG_LEVEL[metaComponent.logLevel];
        metaComponent.logLevel = metaComponent.logLevel.toUpperCase();
        if (metaComponent.LOG_LEVEL== undefined) 
        {   console.log("Invalid loglevel specified in logComponents.js:",metaComponent.logLevel,";initialising component",metaComponent.Name,"with VERBOSE loglevel");
            metaComponent.LOG_LEVEL = LOG_LEVEL["VERBOSE"];
            metaComponent.logLevel = "VERBOSE";
        }
        if (metaComponent.logComponent.toUpperCase() == "GLOBAL")
        {   metaComponent.Global = true;
            globalSeverity = metaComponent.LOG_LEVEL;
            globalSeverityText = metaComponent.logLevel;
        } 
        else if (metaComponent.FollowGlobal == undefined)
                metaComponent.Global = false;
            else if (metaComponent.FollowGlobal == true)
               metaComponent.Global = true;
            else
                metaComponent.Global = false;
        myComponents.push(metaComponent);
        })
}

function initialiseLogComponents(comp) 
{
    console.log("This function should no longer be used")
    for (var i = comp.length - 1; i >= 0; i--) 
        {comp[i].Global=false;
            myComponents.push(comp[i]);
        }
                   
                
    //myComponents = comp;
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
                if (forceDisplay == SEVERITYFILTER_ENABLED)
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
                    forceDisplay=SEVERITYFILTER_DISABLED;
                    console.log('\x1b[31m',"******** Message type =",message.type,"Reproduction of",produceNrSnapshot," messages done ********" )                   
                }
                produceMessage(message,forceDisplay)
                queuedItems=0;
            }
            else 
                {forceDisplay = SEVERITYFILTER_ENABLED;  // Times over since last severe error was found so switch back to normal operations
                console.log('\x1b[31m',"******** Original severity-filter enabled again")
                }
        }
        if (forceDisplay == SEVERITYFILTER_ENABLED)  // Normal operation 
        {   handleOneMessage(message)  
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
{
    if (message == undefined || message == '')
        return 
    if (message.deviceId == undefined)
        message.deviceId=''
    try {
        console.log('\x1b[4m', (new Date()).toLocaleString('en-GB', { "timeZone": etcTimezone  }) + "\x1b[0m \x1b[36m\x1b[7m" + (message.deviceId ? message.deviceId : "no deviceId") + "\x1b[0m - " + message.component + "\x1b[0m: ", message.type.Color, (typeof message.content == 'object' ? "JSON Object":message.content), '\x1b[0m');
        if (typeof message.content == 'object' || Array.isArray(message.content ))
            metaMessageParamHandler(message.content)
        if (message.params!=undefined)
            metaMessageParamHandler(message.params)
        return 1;  // signal message is written
    }
    catch(err) {console.log("Err in producemessage",err)}

}

function handleOneMessage(message) 
{try {
    let CompIndex = myComponents.findIndex((Comp) => {return Comp.Name == message.component    });
    if (CompIndex == -1 || myComponents[CompIndex].Global)        // following global severity
    {   if (globalSeverity.includes(message.type))
             produceMessage(message)
    }
    else
        if ((CompIndex != -1   && myComponents[CompIndex].LOG_LEVEL.includes(message.type) ))    // Check module specific 
             produceMessage(message)

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