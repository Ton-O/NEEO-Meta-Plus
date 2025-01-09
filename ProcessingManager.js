const { exec } = require("child_process");
const xpath = require('xpath');
const path = require('path');
const http = require('http.min');
const { JSONPath } = require ('jsonpath-plus');
const io = require('socket.io-client');
const rpc = require('json-rpc2');
const lodash = require('lodash');
var xml2js = require('xml2js');
const { parserXMLString, xmldom } = require("./metaController");
const { variablesVault } = require(path.join(__dirname,'variablesVault'));
const got = require('got');
const Net = require('net');
//const {Telnet} = require('telnet-client'); 
const {Telnet} = require(path.join(__dirname,'/Telnet-meta')); 
const Promise = require('bluebird');
const mqtt = require('mqtt');
const util = require('util');

const CONSTANTS =  {KEY_DELAY: 100,
  CONNECTION_STATE: {
    DISCONNECTED: 0,
    CONNECTING: 1,
    AUTHENTICATING: 2,
    AUTHENTICATED: 3,
    CONNECTED: 4
  }}

const settings = require(path.join(__dirname,'settings'));
//const { connect } = require("socket.io-client");
var socket = "";
var mqttClient;
var  MyMQTTTopic = [""];
var MyMQTTMessage = [""];

const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');

const wol = require('wol');
const { connect } = require("socket.io-client");
const meta = require(path.join(__dirname,'meta'));
//LOGGING SETUP AND WRAPPING
//Disable the NEEO library console warning.
const { metaMessage, LOG_TYPE,OverrideLoglevel,getLoglevels } = require("./metaMessage");
const { startsWith, slice } = require("lodash");
//const { retry } = require("statuses");
const { MDNSServiceDiscovery } = require('tinkerhub-mdns');
const find = require('local-devices');
//const { Console } = require("console");


console.error = console.info = console.debug = console.warn = console.trace = console.dir = console.dirxml = console.group = console.groupEnd = console.time = console.timeEnd = console.assert = console.profile = function() {};
function metaLog(message) {
  let initMessage = { component:'processingManager', type:LOG_TYPE.INFO, content:'', deviceId: null };
  let myMessage = {...initMessage, ...message}
  return metaMessage (myMessage); 
} 

//STRATEGY FOR THE COMMAND TO BE USED (HTTPGET, post, websocket, ...) New processor to be added here. This strategy mix both transport and data format (json, soap, ...)
class ProcessingManager {
  constructor() {

    this._processor = null;
  };
  set processor(processor) {
    this._processor = processor;
  };
  get processor() {

    return this._processor;
  }
  initiate(connection) {
    return new Promise((resolve, reject) => {
      this._processor.initiate(connection)
        .then((result) => {  resolve(result); })
        .catch((err) => { reject(err)});
    });
  }
  process(params) {
    return new Promise((resolve, reject) => {
      this._processor.process(params)
        .then((result) => { resolve(result); })
        .catch((err) => reject(err));
    });
  }
  query(params) {
    return this._processor.query(params);
  }
  startListen(params, deviceId) {
    return this._processor.startListen(params, deviceId);
  }
  stopListen(listen, connection) {
    return this._processor.stopListen(listen, connection);
  }
  wrapUp(connection) {

      return new Promise((resolve, reject) => {
        if (connection == undefined || connection.connections == undefined || connection.connections.length == 0) { 
          resolve("No connections");
        }
        else {
            this._processor.wrapUp(connection)
          .then((result) => { resolve(result); })
          .catch((err) => reject(err));
      }
    });
  }
}
exports.ProcessingManager = ProcessingManager;

class httprestProcessor {
  constructor() {
  };
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); };
        let myRestFunction;
        if (params.command.verb == 'post') {myRestFunction = got.post};
        if (params.command.verb == 'put') {myRestFunction = got.put};
        if (params.command.verb == 'get') {myRestFunction = got};
        myRestFunction(params.command.call, {json:params.command.message,headers:params.command.headers})
        .then((response) => {
          if ((response.headers["content-type"] && response.headers["content-type"] == "text/xml") || response.body.startsWith('<'))
          {
            xml2js.parseStringPromise(response.body)
            .then((result) => {
              metaLog({type:LOG_TYPE.VERBOSE, content:'XML-conversion'});
              metaLog({type:LOG_TYPE.VERBOSE, content:result});
              resolve(result);
            })
            .catch((err) => {
              metaLog({type:LOG_TYPE.ERROR, content:err});
            })
          }
          else {
            metaLog({type:LOG_TYPE.VERBOSE, content:'HTTP process response'});
            metaLog({type:LOG_TYPE.VERBOSE, content:response.body});
            resolve(response.body);
          }
        })
        .catch((err) => {
            metaLog({type:LOG_TYPE.ERROR, content:'Request didn\'t work : '});
            metaLog({type:LOG_TYPE.ERROR, content:params});
            metaLog({type:LOG_TYPE.ERROR, content:err});
        });
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:'Meta Error during the rest command processing'});
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
     });
    }
    query(params) {
      return new Promise(function (resolve, reject) {
        if (params.query) {
          try {
            metaLog({type:LOG_TYPE.VERBOSE, content:'Rest command query processing, parameters, result JSON path: '+ JSONPath(params.query, params.data)});
            if (typeof (params.data) == 'string') { params.data = JSON.parse(params.data); }
            resolve(JSONPath(params.query, params.data));
          }
          catch (err) {
            metaLog({type:LOG_TYPE.ERROR, content:'HTTP Error ' + err + ' in JSONPATH ' + params.query + ' processing of :' + params.data});
          }
        }
        else { resolve(params.data); }
      });
    }
    startListen(params, deviceId) {
      return new Promise(function (resolve, reject) {
        let previousResult = '';
        clearInterval(params.listener.timer);
        params.listener.timer = setInterval(() => {
          try {
            if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); }
            let myRestFunction;
            if (params.command.verb == 'post') {myRestFunction = got.post};
            if (params.command.verb == 'put') {myRestFunction = got.put};
            if (params.command.verb == 'get') {myRestFunction = got};
            metaLog({type:LOG_TYPE.DEBUG, content:"Intenting rest call", deviceId});
            metaLog({type:LOG_TYPE.DEBUG, content:params.command, deviceId});
            myRestFunction(params.command.call, {json:params.command.message,headers:params.command.headers})
            .then((response) => {
              if ((params.command.duplicates ) || (response.body != previousResult)) {
                previousResult = response.body; 
                metaLog({type:LOG_TYPE.DEBUG, content:"Response on rest call "+response.body, deviceId});
                let TheResponse = response.body;
                if ((response.headers["content-type"] && response.headers["content-type"] == "text/xml") || response.body.startsWith('<')) {
                    xml2js.parseStringPromise(response.body)
                      .then((result) => {
                        TheResponse = result;
                        metaLog({type:LOG_TYPE.DEBUG, content:"XML-Parsed: "+result, deviceId});
                      })
                      .catch((err) => {
                      metaLog({type:LOG_TYPE.ERROR, content:err});
                      })
                }
                params._listenCallback(TheResponse, params.listener, deviceId);
              }
              else
                  metaLog({type:LOG_TYPE.DEBUG, content:"No change in response on rest call", deviceId});
              resolve("");
              })
            .catch((err) => {
                metaLog({type:LOG_TYPE.ERROR, content:'Request didn\'t work : '});
                metaLog({type:LOG_TYPE.ERROR, content:err});
                resolve('');
            });
          }
          catch (err) {
            metaLog({type:LOG_TYPE.ERROR, content:'Meta Error during the rest command processing'});
            metaLog({type:LOG_TYPE.ERROR, content:err});
            resolve('');
          }
        }, (params.listener.pooltime ? params.listener.pooltime : 1000));
        if (params.listener.poolduration && (params.listener.poolduration != '')) {
          setTimeout(() => {
            clearInterval(params.listener.timer);
          }, params.listener.poolduration);
        }
      });
    }
  stopListen(params) {
    clearInterval(params.timer);
  }
}
exports.httprestProcessor = httprestProcessor;

class httpgetProcessor {
  constructor() {
  };
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      try {
        got(params.command)
          .then(function (result) {
            resolve(result.body);
          })
          .catch((err) => {
            metaLog({type:LOG_TYPE.ERROR, content:err});
            resolve();
          });
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:err});
        resolve();
      }
    })
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      if (params.query) {
        try {
          if (typeof (params.data) == 'string') { params.data = JSON.parse(params.data); };
          resolve(JSONPath(params.query, params.data));
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
      }
      else { resolve(params.data); }
    });
  }
  startListen(params, deviceId) {
    return new Promise(function (resolve, reject) {
      let previousResult = '';
      clearInterval(params.listener.timer);
      params.listener.islistening == true;
      params.listener.timer = setInterval(() => {
        metaLog({type:LOG_TYPE.VERBOSE, content:"listening device " + deviceId});
        if (params.command == "") {resolve("")}; //for 
        http(params.command)
          .then(function (result) {
            if (result.data != previousResult) {
              previousResult = result.data;
              metaLog({type:LOG_TYPE.VERBOSE, content: result.data, deviceId});
              params._listenCallback(result.data, params.listener, deviceId);
            }
            resolve('');
          })
          .catch((err) => { 
            metaLog({type:LOG_TYPE.ERROR, content:err});
           });
        }, (params.listener.pooltime ? params.listener.pooltime : 1000));
        if (params.listener.poolduration && (params.listener.poolduration != '')) {
          setTimeout(() => {
            clearInterval(params.listener.timer);
            params.listener.islistening == false;
          }, params.listener.poolduration);
        }
      });
    }
    stopListen(listener) {
      listener.islistening == false;
      clearInterval(listener.timer);
    }
}
exports.httpgetProcessor = httpgetProcessor;

class wolProcessor {
  constructor() {
  };
  initiate() {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      try {
        wol.wake(params.command, function(err, res){
          if (err) {
            resolve({'error':err})
          }
          else {
            resolve({'result':res})
          }
        });
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:err});
        resolve({'error':err});
      }
    })
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      if (params.query) {
        try {
          if (typeof (params.data) == 'string') { params.data = JSON.parse(params.data); };
          resolve(JSONPath(params.query, params.data));
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
      }
      else { resolve(params.data); }
    });
  }
  startListen(params, deviceId) {
    return new Promise(function (resolve, reject) {
      resolve();
    })  
  }
  stopListen(listener) {
  }
  wrapUp(connection) {
    return new Promise(function (resolve, reject) {
      resolve(connection);
    });
  }
}
exports.wolProcessor = wolProcessor;

class NetProcessor {
  constructor() {
    this.listenerConnections = [];
  }
  initiate(connection) {
    this.listenerConnections = [];
    return new Promise(function (resolve, reject) {      
      resolve();
    });

  }
  process(params) {
    var _this = this;
    return new Promise(function (resolve, reject) {
      try {
        if (typeof (params) == 'string') params = JSON.parse(params); 
        if (params.connection == undefined) params.connection = {};
        if (params.connection.connections == undefined) params.connection.connections = [];
      }
      catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"connections not okay:" +err})}
      try {
        params.command = JSON.parse(params.command.replace(/[\r]?[\n]/g, '\\n'))
      }
      catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Problem parsing params.command: "+err})}
      let connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == params.command.call    });

      if  (connectionIndex < 0)  //Not defined yet, create connection 
        {    metaLog({type:LOG_TYPE.ERROR, content:"Need to have a NET-listener first "+params.command.call});
            reject('');
        }
      else
        {
        if (typeof (params.command) == 'string') params.command = JSON.parse(params.command.replace(/[\r]?[\n]/g, '\\n')); 
        if (_this.listenerConnections[connectionIndex]) {
          let MyCon = _this.listenerConnections[connectionIndex];
          if (params.command.message) {
            try {
            MyCon.connector.write(params.command.message);
            }
            catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"erorr in write: "+err})}
          }
        }
        resolve('');
      }
    });
    
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (params.query) {
          resolve(JSONPath(params.query, params.data));
        }
        else {
          resolve(params.data);
        }
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  }
  startListen(params, deviceId) {
    var _this = this;
    metaLog({type:LOG_TYPE.VERBOSE, content:"Starting listener connection with net - " + params.command.call});

    return new Promise(function (resolve, reject) {

    try {
      if (typeof (params) == 'string') 
          params = JSON.parse(params); 
      if (params.connection == undefined) params.connection = {};
      if (params.connection.connections == undefined) params.connection.connections = [];
    }
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"connections not okay:" +err})}
    params.command = JSON.parse(params.command.replace(/[\r]?[\n]/g, '\\n'))
    _this.connectionIndex = params.connection.connections.findIndex((con) => {return con.descriptor == params.command.call    });
  if  (_this.connectionIndex < 0)  //Not defined yet, create connection 
      {metaLog({type:LOG_TYPE.VERBOSE, content:"Setting up listener connection with net - " + params.command.call});
      try {
        let netDevice = new Net.Socket();
        netDevice.on('data', (result) => { 
          let Myresult=result.toString('utf8');
          Myresult=Myresult.replace(/\'/g, '"');
          let JSONMyresult=JSON.parse(Myresult);
          params._listenCallback(JSONMyresult, params.listener, deviceId);
        });

		  netDevice.on('error', function(err) {
				metaLog({type:LOG_TYPE.ERROR, content:"Error within net connection - " + params.command.call + " " + err});
      })

      netDevice.on('connect', function(err) {
				metaLog({type:LOG_TYPE.VERBOSE, content:"Net connection made - " + params.command.call + " " + err});
      })
		
		
		  netDevice.on('close', function() {
				metaLog({type:LOG_TYPE.VERBOSE, content:"Connection closed. "});
      })    
      netDevice.connect(1255,params.command.call);
      _this.listenerConnections.push({"descriptor": params.command.call, "connector": netDevice});
        _this.connectionIndex = params.connection.connections.length - 1;
      }
      catch (err) {metaLog({type:LOG_TYPE.ERROR, content:'Error setting up NET-connection ' + err});}
      }
      else  
      metaLog({type:LOG_TYPE.VERBOSE, content:"Reusing existing listener connection with net - " + params.command.call});
      resolve('');
    });
  }
  stopListen(connection) {
    if (connection.connector != "" && connection.connector != undefined) {
      connection.toConnect = false;
      connection.connector.close();
    }
  }
  wrapUp(connection) {
    return new Promise(function (resolve, reject) {
      if (connection.connector != "" && connection.connector != undefined) {
        connection.toConnect = false;
        connection.connector.close();
      }
      resolve(connection);
    });
  }
}
exports.NetProcessor = NetProcessor;


class socketIOProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      try {
        connection.toConnect = true;
        if (connection.connector != "" && connection.connector != undefined) {
          connection.connector.close();
        } //to avoid opening multiple
        
        connection.connector = io(connection.descriptor.startsWith('http')?connection.descriptor:"http://"+connection.descriptor, { jsonp: false, transports: ['websocket'] });
        connection.connector.on("connect", () => {
          metaLog({type:LOG_TYPE.VERBOSE, content:"socketIO connected on " + connection.descriptor});
        });
        connection.connector.on("disconnect", () => {
          metaLog({type:LOG_TYPE.WARNING, content:"socketIO disconnected from " + connection.descriptor});
          if (connection.toConnect) {
            connection.connector.connect();
          }
        });
        connection.connector.on("connect_error", (err) => {
          metaLog({type:LOG_TYPE.ERROR, content:"Connection error with socketIO - " + connection.descriptor});
          metaLog({type:LOG_TYPE.ERROR, content:err});
        });
        connection.connector.connect();
        //connection.connector.connect();
        resolve(connection);
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:'Error while intenting connection to the target device.'});
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    }); //to avoid opening multiple
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); }
      if (params.command.call) {
        params.connection.connector.emit(params.command.call, params.command.message);
        resolve('');
      }
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (params.query) {
          resolve(JSONPath(params.query, params.data));
        }
        else {
          resolve(params.data);
        }
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  }
  startListen(params, deviceId) {
    return new Promise(function (resolve, reject) {
      params.connection.connector.on(params.command, (result) => { params._listenCallback(result, params.listener, deviceId); });
      resolve('');
    });
  }
  stopListen(connection) {
    if (connection.connector != "" && connection.connector != undefined) {
      connection.toConnect = false;
      connection.connector.close();
    }
  }
  wrapUp(connection) {
    return new Promise(function (resolve, reject) {
      if (connection.connector != "" && connection.connector != undefined) {
        connection.toConnect = false;
        connection.connector.close();
      }
      resolve(connection);
    });
  }
}
exports.socketIOProcessor = socketIOProcessor;

class webSocketProcessor {
  constructor() {
    this.listenerConnections = [];
  }


  initiate() {
    this.listenerConnections = [];
    //this.readyState = Websocket.CLOSED;
    return new Promise(function (resolve, reject) {
      
      resolve();
    });
  }
  process(params) {
    var _this = this;
    return new Promise(function (resolve, reject) {
      metaLog({type:LOG_TYPE.VERBOSE, content:'Entering the websocket processor'});
      if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); };
      metaLog({type:LOG_TYPE.DEBUG, content:params.command});
      if (!params.connection) {params.connection = {}}
      if  (!params.connection.connections) { params.connection.connections = []};
      let connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == params.command.connection});
      metaLog({type:LOG_TYPE.VERBOSE, content:'Connection Index:' + connectionIndex});
      if  (connectionIndex < 0) { //checking if connection exist
        metaLog({type:LOG_TYPE.WARNING, content:'You need to create a listener to have a proper websocket connection.'});
        resolve({'readystate':-1});
      }
      else if (params.command.message) {
        if (typeof (params.command.message) != 'string') {params.command.message = JSON.stringify(params.command.message)}
        try {
          params.command.message = params.command.message.replace(/<__n__>/g, '\n');
          metaLog({type:LOG_TYPE.VERBOSE, content:'Emitting: ' + params.command.message});
          if (_this.listenerConnections[connectionIndex]) {
            let theConnection = _this.listenerConnections[connectionIndex];
            if (theConnection.connector && theConnection.connector.readyState != 1) {
            metaLog({type:LOG_TYPE.WARNING, content:"Waiting for WebSocket connection to be done"});
              setTimeout(() => {
                if (params.connection.connections) {
                  connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == params.command.connection});
                  theConnection = _this.listenerConnections[connectionIndex];
                  metaLog({type:LOG_TYPE.WARNING, content:"Retrying to send the message"});
                  if (theConnection && theConnection.connector && theConnection.connector.readyState == 1) {
                    theConnection.connector.send(params.command.message)
                  }
                  else
                    metaLog({type:LOG_TYPE.ERROR, content:"Could not send the websocket message"});
                  if (theConnection && theConnection.connector && theConnection.connector.readyState) {
                    resolve({'readystate':theConnection.connector.readyState});
                  }
                  else {resolve({'readystate':-1});}
                }
                else {resolve({'readystate':-1});}
              }, 5000)
            }
            else {theConnection.connector.send(params.command.message);
              resolve({'readystate':theConnection.connector.readyState});
            }
          }
        }
        catch (err) {
          metaLog({type:LOG_TYPE.WARNING, content:'Error while sending message to the target device.'});
          metaLog({type:LOG_TYPE.WARNING, content:err});
          resolve({'readystate':undefined, 'error':err});
        }
      }
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (params.query) {
          metaLog({type:LOG_TYPE.DEBUG, content:"Querying websocket"})
          metaLog({type:LOG_TYPE.DEBUG, content:params});
          metaLog({type:LOG_TYPE.DEBUG, content:JSONPath(params.query, params.data)});
          resolve(JSONPath(params.query, params.data));
        }
        else {
          resolve(params.data);
        }
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:err});
        resolve('');
      }
    });
  }
  HandleError(error) {
    metaLog({type:LOG_TYPE.WARNING, content:'Error event called on the webSocket.'});
    metaLog({type:LOG_TYPE.ERROR, content:"Error.message "+error.message})
  }

  HandleOpen(msg) {
    metaLog({type:LOG_TYPE.WARNING, content:'open event called on the webSocket.'});
    metaLog({type:LOG_TYPE.VERBOSE, content:msg});
  }



 MyReceive(result,params,connectionIndex,deviceId)  { 
    try{
    metaLog({type:LOG_TYPE.DEBUG, content:"Receiving message on websocket listener " + this.listenerConnections[connectionIndex].ListenerName})
    }
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"error while handle receiving a message in websocket" +err})
            metaLog({type:LOG_TYPE.ERROR, content:"params",result})
          }
    if (result.data != '') {
      metaLog({type:LOG_TYPE.DEBUG, content:result.data })
      params._listenCallback(JSON.parse(result.data), params.listener, deviceId); 
    }
    else
      metaLog({type:LOG_TYPE.DEBUG, content:"Empty message " })

  };

  startListen(params, deviceId) {
    const options = {
      WebSocket: WebSocket, // custom WebSocket constructor
      connectionTimeout: 1000,
      maxRetries: 10
  };
  
    var _this = this;


    return new Promise(function (resolve, reject) {
      try {
        if (!params.connection) {params.connection = {}}
        if  (!params.connection.connections) { params.connection.connections = []};
        if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); }
        metaLog({type:LOG_TYPE.VERBOSE, content:'Preparing to start WebSocket listener'});
        metaLog({type:LOG_TYPE.DEBUG, content:params});
        if (params.command.connection) {
          let connectionIndex = _this.listenerConnections.findIndex((con)=> {return con.descriptor == params.command.connection && con.ListenerName == params.listener.name});
          try {
            if (connectionIndex<0) {
              metaLog({type:LOG_TYPE.DEBUG, content:"New connection "+params.command.connection})
              let connector = new ReconnectingWebSocket(params.command.connection , [], options);
              _this.listenerConnections.push({"command": JSON.stringify(params.command.message),"descriptor": params.command.connection,"deviceId":deviceId,"ListenerName":params.listener.name,"connector": connector});
              connectionIndex = _this.listenerConnections.length - 1;
            }
            else  
              if (_this.listenerConnections[connectionIndex] && _this.listenerConnections[connectionIndex].connector) {
                if ( _this.listenerConnections[connectionIndex].connector.readyState == 0) 
                  metaLog({type:LOG_TYPE.WARNING, content:"We have an existing connection, but it is not opened yet"})
                else
                if ( _this.listenerConnections[connectionIndex].connector.readyState == 1) 
                  metaLog({type:LOG_TYPE.DEBUG, content:"We have an existing connection, and it is already open"})
              else
                if ( _this.listenerConnections[connectionIndex].connector.readyState == 3) {
                  metaLog({type:LOG_TYPE.WARNING, content:"We have an existing connection, but it is in an intermediate state; closing it"})
                  try {
                    _this.listenerConnections[connectionIndex].connector.terminate();  
                  }
                  catch (err) {
                    metaLog({type:LOG_TYPE.ERROR, content:'Disposing unused socket failed.'});
                  }   
                  metaLog({type:LOG_TYPE.VERBOSE, content:'Opening new socket.'});
                  _this.listenerConnections[connectionIndex].connector = new ReconnectingWebSocket(params.command.connection);
                }
              }
            if (_this.listenerConnections[connectionIndex] && _this.listenerConnections[connectionIndex].connector) {
              _this.listenerConnections[connectionIndex].connector.addEventListener( 'error', (err) => {_this.HandleError;      resolve('')}
              )
              _this.listenerConnections[connectionIndex].connector.addEventListener('close', (result) => { 
                if (params.connection.connections) {
                  metaLog({type:LOG_TYPE.VERBOSE, content:'Close event called on the webSocket with connection index:' + connectionIndex});
                  clearInterval(params.listener.timer);   // remove old timer
                  metaLog({type:LOG_TYPE.VERBOSE, content:'Removed timer from webSocket with connection index:' + connectionIndex});
                }
              });
              _this.listenerConnections[connectionIndex].connector.addEventListener('open', (result) => { 
                try {
                  metaLog({type:LOG_TYPE.VERBOSE, content:'Connection webSocket open.' });
                  metaLog({type:LOG_TYPE.VERBOSE, content:'New Connection Index:' + connectionIndex});
                  _this.MessageHandler = (event) => _this.MyReceive(event, params,connectionIndex,deviceId); 
                  _this.listenerConnections[connectionIndex].connector.addEventListener("message", _this.MessageHandler);
                  if (params.command.message!=undefined&&params.command.message!="") {
                      try {
                        _this.listenerConnections[connectionIndex].connector.send(_this.listenerConnections[connectionIndex].command.replace(/<__n__>/g, '\n'));
                      }
                      catch(err) {metaLog({type:LOG_TYPE.ERROR, content:"Error sending websocket command:"+ err});
                                 metaLog({type:LOG_TYPE.ERROR, content:_this.listenerConnections[connectionIndex].command})
                      }
                      return new Promise(function (resolve, reject) {
                      params.listener.timer = setInterval(() => {
                        try {
                          _this.listenerConnections[connectionIndex].connector.send(_this.listenerConnections[connectionIndex].command.replace(/<__n__>/g, '\n'));
                        }
                        catch(err) {metaLog({type:LOG_TYPE.ERROR, content:"Error sending websocket command:"+err});
                                    metaLog({type:LOG_TYPE.ERROR, content:_this.listenerConnections[connectionIndex].command})
                                  }
                      resolve(params.command.message)
                    }, (params.listener.pooltime ? params.listener.pooltime : 1000));
                  });
                }
                }
                catch (err) {
                  metaLog({type:LOG_TYPE.ERROR, content:'Error while intenting-2 connection to the target device.'});
                  metaLog({type:LOG_TYPE.ERROR, content:err});
                  reject('');
                  return;
                }
              });

              resolve('');
            }
          }
          catch (err) {
            metaLog({type:LOG_TYPE.ERROR, content:'Error while intenting-2 connection to the target device.'});
            metaLog({type:LOG_TYPE.ERROR, content:err});
            reject('');
            return;
          }
        }   
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:'Error with listener configuration.'});
        metaLog({type:LOG_TYPE.ERROR, content:err});
        reject('');
        return;
      }

    });
  }
  stopListen(listener) {
    var _this = this;
    metaLog({type:LOG_TYPE.VERBOSE, content:"Requesting Websocket listener "+listener.name+" to stop"}); 
    var connectionIndex = _this.listenerConnections.findIndex((con) => {
      return (con.descriptor == JSON.parse(listener.command).connection && con.ListenerName == listener.name && con.deviceId == listener.deviceId)});
    if (connectionIndex != -1) {
      try {
        metaLog({type:LOG_TYPE.VERBOSE,content: "Webscocket: nr"  + connectionIndex})
        this.listenerConnections[connectionIndex].connector.close();  
      }
      catch (err) {metaLog({type:LOG_TYPE.VERBOSE, content:"Closing websocket connection got error "+err});
      this.listenerConnections[connectionIndex].connector.removeEventListener('message', this.MessageHandler);
      metaLog({type:LOG_TYPE.VERBOSE, content:"Websocket listener "+listener.name+" removed"}); 
      }
    }
    else
      metaLog({type:LOG_TYPE.ERROR, content:"Removal of websocket listener "+listener.name+" failed; it does not exist"}); 
  }

  wrapUp(connection) {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Wrapup WebSocket Connection " + connection.name})

    var _this = this;
    setTimeout(() => {
      return new Promise(function (resolve, reject) {
        if (connection) {metaLog({type:LOG_TYPE.VERBOSE, content:"actually wrapup starting now"});
          for (let i =0;i<_this.listenerConnections.length;i++)
            if (_this.listenerConnections[i].deviceId == connection.deviceId) {
              metaLog({type:LOG_TYPE.VERBOSE, content:'WebSocket-connection wrapUp: '+_this.listenerConnections[i].descriptor,"deviceId":connection.deviceId });
            //connection.connections[connection.connections.length-1]?connection.connections[connection.connections.length-1].terminate():"";
            _this.listenerConnections.splice(i,1)
          }
        }
        resolve();
    })
    
    }, 2700);
  }
}
exports.webSocketProcessor = webSocketProcessor;

class jsontcpProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      //if (connection.connector == "" || connection.connector == undefined) {
      rpc.SocketConnection.$include({
        write: function ($super, data) {
          return $super(data + "\r\n");
        },
        call: function ($super, method, params, callback) {
          if (!lodash.isArray(params) && !lodash.isObject(params)) {
            params = [params];
          }
          `A`;
          var id = null;
          if (lodash.isFunction(callback)) {
            id = ++this.latestId;
            this.callbacks[id] = callback;
          }

          var data = JSON.stringify({ jsonrpc: '2.0', method: method, params: params, id: id });
          this.write(data);
        }
      });
      let mySocket = rpc.Client.$create(1705, connection.descriptor, null, null);
      mySocket.connectSocket(function (err, conn) {
        if (err) {
          metaLog({type:LOG_TYPE.ERROR, content:'Error connecting to the target device.'});
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
        if (conn) {
          connection.connector = conn; 
          metaLog({type:LOG_TYPE.VERBOSE, content:'Connection to the JSONTCP device successful'});
          resolve(connection);
        }
      });
      //} //to avoid opening multiple
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); }

      if (params.command.call) {
        params.connection.connector.call(params.command.call, params.command.message, function (err, result) {
          if (err) { 
            metaLog({type:LOG_TYPE.ERROR, content:err});
          }
          resolve(result);
        });

      }
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (params.query) {
          resolve(JSONPath(params.query, params.data));
        }
        else {
          resolve(params.data);
        }
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  }
  startListen(params, deviceId) {
    return new Promise(function (resolve, reject) {
      params.socketIO.on(params.command, (result) => { params._listenCallback(result, params.listener, deviceId); });
      resolve('');
    });
  }
  stopListen(params) {
    metaLog({type:LOG_TYPE.VERBOSE, content:'Stop listening to the device.'});
  }
}
exports.jsontcpProcessor = jsontcpProcessor;
function convertXMLTable2JSON(TableXML, indent, TableJSON) {
  return new Promise(function (resolve, reject) {
    parserXMLString.parseStringPromise(TableXML[indent]).then((result) => {
      if (result) {
        TableJSON.push(result);
        indent = indent + 1;
        if (indent < TableXML.length) {
          resolve(convertXMLTable2JSON(TableXML, indent, TableJSON));
        }
        else {
          resolve(TableJSON);
        }

      }
      else {
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  });
}
class httpgetSoapProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }  
  process(params) {
    return new Promise(function (resolve, reject) {
      http(params.command)
        .then(function (result) {
          resolve(result.data);
        })
        .catch((err) => { reject(err); });
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      if (params.query) {
        try {
          var doc = new xmldom().parseFromString(params.data);
          var nodes = xpath.select(params.query, doc);
          let JSonResult = [];
          convertXMLTable2JSON(nodes, 0, JSonResult).then((result) => {
            resolve(result);
          });
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
      }
      else { resolve(params.data); }
    });
  }
  listen(params) {
    return '';
  }
}
exports.httpgetSoapProcessor = httpgetSoapProcessor;
class httppostProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); }
        if (params.command.call) {
          http.post(params.command.call, params.command.message)
            .then(function (result) {
              resolve(result.data);
            })
            .catch((err) => {  metaLog({type:LOG_TYPE.ERROR, content:err});reject(err); });
        }
        else { reject('no post command provided or improper format'); }
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:"Error during Post command processing : " + params.command.call + " - " + params.command.message});
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }      
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        resolve(JSONPath(params.query, JSON.parse(params.data)));
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  }
  listen(params) {
    return '';
  }
}
exports.httppostProcessor = httppostProcessor;
class staticProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      resolve(params.command);
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (params.query != undefined  && params.query != '') {
          resolve(JSONPath(params.query, JSON.parse(params.data)));
        }
        else {
          if (params.data != undefined) {
            if (typeof(params.data) == string){
              resolve(JSON.parse(params.data));
            }
            else 
            {
              resolve(params.data)
            }
          }
          else { resolve(); }
        }
      }
      catch {
        metaLog({type:LOG_TYPE.WARNING, content:'Value is not JSON after processed by query: ' + params.query + ' returning as text:' + params.data});
        resolve(params.data)
      }
    });
  }
  startListen(params, deviceId) {
    return new Promise(function (resolve, reject) {
      clearInterval(params.listener.timer);
      params.listener.timer = setInterval(() => {
        params._listenCallback(params.command, params.listener, deviceId);
        resolve(params.command)
      }, (params.listener.pooltime ? params.listener.pooltime : 1000));
      if (params.listener.poolduration && (params.listener.poolduration != '')) {
        setTimeout(() => {
          clearInterval(params.listener.timer);
        }, params.listener.poolduration);
      }
    });
  }
  stopListen(params) {
    clearInterval(params.timer);
  }
}
exports.staticProcessor = staticProcessor;
class mDNSProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      resolve(JSON.stringify(meta.localDevices));
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        if (params.query != undefined  && params.query != '') {
          resolve(JSONPath(params.query, JSON.parse(params.data)));
        }
        else {
          if (params.data != undefined) {
            if (typeof(params.data) == string){
              resolve(JSON.parse(params.data));
            }
            else 
            {
              resolve(params.data)
            }
          }
          else { resolve(); }
        }
      }
      catch {
        metaLog({type:LOG_TYPE.WARNING, content:'Value is not JSON after processed by query: ' + params.query + ' returning as text:' + params.data});
        resolve(params.data)
      }
    });
  }
  startListen(params, deviceId) {
    return new Promise(function (resolve, reject) {
      clearInterval(params.listener.timer);
      params.listener.timer = setInterval(() => {
        params._listenCallback(params.command, params.listener, deviceId);
        resolve(params.command)
      }, (params.listener.pooltime ? params.listener.pooltime : 1000));
      if (params.listener.poolduration && (params.listener.poolduration != '')) 
        {setTimeout(() => {
          clearInterval(params.listener.timer);
        }, params.listener.poolduration);
      }
    });
  }
  stopListen(params) {
    clearInterval(params.timer);
  }
}
exports.mDNSProcessor = mDNSProcessor;

class dnssdProcessor {
  initiate(connection) {

    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      try {
      var Services = [];
      const discovery = new MDNSServiceDiscovery({
        type: params.command // type: 'xbmc-jsonrpc-h' //
      });
      // Listen for services as they become available

      discovery.onAvailable(service => {
          try 
            {service.addresses.forEach((HostAndPort) => {
              if (!HostAndPort.host.includes(":")) {
                find(HostAndPort.host).then(MACaddr => {
                    if (MACaddr) 
                      HostAndPort.mac = MACaddr.mac
                    else
                      HostAndPort.mac = "?"
                    let serviceIndex = Services.findIndex((theService) => {
                      return theService.id == service.id})
                    if (serviceIndex<0) {
                      Services.push(service);
                    }
                  }
                )
                }
              }
            )}
            catch(err) {
              metaLog({type:LOG_TYPE.ERROR, content:"Error in push process " + err });
            }
      });

      setTimeout(() => {
        try {
          discovery.destroy();
        }
        catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Error in dnssd timer process " + err });} 

      resolve(Services)
      }, 4000);

    discovery.search();
    }
    catch(err) {metaLog({type:LOG_TYPE.ERROR, content:"Error in dnssd process " + err });}
    });
  }
  query(params) {
    try {
      if (typeof(params.data) != "string"){
        for (let index = 0; index < params.data.length; index++) {
          let bbx = params.data[index]
          if (bbx.type = "googlecast") {
            bbx.fn = bbx.data.get('fn')
          }
        }
      }
    }
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Query=error:"+err})}
    return new Promise(function (resolve, reject) {
      try {
        if (params.query != undefined  && params.query != '') {
          try {
          if (typeof(params) == 'string') {
            metaLog({type:LOG_TYPE.DEBUG, content:'Query resolve string'})
            resolve(JSONPath(params.query, JSON.parse(params.data)));
          }
          else {
              resolve(JSONPath(params.query, params.data));
          } 
        }
        catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Err handing "+err})} 
        }
        else {
          if (params.data != undefined) {
            if (typeof(params.data) == string)
                  resolve(JSON.parse(params.data));
            else 
              resolve(params.data)
          }
          else { 
            metaLog({type:LOG_TYPE.ERROR, content:"Not sure what we're resolving, data received is undefined"})
            resolve(''); }
        }
      }
      catch { (err)
        metaLog({type:LOG_TYPE.ERROR, content:err})
        metaLog({type:LOG_TYPE.WARNING, content:'Value is not JSON after processed by query: ' + params.query + ' returning as text:' + params.data});
        resolve(params.data)
      }
    });
  }
  startListen(params, deviceId) {

    return new Promise(function (resolve, reject) {
      clearInterval(params.listener.timer);
      params.listener.timer = setInterval(() => {
        params._listenCallback(params.command, params.listener, deviceId);
        resolve(params.command)
      }, (params.listener.pooltime ? params.listener.pooltime : 1000));
      if (params.listener.poolduration && (params.listener.poolduration != '')) {
        setTimeout(() => {
          clearInterval(params.listener.timer);
        }, params.listener.poolduration);
      }
    });
  }
  stopListen(params) {
    clearInterval(params.timer);
  }
}
exports.dnssdProcessor = dnssdProcessor;


class LogLevelProcessor {
  initiate(connection) {

    return new Promise(function (resolve, reject) {
      resolve();
    });
  }

  process(params) {
    return new Promise(function (resolve, reject) { 
      metaLog({type:LOG_TYPE.VERBOSE, content:"Loglevel processor in ProcessManager"});
          let TheParts=params.command.split(",")
          metaLog({type:LOG_TYPE.DEBUG, content:TheParts});
          if (!TheParts.length)     // Nothing speciified?
            metaLog({type:LOG_TYPE.ERROR, content:"Oops, error in loglevel processor: no parms"});
          else 
          if (TheParts.length==1)     // List loglevels?
            {if (TheParts[0] == "SHOWLOGLEVEL")
                {let MyLogLevels = getLoglevels();
                  resolve({result: MyLogLevels});
                }
            else
              if (TheParts[0] == "SHOWBRAINLOGLEVEL")
                {
                  got("http://"+process.env.BRAINIP+":3000/v1/api/GetLogLevels")
                  .then(function (result) {
                    metaLog({type:LOG_TYPE.VERBOSE, content:"Successfully retrieved loglevels from brain"})
                    metaLog({type:LOG_TYPE.VERBOSE, content:result.body})
                    resolve(result.body);
                  })
                  .catch((err) => {
                    metaLog({type:LOG_TYPE.ERROR, content:err});
                    resolve();
                  });
                }
              else
                metaLog({type:LOG_TYPE.ERROR, content:"Oops, error in loglevel processor: unknow request "+TheParts[0]});  
            }
          else
            {metaLog({type:LOG_TYPE.VERBOSE, content:"MetaCore receipe asks for: "+TheParts});
              if (TheParts.length>2&&TheParts[2]=="/opt/meta")
              {let RC = OverrideLoglevel(TheParts[0],TheParts[1]);
              if (RC<0)
                {metaLog({type:LOG_TYPE.ALWAYS,content:"RC from loglevel-override="+RC});
                reject("Override loglevel failed"+RC);
                }
              else
                {metaLog({type:LOG_TYPE.ALWAYS,content:"Loglevel changed okay: "+RC});
                resolve('OK')
                }
              }                
              else
              {metaLog({type:LOG_TYPE.VERBOSE, content:"Calling brain for override"})
                got("http://"+process.env.BRAINIP+":3000/v1/api/OverrideLogLevel?Module="+TheParts[1]+"&logLevel="+TheParts[0])
                .then(function (result) {
                if (typeof result.body == "string")
                      result.body = JSON.parse(result.body)
                resolve(result.body);
                })
                .catch((err) => {
                  metaLog({type:LOG_TYPE.ERROR, content:err});
                  resolve();
                });
              }  

            }
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      if (params.query) {
        try {
          if (typeof (params.data) == 'string') { params.data = JSON.parse(params.data); };
          resolve(JSONPath(params.query, params.data));
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
      }
      else { resolve(params.data); }
    });
  }
  startListen(params, deviceId) {

    return new Promise(function (resolve, reject) {
      resolve('')
    });
  }
  stopListen(params) {
    clearInterval(params.timer);
  }
}
exports.LogLevelProcessor = LogLevelProcessor;
var __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
};

class TelnetProcessor {
  constructor() {

    this.listenerConnections = [];
  }

initiate(connection) {
    this.listenerConnections = [];
    return new Promise(function (resolve, reject) {      
      resolve();
    });
}

formatConsoleDate (date) {
  var hour = date.getHours();
  var minutes = date.getMinutes();
  var seconds = date.getSeconds();
  var milliseconds = date.getMilliseconds();

  return '[' +
         ((hour < 10) ? '0' + hour: hour) +
         ':' +
         ((minutes < 10) ? '0' + minutes: minutes) +
         ':' +
         ((seconds < 10) ? '0' + seconds: seconds) +
         '.' +
         ('00' + milliseconds).slice(-3) +
         '] ';
}

process(params) {
  var _this = this;
  var _this = this;
  metaLog({type:LOG_TYPE.DEBUG, content:'Process Telnet'});

  params.command = JSON.parse(params.command.replace(/[\r]?[\n]/g, '\\n'))
  if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); }
  return new Promise(function (resolve, reject) {
    try {
      if (typeof (params) == 'string') 
          params = JSON.parse(params); 
      if (_this.listenerConnections == undefined) _this.listenerConnections = [];

      if (params.command.CallType == undefined)
            params.command.CallType="send";

      if (params.command.call.search(":")<0) // no port specified?
        {metaLog({type:LOG_TYPE.WARNING, content:"process Telnet command without port; using default 23 " + params.command});
        params.command.call=params.command.call+":23";
      }
    }
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"connections not okay: "+err})}

    try {
      if (params.command.message) {
        //params.command.message=params.command.message+"\n";
        _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == params.command.call   });
        if  (_this.connectionIndex < 0)  //Not defined yet, create connection 
            {metaLog({type:LOG_TYPE.ERROR, content:"Telnet needs a listener first to handle responses"});
            reject({"Message":"no handler"});
          }    
        else 
          if (_this.listenerConnections[_this.connectionIndex].connector.Connected != "connected") 
            {metaLog({type:LOG_TYPE.ERROR, content:"Cmd faied; Telnet connection was not (yet) open to exec "+params.command.message})
            reject({"Message":'Cannot send command, login is required'})
            }
          else
            {let CommandParms={};
            if (params.command.TelnetParms!=undefined)
              if (typeof params.command.TelnetParms == "string") 
                CommandParms = JSON.parse(params.command.TelnetParms);
              else 
                CommandParms = params.command.TelnetParms;
            var DelayCmd = 0;   // No delay by default; if dexec is specified in our parms, we'll actually delay
            if (params.command.CallType == "dexec" || params.command.CallType == "exec")
              {if (params.command.CallType == "dexec")
                  {DelayCmd=params.command.delaytime ? params.command.delaytime :2500;
                  metaLog({type:LOG_TYPE.VERBOSE, content:"Delayed exec telnet "+params.command.message})
                  }
                else
                  metaLog({type:LOG_TYPE.VERBOSE, content:"Exec telnet "+params.command.message})
              setTimeout(() => 
                {_this.listenerConnections[_this.connectionIndex].connector.exec(params.command.message,CommandParms)
                  .then( (Myresult) => {
                  try {
                    if (Myresult == undefined || Myresult == '')
                        {resolve('');
                    }
                    Myresult=Myresult.toString('utf8').replace(/\r/g, '').replace(/\'/g, '"');
                    Myresult="{\"Message\":\""+Myresult+"\"}";
                    if (typeof(Myresult) == "string" )
                      Myresult = JSON.parse(Myresult);
                    resolve({"Message":Myresult}); 
                  }
                  catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Error handling promise to exec " +err});}
                })
                .catch( (err) => {metaLog({type:LOG_TYPE.ERROR, content:"Error in Telnet-client "+err});
                                  reject({"Message":"my error:"+err});
                })
                },DelayCmd)  
              }
            else
              if (params.command.CallType == "dsend" || params.command.CallType == "send")
                {if (params.command.CallType == "dsend")
                  {DelayCmd=params.command.delaytime ? params.command.delaytime :2500;
                  metaLog({type:LOG_TYPE.VERBOSE, content:"Delayed send telnet "+params.command.message})
                  }
                else
                  metaLog({type:LOG_TYPE.VERBOSE, content:"Send telnet "+params.command.message})
                setTimeout(() => 
                {
                  try 
                    {metaLog({type:LOG_TYPE.VERBOSE, content:"send telnet "+params.command.message})
                      _this.listenerConnections[_this.connectionIndex].connector.send(params.command.message,() => {});
                    }
                  catch (err) {console.log("Telnetclient suffered a fatal send error:",err);reject(err)}
                },DelayCmd) 
              }            
              else    
                {metaLog({type:LOG_TYPE.ERROR, content:"Telnet connection has invalid Telnetparms.Type:"+params.command.CallType});
                reject("InvalidTelnetType");
                }
            }
          resolve('')
        }
        else  
          resolve('')
      }
      
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Process error "+err})
                  reject('Process error');}
    })


}

query(params) {
  try {
    metaLog({type:LOG_TYPE.DEBUG, content:"Telnet query:"})
    metaLog({type:LOG_TYPE.DEBUG, content:params})
    return new Promise(function (resolve, reject) {
      if (params.query&&params.data!="") {
        try {
          if (typeof (params.data) == 'string') params.data = JSON.parse(params.data);
          params.data = JSONPath(params.query, params.data);
          if (params.data.constructor.toString().indexOf("Array") > -1)
                if (params.data.length == 1 ) 
                  params.data=params.data[0];
          resolve(JSONPath(params.query, params.data));
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
      }
      else resolve(params.data); 
    })
    .catch((err) => {
      metaLog({type:LOG_TYPE.ERROR, content:"promise catch"});
      metaLog({type:LOG_TYPE.ERROR, content:err});
      resolve();
    });  
  }
  catch (err) {
    metaLog({type:LOG_TYPE.ERROR,content:"Error in ProcessingManager.js process: "+err});
    reject('failed query telnet');
  }

}

startListen(params, deviceId) {
  var _this = this;
  params.command = JSON.parse(params.command.replace(/[\r]?[\n]/g, '\\n'))


  return new Promise(function (resolve, reject) {
    if (params.command==undefined || params.command.call==undefined)
      {metaLog({type:LOG_TYPE.ERROR, content:"Setting up Telnet listener connection but no command or call defined: " + params});
      reject('');
    }
    if (params.command.call.search(":")<0) // no port specified?
      {metaLog({type:LOG_TYPE.WARNING, content:"Setting up Telnet listener connection with default port 23 " + params.command});
      params.command.call=params.command.call+":23";
      }
          // Handle opening the connection ######################################################//

    _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == params.command.call   });
    if  (_this.connectionIndex < 0)  //Not defined yet, create connection 
        {metaLog({type:LOG_TYPE.VERBOSE, content:"Setting up listener connection with Telnet - " + params.command.call});
        try {
          var TelnetDevice = new Telnet()
          TelnetDevice.Connected="init";
          TelnetDevice.URL=params.command.call;

          // Receiving data ######################################################//
          TelnetDevice.on('xata', (result) => { 
            let Myresult=result.toString('utf8').replace(/\r/g, '').replace(/\'/g, '"');
            _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == TelnetDevice.URL  });
            if  (_this.connectionIndex == -1)  //Not defined yet?? how is that possible?
              metaLog({type:LOG_TYPE.ERROR, content:"Receiving Telnet message without listener setup " + TelnetDevice.URL + ": " + MyResult});
            else
              {
              Myresult="{\"Message\":\""+Myresult+"\"}";
              metaLog({type:LOG_TYPE.DEBUG, content:"Receiving message on Telnet listener "  + TelnetDevice.URL + ": " + Myresult});
              params._listenCallback(Myresult, params.listener, deviceId);
              }
          });

          // Handle errors ######################################################//          
          TelnetDevice.on('error', function(err) {
            _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == TelnetDevice.URL  });
            if  (_this.connectionIndex == -1)  //Not defined yet?? how is that possible?
              metaLog({type:LOG_TYPE.ERROR, content:"Error within Telnet message without listener setup " + TelnetDevice.URL + ": " + MyResult});
            else
              metaLog({type:LOG_TYPE.ERROR, content:"Error within Telnet connection - " + _this.listenerConnections[_this.connectionIndex].descriptor + ": " + err});
          })

          //Handle proper setup connection ######################################################//
          TelnetDevice.on('ready', function() {
            _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == TelnetDevice.URL  });
            if  (_this.connectionIndex == -1)  //Not defined yet?? how is that possible?
              metaLog({type:LOG_TYPE.ERROR, content:"READY Connection with Telnet without listener setup " + TelnetDevice.URL + ": " + MyResult});
            else
              metaLog({type:LOG_TYPE.VERBOSE, content:"Ready within Telnet connection - " + _this.listenerConnections[_this.connectionIndex].descriptor });
            _this.listenerConnections[_this.connectionIndex].Connected == "ready";
            TelnetDevice.Connected = "ready";
          })

          //Handle connected ######################################################//
          TelnetDevice.on('connect', function() {
            _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == TelnetDevice.URL  });
            if  (_this.connectionIndex >= 0)  //Existing connection 
              {metaLog({type:LOG_TYPE.VERBOSE, content:"Telnet-client reports CONNECT "+_this.listenerConnections[_this.connectionIndex].descriptor});
              TelnetDevice.Connected = "connected";
              _this.listenerConnections[_this.connectionIndex].Connected="connected";
              }
            else
              metaLog({type:LOG_TYPE.ERROR, content:"Connect with Telnet without listener setup " + TelnetDevice.URL + ": " + MyResult});
          })

          //Handle timeout ######################################################//
          TelnetDevice.on('timeout', function() {
            _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == TelnetDevice.URL  });
            if  (_this.connectionIndex >= 0)   
              {metaLog({type:LOG_TYPE.WARNING, content:"TIMEOUT Telnet-client "+_this.listenerConnections[_this.connectionIndex].descriptor});              
              //TelnetDevice.Connected = "connected";
              //_this.listenerConnections[_this.connectionIndex].Connected="connected";
            }
            else
              metaLog({type:LOG_TYPE.ERROR, content:"READY Connection with Telnet without listener setup " + TelnetDevice.URL + ": " + MyResult});

          })

          //Handle closing ######################################################//
          TelnetDevice.on('close', function() {
            _this.connectionIndex = _this.listenerConnections.findIndex((con) => {return con.descriptor == TelnetDevice.URL  });
            if  (_this.connectionIndex >= 0)  //Not defined yet, create connection 
              {metaLog({type:LOG_TYPE.VERBOSE, content:"Telnet-client shows connection is closed " + _this.listenerConnections[_this.connectionIndex].descriptor});
              metaLog({type:LOG_TYPE.VERBOSE, content:_this.listenerConnections[_this.connectionIndex].Connected});
              if ( _this.listenerConnections[_this.connectionIndex].Connected != "wrapup")
                {TelnetDevice.Connected = "closed";
                _this.listenerConnections[_this.connectionIndex].Connected="retrying";
                metaLog({type:LOG_TYPE.VERBOSE, content:"Telnet-client retrying to connect " + _this.listenerConnections[_this.connectionIndex].descriptor});
                try {  
                  _this.listenerConnections[_this.connectionIndex].connector.connect(_this.listenerConnections[_this.connectionIndex].Telnetparams);
                  }
                catch (err) {metaLog({type:LOG_TYPE.ERROR, content:'Error restarting  Telnet-connection ' + err});}        
              }
              _this.listenerConnections[_this.connectionIndex].Connected = "closed";
              setTimeout(() => { // give it some time before removing definiotn for listener
                _this.listenerConnections.splice(_this.connectionIndex, 1);
                console.log("Wrapup done, showing listener connections",_this.listenerConnections)
              }, 2000)

            }
          })    

          //Handle the connection parameters (call and TelnetParms) ######################################################//
          if (params.command.call != "" && params.command.call != undefined) 
            {let IPParts=params.command.call.split(':');
            params.command.TelnetParms.host=IPParts[0]
            params.command.TelnetParms.port=IPParts[1]; // Use parnms defined in call
            }

          if (!params.command.TelnetParms)
            {metaLog({type:LOG_TYPE.WARNING, content:"Telnet-client without TelnetParms defined; using default 127.0.0.1:23 " + _this.listenerConnections[_this.connectionIndex].descriptor});
              params.command.TelnetParms.host="127.0.0.1"
              params.command.TelnetParms.port="23"; // No parms, assume a local connection.
            }
          else
            {if (params.command.TelnetParms.loginPrompt) 
                params.command.TelnetParms.loginPrompt    = RegExp(params.command.TelnetParms.loginPrompt.slice(1, -1),'i');
            if (params.command.TelnetParms.passwordPrompt)
                params.command.TelnetParms.passwordPrompt = RegExp(params.command.TelnetParms.passwordPrompt.slice(1, -1),'i');
            if (params.command.TelnetParms.shellPrompt)
                params.command.TelnetParms.shellPrompt    = RegExp(params.command.TelnetParms.shellPrompt.slice(1, -1),'i');
          }

          //Now perform an actual connection attempt ######################################################//
          _this.listenerConnections.push({"descriptor": params.command.call, "connector": TelnetDevice,"Telnetparams":params.command.TelnetParms,"Connected":TelnetDevice.Connected});
          _this.connectionIndex = _this.listenerConnections.length - 1;
        }
        catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Error Telnet connect " +err})}

      try {
      _this.listenerConnections[_this.connectionIndex].connector.connect(_this.listenerConnections[_this.connectionIndex].Telnetparams);
      }
      catch (err) {metaLog({type:LOG_TYPE.ERROR, content:'Error setting up Telnet-connection ' + err});
        reject('Connection error')
        }
      }  
    else 
      if (_this.listenerConnections[_this.connectionIndex].Connected != "connected")
           {
            metaLog({type:LOG_TYPE.VERBOSE, content:"Telnet listener was here, but closed; opening " + _this.listenerConnections[_this.connectionIndex].descriptor});
            _this.listenerConnections[_this.connectionIndex].connector.connect(_this.listenerConnections[_this.connectionIndex].Telnetparams);
           }
      else
        metaLog({type:LOG_TYPE.VERBOSE, content:"Telnet listener connection was reused " + _this.listenerConnections[_this.connectionIndex].descriptor});

    metaLog({type:LOG_TYPE.VERBOSE, content:"Telnet listener connection finished: " + params.command.call});
    resolve('')
  })
}
  wrapUp(connection) { 
    metaLog({type:LOG_TYPE.VERBOSE, content:"Wrapup Telnet connections " +connection})
        connection.connections.forEach(myCon => {
          metaLog({type:LOG_TYPE.VERBOSE, content:"Cleanup Telnet connections " + myCon})
          myCon.connector.terminate();
          myCon.connector = null;
        });
        connection.connections = undefined;
  }
  
    
  stopListen(params) {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Wrapup Telnet Connection " })
    if (typeof (params.command) == 'string') params.command = JSON.parse(params.command);

    if (params.command.call.search(":")<0) // no port specified?
      {metaLog({type:LOG_TYPE.VERBOSE, content:"process Telnet command without port; using default 23 " + params.command});
      params.command.call=params.command.call+":23";
    }
    let connectionIndex = this.listenerConnections.findIndex((con) => {return con.descriptor == params.command.call  });
    if  (connectionIndex >= 0)  
        {metaLog({type:LOG_TYPE.VERBOSE, content:"StopListen Telnet connection " + this.listenerConnections[connectionIndex].descriptor});
        this.listenerConnections[connectionIndex].Connected="wrapup";
        this.listenerConnections[connectionIndex].connector.end();
        this.listenerConnections[connectionIndex].connector.destroy();
        }          
  }
}
exports.TelnetProcessor = TelnetProcessor;

class NEEOAPIProcessor {
  constructor() {
  };
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); };
    metaLog({type:LOG_TYPE.VERBOSE, content:"NEEOAPI CALL "+params.command});
    return new Promise(function (resolve, reject) {
        fs.readFile(__dirname + '/config.js', (err, config) => {
          var URL = "HTTP://"+JSON.parse(config).brainip+":3000/v1/api/"+params.command.verb+"/7220086763497193472"
          metaLog({type:LOG_TYPE.DEBUG, content:"NEEOAPI URL: "+URL})
          got(URL)
            .then(function (result) {
              metaLog({type:LOG_TYPE.VERBOSE, content:"NEEOAPI result:"+result.body});
              resolve(result.body);
            })
            .catch((err) => {
              metaLog({type:LOG_TYPE.ERROR, content:err});
              resolve();
            });
        })
    })
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      if (params.query) {
        try {
          if (typeof (params.data) == 'string') { params.data = JSON.parse(params.data); };
          resolve(JSONPath(params.query, params.data));
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:err});
        }
      }
      else { resolve(params.data); }
    });
  }
  startListen(params, deviceId) {
    return new Promise(function (resolve, reject) {
      resolve('');
    })
    }
  stopListen(listener) {
    return;    
  }
}
exports.NEEOAPIProcessor = NEEOAPIProcessor;

class cliProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve();
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      try {
        exec(params.command, (stdout, stderr) => {
          if (stdout) {
            resolve(stdout);
          }
          else {
            resolve(stderr);
          }
        });
      }
      catch (err) {
        resolve(err);
      }
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {


        //let resultArray = new [];
        if (params.query!=undefined) {
          if (params.query!="") {
            let literal = params.query.slice(params.query.indexOf('/')+1, params.query.lastIndexOf('/'));
            let modifier = params.query.slice(params.query.lastIndexOf('/')+1);
            metaLog({type:LOG_TYPE.VERBOSE, content:"RegEx literal : " + literal + ", regEx modifier : " + modifier});
            let regularEx = new RegExp(literal, modifier);
              resolve(params.data.toString().match(regularEx));
          }
          else {
            resolve(params.data.toString())
          }
        }
        else {resolve();}
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:'error in string.match regex :' + params.query + ' processing of :' + params.data});
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  }
  listen(params) {
    return '';
  }
}
exports.cliProcessor = cliProcessor;
class replProcessor {
  initiate(connection) {
    return new Promise(function (resolve, reject) {
      try {
        if (connection.connector != "" && connection.connector != undefined) {
          connection.connector.close();
        } //to avoid opening multiple
        connection.connector = io.connect(connection.descriptor);
        resolve(connection);
      }
      catch (err) {
        metaLog({type:LOG_TYPE.ERROR, content:'Error while intenting connection to the target device.'});
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  }
  process(params) {
    return new Promise(function (resolve, reject) {
      if (params.interactiveCLIProcess) {
        params.interactiveCLIProcess.stdin.write(params.command + '\n');
        resolve('Finished ' + params.command);
      }
    });
  }
  query(params) {
    return new Promise(function (resolve, reject) {
      try {
        //let resultArray = new [];
        resolve(params.data.split(params.query));
      }
      catch {
        metaLog({type:LOG_TYPE.ERROR, content:err});
      }
    });
  }
  listen(params) {
    return '';
  }
}
exports.replProcessor = replProcessor;

function UnsubscribeMQTT (params,connectionIndex,TheTopic) {
  metaLog({type:LOG_TYPE.DEBUG, content :"Unsubscribing MQTT "+ connectionIndex})
  params.connection.connections[connectionIndex].connector.unsubscribe(TheTopic);
  for (const key in params.connection.connections[connectionIndex].connector.messageIdToTopic) {
    for (let i = 0; i < params.connection.connections[connectionIndex].connector.messageIdToTopic[key].length; i++) {
      let elem = params.connection.connections[connectionIndex].connector.messageIdToTopic[key][i]
      if (elem == TheTopic)  params.connection.connections[connectionIndex].connector.messageIdToTopic[key].splice(i, 1);
    }
    if (params.connection.connections[connectionIndex].connector.messageIdToTopic[key].length<=0) delete params.connection.connections[connectionIndex].connector.messageIdToTopic[key] 
  }
  metaLog({type:LOG_TYPE.DEBUG, content :"Done unsubscribing, subscriptions are now:"})
  metaLog({type:LOG_TYPE.DEBUG, content : params.connection.connections[connectionIndex].connector.messageIdToTopic});

}

 function HandleMQTTIncoming (GetThisTopic,topic,message){



  metaLog({type:LOG_TYPE.DEBUG, content:'Topic received : ' + topic.toString()});
  metaLog({type:LOG_TYPE.DEBUG, content:'Message received : ' + message.toString()});
  metaLog({type:LOG_TYPE.DEBUG, content:'Looking for topic : ' + GetThisTopic});

  var RcvdTopicPart = topic.split("/"),i;
  var ParamsTopicPart = GetThisTopic.split("/");
  var Matched = true; 

  for (i = 0; i < RcvdTopicPart.length; i++) {
    if (ParamsTopicPart.length < i) {   // Does the topic we received have less sections than asked for?
      Matched=false;
      break;                      // Yes, it is not a match
    }
    if (ParamsTopicPart[i]=="#") {      // Full-Wildcard placed in this section, so exit compare-loop now
       Matched=true;
       break;
     }
     if (ParamsTopicPart[i]=="+")  {    // Section-wildcard placed in this section, so continue compare-loop now
        continue;
      }
    if (ParamsTopicPart[i]!=RcvdTopicPart[i]) {
      Matched=false;
      break;
    }
  }  
  if (Matched) {
    metaLog({type:LOG_TYPE.VERBOSE, content:'Topic match: ' + topic.toString()});
    return(Matched);
  }

}

class mqttProcessor {
  constructor() {

    this.Timer = [];
    this.MQTT_IP=""; 
    this.Handlers=[];
    this._MQTTGetTimers= []
    this.listenerConnections = [];


//    this.Handler0 = function Handler (topic, message,packet) {_this.OnMessageHandler(topic, message,packet,0)}

    this.HandlerDetails=[]

  }

  initiate(connection) {
    return new Promise(function (resolve, reject) {
      resolve('');
      //nothing to do, it is done globally.
      //connection.connector = mqttClient;
    }); 
  } 
  

  CleanupRequest (Handler) {
    var _this = this;
    try {
    let MyDetails =  this.HandlerDetails[Handler]
    let params = MyDetails.params;
    let connectionIndex = MyDetails.connectionIndex;
    let GetTopic = MyDetails.GetTopic;
    try { 
      var oldRequest = params.connection.connections[connectionIndex].getRequests.findIndex((old) => {return old.ID == Handler})
    }
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Something wrong with getRequest-stack on params "+err});oldRequest = -1}
    if (oldRequest == -1) {  // request was not found, that's strange... 
      metaLog({type:LOG_TYPE.ERROR, content:"Could not find request-entry in params... "});

    }
    else {
      if (params.connection.connections[connectionIndex].getRequests[oldRequest].topic != GetTopic) {
        metaLog({type:LOG_TYPE.ERROR, content:"Topic in entry to remove does not match request... "+GetTopic});
        metaLog({type:LOG_TYPE.ERROR, content:params.connection.connections[connectionIndex].getRequests[oldRequest]});
      }
      metaLog({type:LOG_TYPE.DEBUG, content:"remove old request from original parms "+ GetTopic});
      metaLog({type:LOG_TYPE.DEBUG, content:oldRequest});
      params.connection.connections[connectionIndex].getRequests.splice(oldRequest,1)
    }

    _this.timerRemove(Handler);
    UnsubscribeMQTT(params,connectionIndex,GetTopic);
    metaLog({type:LOG_TYPE.VERBOSE, content:"Unsubscribed from "+GetTopic})
    params.connection.connections[connectionIndex].connector.off('message',_this.Handlers[Handler]); 
    metaLog({type:LOG_TYPE.DEBUG, content:"Removed msg-handler "+params.connection.connections[connectionIndex].descriptor})
    MyDetails.availableEntry=true; // flag entry  as available again. 
    metaLog({type:LOG_TYPE.DEBUG, content:"Done with cleanup "+params.connection.connections[connectionIndex].descriptor})

    }
    catch(err) {metaLog({type:LOG_TYPE.ERROR, content:"Cleanup got an error: " +Handler,err})
      metaLog({type:LOG_TYPE.ERROR, content:params})
    }     
  }

  timerFind (name) {
    this.myEntry = this._MQTTGetTimers.findIndex((con) => {return con.name == name})
    return this.myEntry;
  }
  timerSet (name, func, time) {
    this.timerClear(name);
    this._MQTTGetTimers.push({
       name: name,
       pending: true,
       func: func 
    });
    var _this = this;
    var tobj = this._MQTTGetTimers[this.timerFind(name)];
    const myBoundMethod = (function () {
      tobj.pending = false;
      //      tobj.func.call(arguments);
      metaLog({type:LOG_TYPE.WARNING, content:"MQTT Timeout occurred waiting on slot " +name})
      _this.CleanupRequest(name)
    }).bind(this.CleanupRequest);
    tobj.MQTTGetTimer = setTimeout(myBoundMethod , time);
  }

  timerRemove (name) {
    if (this.timerFind(name)> -1){
       this.timerClear(name);
       this._MQTTGetTimers.splice(this.timerFind(name),1)
    }

  } 

  timerClear (name) {
    if (this.timerFind(name)> -1 && this._MQTTGetTimers[this.timerFind(name)].pending) {
       clearTimeout(this._MQTTGetTimers[this.timerFind(name)].MQTTGetTimer);
       this._MQTTGetTimers[this.timerFind(name)].pending = false;
    }
  }

   OnMessageHandler (currParams,Handler,topic, message,packet) {
    var _this = this;
    try {      
      let MyDetails =  this.HandlerDetails[Handler]
      let params = MyDetails.params;
      let connectionIndex = MyDetails.connectionIndex;
      let GetTopic = MyDetails.GetTopic;

      let Matched = HandleMQTTIncoming(GetTopic,topic,message)//,message,params.connection.connections[_this.connectionIndex].connector);
      if (Matched ==-1) // not the topic we are interested in
        return;
      metaLog({type:LOG_TYPE.VERBOSE, content:"We have a message with matching topic in process " + topic.toString() + " "  + message.toString()});
      _this.CleanupRequest(Handler)      
      if (typeof (message) == 'string') {
        try {message = JSON.parse(message); }
        catch (err) {
          let tempMessage = message.toString(); // make sure it will fit into the JSON-return (quotes for strings)
          if (isNaN(tempMessage)) 
            if(tempMessage[0] != '"' || tempMessage[tempMessage.length - 1] != '"') 
              message = '"'+message+'"'          
        }
      }
        else  {
          let tempMessage = message.toString(); // make sure it will fit into the JSON-return (quotes for strings)
          try {tempMessage = JSON.parse(tempMessage); }
          catch (err) {
            if (isNaN(tempMessage)) 
              if(tempMessage[0] != '"' || tempMessage[tempMessage.length - 1] != '"') 
                message = '"'+tempMessage+'"'
          }
        }
      _this.promiseResolve("{\"topic\": \""+ topic.toString()+ "\",\"message\" : " +message+"}");                          
    }  
    catch (err) {
      metaLog({type:LOG_TYPE.ERROR,content:"Error in ProcessingManager.js MQTT-process msghandler: "+err});
    }
  }  
  process (params) {
    var _this = this;
    try {
      metaLog({type:LOG_TYPE.VERBOSE, content:"mqtt Process handler: "+params.command});
      if (!this.Handlers.length) {
        for (let i =0;i<10;i++) {
          eval("this.Handler"+i+" = function Handler (topic, message,packet) {_this.OnMessageHandler(params,"+i+",topic, message,packet)}")
          eval("this.Handlers["+i+"]=this.Handler"+i+";this.HandlerDetails["+i+"]={}")
        }
      }
    }
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"Init error "+err})}

    return new Promise(function (resolve, reject) {
      _this.promiseResolve = resolve;
      _this.promiseReject  = reject;
      params.command = JSON.parse(params.command);
      if (params.connection == undefined)
        {resolve('No MQTT-connection given')
        return;
      }
      if  (!params.connection.connections) { params.connection.connections = []};
      _this.MQTT_IP = (params.command.connection!=undefined&&params.command.connection!="") ?params.command.connection:_this.MQTT_IP = 'mqtt://'+ settings.mqtt 
      _this.connectionIndex = params.connection.connections.findIndex((con) => {return con.descriptor == _this.MQTT_IP});
      if  (_this.connectionIndex < 0) { //checking if connection exist
          try {
            metaLog({type:LOG_TYPE.VERBOSE, content:'New connection for MQTT on: ' + _this.MQTT_IP});
            mqttClient = mqtt.connect(_this.MQTT_IP, {clientId:"ProcessorConn"+process.hrtime()}); // Connect to the designated mqtt broker, use a unique clientid
            mqttClient.setMaxListeners(0); //CAREFULL OF MEMORY LEAKS HERE.
            params.connection.connections.push({"descriptor": _this.MQTT_IP, "connector": mqttClient});
            _this.connectionIndex = params.connection.connections.length - 1;
          }
          catch (err) {metaLog({type:LOG_TYPE.ERROR, content:'Error setting up MQTT-connection ' + err});}
        }
        try {
  //      metaLog({type:LOG_TYPE.DEBUG, content:params.connection.connections[_this.connectionIndex].connector});
        var MQTTSubscribed = false;
        if ((params.command.replytopic)||(params.command.topic&&!params.command.message)) {//here we get a value from a topic
          if (params.command.replytopic)
            _this.GetThisTopic = params.command.replytopic;   
          else 
            _this.GetThisTopic = params.command.topic;
          _this.CheckOnMessage = true;

          if (params.connection.connections[_this.connectionIndex].getRequests==undefined) params.connection.connections[_this.connectionIndex].getRequests = [];
          // next actions store the "Get-request"in an array and sets a timer to wait for a response
          for (_this.RequestItem=0;_this.RequestItem<_this.Handlers.length;_this.RequestItem++) 
              if (_this.HandlerDetails[_this.RequestItem].availableEntry==undefined||_this.HandlerDetails[_this.RequestItem].availableEntry) {
                metaLog({type:LOG_TYPE.WARNING, content:"temp Selected request slot: "+_this.RequestItem})
                params.connection.connections[_this.connectionIndex].getRequests.push({"ID":_this.RequestItem,"topic": _this.GetThisTopic});
                _this.HandlerDetails[_this.RequestItem].availableEntry=false;
                _this.HandlerDetails[_this.RequestItem].connectionIndex=_this.connectionIndex;
                _this.HandlerDetails[_this.RequestItem].params=params;// JSON.parse(JSON.stringify(params));
                _this.HandlerDetails[_this.RequestItem].GetTopic=_this.GetThisTopic;
                _this.timerSet(_this.RequestItem, function() {
                  metaLog({type:LOG_TYPE.ERROR, content:"Timeout waiting for MQTT-topic "+_this.expiringentry});
                  //metaLog({type:LOG_TYPE.ERROR, content:_this.HandlerDetails[_this.expiringentry].GetTopic});
                  //_this.CleanupRequest(_this.expiringentry)
                  reject('');return;            
                },   10000);               
                break;
              }
          // Now that we've setup an element in "get0-request array", use message-handler from that entry: _this.Handlers[_this.RequestItem] 
          params.connection.connections[_this.connectionIndex].connector.on('message', _this.Handlers[_this.RequestItem]);
          metaLog({type:LOG_TYPE.VERBOSE, content:"Subscribing to " + _this.GetThisTopic });  // and subscribe to topic    
          params.connection.connections[_this.connectionIndex].connector.subscribe(_this.GetThisTopic);
          MQTTSubscribed=true;
          }
    
        }
        catch (err) {metaLog({type:LOG_TYPE.ERROR, content:"error in message handler " +err})}

        try {
            // Next is a bit complex: if we have a message to send **OR** No listen action started and no message to send? Then send a message (though it will be empty)
        if (params.command.message || (!MQTTSubscribed && !params.command.message)) {    
          metaLog({type:LOG_TYPE.VERBOSE, content:'MQTT publishing ' + params.command.message + ' to ' + params.command.topic + ' with options : ' + params.command.options});
          try {
            metaLog({type:LOG_TYPE.VERBOSE, content:"Publishing on " + params.connection.connections[_this.connectionIndex].descriptor});
            params.connection.connections[_this.connectionIndex].connector.publish(params.command.topic, params.command.message, (params.command.options ? JSON.parse(params.command.options) : ""));
            if (params.command.replytopic== undefined) { //Only resolve when not waiting on response
              metaLog({type:LOG_TYPE.DEBUG, content:"No replytopic, so we'll return immediately"})
              resolve('');
            }
            else 
            metaLog({type:LOG_TYPE.DEBUG, content:"Replytopic, so we'll wait for a response on MQTT " +params.command.replytopic})
          }
          catch (err) {
            metaLog({type:LOG_TYPE.ERROR, content:'Meta found an error processing the MQTT command'});
            metaLog({type:LOG_TYPE.ERROR, content:err});
          }
        }
      }
      catch (err) {metaLog({type:LOG_TYPE.VERBOSE, content:"error in publish part " +err})}
    })
}

  query(params) {
    return new Promise(function (resolve, reject) {
      if (params.query) {
        metaLog({type:LOG_TYPE.VERBOSE, content:"MQTT params.query and data"});
        metaLog({type:LOG_TYPE.DEBUG, content:params.query});
        metaLog({type:LOG_TYPE.DEBUG, content:params.data});
        try {
          if (typeof (params.data) == 'string') { params.data = JSON.parse(params.data); }
          resolve(JSONPath(params.query, params.data));
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:'error ' + err + ' in JSONPATH ' + params.query + ' processing of :'});
          metaLog({type:LOG_TYPE.ERROR, content:params.data});
        }
      }
      else { resolve(params.data); }
    });
  }
  startListen(params, deviceId) {
    var _this = this;
    //********************************************************************** */
    //
    // PLEASE NOTE: This section is generally not used for MQTT
    //
    //********************************************************************** */

    return new Promise(function (resolve, reject) {
      metaLog({type:LOG_TYPE.VERBOSE, content:'startlisten mqtt'  });
      // Here, we need top add handler for ip-address of mqtt-server, if provided; else 'mqtt://' + settings.mqtt
      if (typeof (params.command) == 'string') { params.command = JSON.parse(params.command); }
      let connectionIndex = _this.listenerConnections.findIndex((con) => {return (con.Listenerdescriptor == params.command.connection && con.ListenerName == params.listener.name)});
      metaLog({type:LOG_TYPE.VERBOSE, content:'Connection Index:' + connectionIndex});

      try {
        if  (connectionIndex < 0) { //checking if connection exist
            metaLog({type:LOG_TYPE.VERBOSE, content:"Adding connection for mqtt " + params.command.connection})
            let MQTT_IP = (params.command.connection)?params.command.connection:'mqtt://' + settings.mqtt;
            mqttClient = mqtt.connect(MQTT_IP, {clientId:"processingListenController"+params.command.connection+"-"+params.listener.name}); // Connect to the designated mqtt broker
            mqttClient.setMaxListeners(0); //CAREFULL OF MEMORY LEAKS HERE.
            _this.listenerConnections.push({"Listenerdescriptor": params.command.connection, "connector": mqttClient,"ListenerName":params.listener.name});
            connectionIndex = _this.listenerConnections.length - 1;
          }
      _this.listenerConnections[connectionIndex].connector.subscribe(params.command.topic, (result) => {
        metaLog({type:LOG_TYPE.VERBOSE, content:'Status of subscription MQTT : '+ result})});
        _this.listenerConnections[connectionIndex].connector.on('message', function (topic, message,packet) {
          let  Matched = HandleMQTTIncoming(JSON.stringify(params.command.topic).split('"')[1],topic,message);
            if (Matched) {  
              if (typeof (message) == 'string')  
                try {message = JSON.parse(message); }
                catch (err) {
                  let tempMessage = message.toString(); // make sure it will fit into the JSON-return (quotes for strings)
                  if (isNaN(tempMessage))
                    if(tempMessage[0] != '"' || tempMessage[tempMessage.length - 1] != '"')
                      Message = '"'+Message+'"'
                }
              params._listenCallback("{\"topic\": \""+ topic.toString()+ "\",\"message\" : " +message+"}", params.listener, deviceId);
            }
          });
        resolve('');
    }
    catch (err) {metaLog({type:LOG_TYPE.ERROR, content:'Error setting up MQTT-connection '+err})}
    });
  }
  stopListen(listener) {
    //********************************************************************** */
    //
    // PLEASE NOTE: This section is generally not used for MQTT
    //
    //********************************************************************** */

    metaLog({type:LOG_TYPE.VERBOSE, content:'Stop listening to the MQTT device.' + listener.name});
    var _this = this;
    return new Promise(function (resolve, reject) {
      try {
      let connectionIndex = _this.listenerConnections.findIndex((con) => {
        return (con.Listenerdescriptor == JSON.parse(listener.command).connection && con.ListenerName == listener.name)});
        metaLog({type:LOG_TYPE.VERBOSE, content:"Connectionindex",connectionIndex})
      if (connectionIndex!= -1) {
        metaLog({type:LOG_TYPE.VERBOSE, content:"Removing MQTT-listener "+ listener.name})
        metaLog({type:LOG_TYPE.debug, content:_this.listenerConnections[connectionIndex]})
        _this.listenerConnections[connectionIndex].connector.unsubscribe(JSON.parse(listener.command).topic);
        _this.listenerConnections[connectionIndex].connector.end()
        _this.listenerConnections.splice([connectionIndex],1)
        metaLog({type:LOG_TYPE.VERBOSE, content:"Removal done: "+ listener.name})
      }
    }
    catch (err){metaLog({type:LOG_TYPE.ERROR, content:err})}

      resolve();
    })
  
  }

  wrapUp(connection) {
    metaLog({type:LOG_TYPE.VERBOSE, content:"Wrapup MQTT Connection " })
    return new Promise(function (resolve, reject) {
      let NrFound=0;
      for (let i=0;i<connection.connections.length;i++) 
        if (connection.connections[i].deviceId == connection.deviceId) 
          {MyConn=connection.connections[i];
          metaLog({type:LOG_TYPE.VERBOSE, content:'MQTT-connection wrapUp: '+MyConn.descriptor,"deviceId":connection.deviceId });
          MyConn.connector.end();
          NrFound++;
          }
      if (!NrFound)
          metaLog({type:LOG_TYPE.VERBOSE, content:"MQTT-connection wrapUp: no connection found","deviceId":connection.deviceId });
      resolve();
   })
  }
}
exports.mqttProcessor = mqttProcessor;

