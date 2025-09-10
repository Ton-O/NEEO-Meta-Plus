const logModules = [ 
                    {logComponent: "Global",logLevel:"QUIET"},
                    {logComponent: "meta",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "directoryHelper",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "imageHelper",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "labelHelper",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "metaController",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "metaMessage",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "ProcessingManager",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "sensorHelper",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "sliderHelper",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "switchHelper",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "variablesVault",logLevel:"VERBOSE",FollowGlobal:true},
                    {logComponent: "telnet-client",logLevel:"VERBOSE",FollowGlobal:true}
                   ]
const  produceNrSnapshotWhenError = 200;
module.exports = {logModules,produceNrSnapshotWhenError};