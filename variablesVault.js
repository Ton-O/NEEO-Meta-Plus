const path = require('path');
const fs = require('fs');
const INTERNALNAMESEPARATOR = '_@_';
const variablePattern = {'pre':'$','post':''};
const meta = require(path.join(__dirname,'meta'));
const { networkInterfaces } = require('os');
const nets = networkInterfaces();
var metaIP = undefined; 


//LOGGING SETUP AND WRAPPING
//Disable the NEEO library console warning.
const { metaMessage, LOG_TYPE } = require("./metaMessage");
console.error = console.info = console.debug = console.warn = console.trace = console.dir = console.dirxml = console.group = console.groupEnd = console.time = console.timeEnd = console.assert = console.profile = function() {};
function metaLog(message) {
  let initMessage = { component:'variablesVault', type:LOG_TYPE.INFO, content:'', deviceId: null };
  let myMessage = {...initMessage, ...message}
  return metaMessage (myMessage);
} 

metaLog({type:LOG_TYPE.FATAL, content:"New observer"});


function toInternalName(name, deviceId) {
  return (deviceId + INTERNALNAMESEPARATOR + name);
}
function getExternalName(name) {
    return name.split(INTERNALNAMESEPARATOR)[1];
}
function getDeviceId(name) {
  return name.split(INTERNALNAMESEPARATOR)[0];
}
function getBuiltNameSeparator(name) {
  return INTERNALNAMESEPARATOR;
}

class variablesVault {
  constructor() {
    this.variables = [];
    this.dataStore;
    var self = this;

    this.initialiseVault= function(filename) {
      return new Promise(function (resolve, reject) {
        if (nets.eth0) { //trying to get the LAN address
          let theNet = nets.eth0.find((net)=>{return (net.family == "IPv4" && !net.internal)});
          if (theNet) {metaIP = theNet.address}
        } 
        if (!metaIP && nets.en0) {//Falback to get the WAN address
          let theNet = nets.en0.find((net)=>{return (net.family == "IPv4" && !net.internal)});  
          if (theNet) {metaIP = theNet.address}
        }
        if (!metaIP && nets.wlan0) {//Falback to get the WAN address
          let theNet = nets.wlan0.find((net)=>{return (net.family == "IPv4" && !net.internal)});  
          if (theNet) {metaIP = theNet.address}
        }
        metaLog({type:LOG_TYPE.WARNING, content:"Meta running on Server with IP : " + metaIP});

        if (filename) {
          self.dataStore = filename;
            //Initialise the variable to datastore value.
          // self.variables = []; can't do that for multiple discovered devices

            self.getDataFromDataStore().then((DS) => {
              if (DS) {
                DS.forEach(element => {
                    self.addVariable(getExternalName(element.name), element.value, getDeviceId(element.name), true);
                });
              }
              resolve();
            });
          }
        else {//nothing to do
          resolve();
        }
      })
    }

    this.initialiseHubVault= function(filename,drivername) {
      //return //new Promise(function (resolve, reject) {

        if (filename) {
          self.dataStore = filename;
            //Initialise the variable to datastore value.
          // self.variables = []; can't do that for multiple discovered devices

            self.getDataFromDataStore(filename).then((DS) => {
              if (DS) {
                DS.forEach(element => {               

                    self.addVariable(getExternalName(element.name), element.value, getDeviceId(element.name), true);
                });
                return 1;

              }
            });
            return "";
          }
        else {//nothing to do
        }
      //})
    }

    this.addVariable = function(name, value, deviceId, persisted) {
      let internalVariableName = toInternalName(name, deviceId);
      persisted = persisted || false;
      if (self.variables.findIndex((elt) => {return elt.name == internalVariableName})<0) {//the variable is new
        self.variables.push({'name':internalVariableName, 'value':value, 'observers': [], 'persisted':persisted});
      }
      else {
        self.writeVariable(name, value, deviceId);
      }
      return true;
    }

    this.addObserver = function(name, theFunction, deviceId, componentRegistering) { // who listen to variable changes.
      try {
        let internalVariableName = toInternalName(name, deviceId);
        metaLog({type:LOG_TYPE.VERBOSE, content:"New observer for : " + internalVariableName, deviceId:deviceId});
        if (name != undefined && name != '' && theFunction != undefined && theFunction) {
          let observersList = self.variables.find(elt => {return elt.name == internalVariableName}).observers; 
          if (observersList.findIndex(func => {return (func.observer == componentRegistering)}) < 0) {//to avoid adding multiple times an oberver
            observersList.push({"observer":componentRegistering, "theFunction": theFunction});
            metaLog({type:LOG_TYPE.VERBOSE, content:"New observer : " + componentRegistering + " " + name, deviceId:deviceId});
          }
        }
      }
      catch (err) {
        metaLog({type:LOG_TYPE.WARNING, content:"It seems that you haven\'t created the variable yet, you can't observe it.", deviceId:deviceId});
        metaLog({type:LOG_TYPE.WARNING, content:err, deviceId:deviceId});
       }
    }

    this.getValue = function(name, deviceId) {
      let internalVariableName = toInternalName(name, deviceId);
      let indexRes = self.variables.findIndex(elt => {return elt.name == internalVariableName});
      if (indexRes<0) {
        return undefined
      } 
      else {
        return self.variables[indexRes].value;
      }
    }

    this.writeVariable = function(name, value, deviceId) {//deviceId necessary as push to components.
      metaLog({type:LOG_TYPE.VERBOSE, content:"Writing in variable: " + name + " value: " + value,deviceId:deviceId});
      let internalVariableName = toInternalName(name, deviceId);
      let foundVar = self.variables.find(elt => {return elt.name == internalVariableName});
      if (foundVar) {
          foundVar.value = value; //Write value here
          foundVar.observers.forEach(element => { //invoke all observers
            element.theFunction(deviceId, foundVar.value);
          });
      }
      else {
        metaLog({type:LOG_TYPE.WARNING, content:"Variable " + name + " with device " + deviceId + " not found. Can't assign value.", deviceId:deviceId});
      }
      //metaLog({type:LOG_TYPE.VERBOSE, content:"Done Writing in variable: " + name + " value: " + value,deviceId:deviceId});

    }

    this.readVariables = function(inputChain, deviceId) { //replace in the input chain, all the variables found of the same deviceId
      let preparedResult = inputChain;
      if (inputChain && typeof inputChain === 'string') {
        preparedResult = preparedResult.replace(/\$NeeoBrainIP/g, meta.neeoBrainIp());metaIP
        preparedResult = preparedResult.replace(/\$MetaIP/g, metaIP);
      }
      
      if (typeof(preparedResult) == 'object') {
        preparedResult = JSON.stringify(preparedResult);
      }

      if (typeof(preparedResult) == 'string') {
        self.variables.forEach(variable => {
          if (variable.name.startsWith(deviceId+getBuiltNameSeparator())) {//we get the full name including the deviceId

            let token = variablePattern.pre + getExternalName(variable.name);//get only the name variable
            while (preparedResult != preparedResult.replace(token, variable.value)) {
              preparedResult = preparedResult.replace(token, variable.value);
            }
          }
        })

      }
      return preparedResult;
    }

    this.retrieveValueFromDataStore = function (name, deviceId) {
      return new Promise(function (resolve, reject) {
      
        let internalVariableName = toInternalName(name, deviceId); 

        self.getDataFromDataStore().then((store) => {
          if (store) {
            let valueIndex = store.findIndex((key) => {return key.name == internalVariableName});
            if (valueIndex>=0) {
              resolve(store[store.findIndex((key) => {return key.name == internalVariableName})].value);
            }
            else {resolve(undefined)}
          } 
          else {resolve(undefined)}
        })
      })
    } 

    this.getDataFromDataStore = function (useThisFilename) {
      return new Promise(function (resolve, reject) {
        try {
          let myFilename = (useThisFilename!=undefined?useThisFilename:self.dataStore)

          if (myFilename) {
            fs.readFile(myFilename, (err, data) => {
              if (data) {
                try {
                  resolve(JSON.parse(data));
                }
                catch (err) {
                  metaLog({type:LOG_TYPE.ERROR, content:'Your Datastore ' + myFilename + ' doesn\'t seems to have a good JSON format'});
                  metaLog({type:LOG_TYPE.ERROR, content:err});
                }
              }
              else {resolve(undefined);}
              if (err) {
                if (err.code == 'ENOENT') {
                  metaLog({type:LOG_TYPE.VERBOSE, content:'This device has no dataStore. '+myFilename});
                }
                else {
                  metaLog({type:LOG_TYPE.ERROR, content:'Error accessing the datastore file.'});
                  metaLog({type:LOG_TYPE.ERROR, content:err});
                }
              }
            })
          }
          else {
            resolve();
          }
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:"Could not access the datastore."});
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
      })
    }

    this.snapshotDataStore = function() {
      return new Promise(function (resolve, reject) {
        if (self.dataStore) {
          fs.unlink(self.dataStore,function(err){
            let tempDS = [];
            self.variables.forEach((varI) => {
              if (varI.persisted) {
                metaLog({type:LOG_TYPE.VERBOSE, content:"Saving inside the datastore : " + {"name":varI.name, "value":varI.value}});
                tempDS.push({"name":varI.name, "value":varI.value})
              }
            });
          fs.writeFile(self.dataStore, JSON.stringify(tempDS), err => {
            if (err) {
              metaLog({type:LOG_TYPE.ERROR, content:"Error writing in the datastore"});
              metaLog({type:LOG_TYPE.ERROR, content:err});
            } else {
              metaLog({type:LOG_TYPE.INFO, content:"Datastore Persisted"});
            }
              resolve();
            })
          }); 
        } 
      })
      
    }
  }  
}
exports.variablesVault = variablesVault;