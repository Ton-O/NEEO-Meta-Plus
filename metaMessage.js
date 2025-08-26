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
var etcTimezone = "Utc";
const fs = require('fs');
// See if we can set date&time to our timezone; if not, 
try 
  {let data = fs.readFileSync('/etc/timezone');
  etcTimezone = data.toString().split('\n')[0]
  }
  catch(err) {console.log("Could not read local timeazone, default Utc used",err)}
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

function getLoglevel(theModule )
{

}

function getLoglevels(theModule = undefined)
{
    try {
        let logArray = [];
        logArray.push({Name:"GLOBAL",LOG_LEVEL:'',TextLevel:mySeverityText});

        if (theModule != undefined && theModule.toUpperCase() != "GLOBAL")
        {   let CompIndex =myComponents.findIndex((Comp) => {return Comp.Name == theModule});
            if (CompIndex!= -1)
            {logArray = []; // clear the "ALL" component
                let bb = JSON.stringify(myComponents[CompIndex])    
                logArray.push(JSON.parse(bb));
                logArray[logArray.length-1].LOG_LEVEL=''
            }
            else
                console.log("metaMessage Part I - error; can this happen??")
        }
        else
            {logModules.MetaComponents.forEach((metaComponent) => {
                let CompIndex =myComponents.findIndex((Comp) => {return Comp.Name == metaComponent});
                if (CompIndex!= -1)
                    {let bb = JSON.stringify(myComponents[CompIndex]) // stringify so we get a duplicate instead of inheritance
                    if (myComponents[CompIndex].Global)
                        {bb = JSON.parse(bb);
                        bb.TextLevel = "Following global" 
                        bb = JSON.stringify(bb);
                        }
                    logArray.push(JSON.parse(bb));
                    logArray[logArray.length-1].LOG_LEVEL=''
                    }
                else    
                    {logArray.push({"Name":metaComponent,"TextLevel":mySeverityText});
                    console.log("metaMessage part III; This should not happen")
                    }
            })
        }
    logArray.sort(function(a, b){return a.Name.toUpperCase() > b.Name.toUpperCase() ? 1 : -1; })

        return logArray;
}
catch (err) {console.log(err)}
}

function OverrideLoglevel(NewLogLevelParm,Module,ORIGIN = "META") 
{   let NewLogLevelText = NewLogLevelParm;
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

    let CompIndex;
    let MyMessage = "";
    let GlobalIndex = myComponents.findIndex((Comp) => {return Comp.Name == "GLOBAL"} );
    if (Module != undefined && Module != '') {
        CompIndex = myComponents.findIndex((Comp) => {return Comp.Name == Module    });
        if (CompIndex == GlobalIndex) {     // we have a request to change the global loglevel
            if (NewLogLevelText=="") {
                metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Cannot remove global loglevel "+mySeverityText});
                return -4;
            }
            MyMessage = "MetaCore is overriding global loglevel to "+NewLogLevelText;
            mySeverity = NewLogLevel;mySeverityText = NewLogLevelText;
        }
        else 
        if (CompIndex != -1)
        {    if (NewLogLevelText!="") {   // First check if any supplied new loglevel is valid           
                MyMessage = "Setting log for component "+Module+" to "+NewLogLevelText;
                myComponents[CompIndex].Global = false;
            }
            else {
                if (ORIGIN=="META")
                {   MyMessage = "Setting log for component "+Module+" to follow global "+myComponents[GlobalIndex].TextLevel;
                    myComponents[CompIndex].Global = true;
                    NewLogLevel=myComponents[GlobalIndex].LOG_LEVEL;
                }
                else
                {   metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:"Cannot remove global loglevel for BRAIN"+mySeverityText});
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
        {console.log("We need to code this section metaMessage ##99")
        return 99;
        }

    metaMessage({component:"metaMessage",type:LOG_TYPE.ALWAYS, content:MyMessage});
    myComponents[CompIndex].LOG_LEVEL=NewLogLevel;myComponents[CompIndex].TextLevel=NewLogLevelText
    myComponents.sort(function(a, b){return a.Name > b.Name ? -1 : 1; })
    
}    

function initialiseLogSeverity(sever,ORIGIN = "META") 
{ 
    mySeverity = LOG_LEVEL[sever];mySeverityText = sever;
    if (mySeverity==undefined)
        {console.log("metaMessage --> Unknown Loglevel requested ("+sever+"); 'QUIET' substituted")
        mySeverity = LOG_LEVEL["QUIET"];mySeverityText = "QUIET";
    }
    metaMessage({component:"metaMessage",type:LOG_TYPE.VERBOSE, content:"inited Loglevel "+mySeverityText});
    myComponents.push({"ORIGIN":ORIGIN,Name:"GLOBAL",LOG_LEVEL:mySeverity,TextLevel:mySeverityText});

    logModules.MetaComponents.forEach((metaComponent) =>
        {myComponents.push({"ORIGIN":ORIGIN,Name:metaComponent,LOG_LEVEL:mySeverity,TextLevel:mySeverityText,Global:true});
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
