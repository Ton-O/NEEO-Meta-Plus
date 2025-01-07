const { Console } = require('console');
const neeoapi = require('neeo-sdk');
const path = require('path');
const settings = require(path.join(__dirname,'settings'));
const variablePattern = {'pre':'$','post':''};
const RESULT = variablePattern.pre + 'Result' + variablePattern.post;
const BROWSEID = variablePattern.pre + 'NavigationIdentifier' + variablePattern.post;
const MQTT = 'mqtt';
//LOGGING SETUP AND WRAPPING
//Disable the NEEO library console warning.
const { metaMessage, LOG_TYPE } = require("./metaMessage");
console.error = console.info = console.debug = console.warn = console.trace = console.dir = console.dirxml = console.group = console.groupEnd = console.time = console.timeEnd = console.assert = console.profile = function() {};
function metaLog(message) {
  let initMessage = { component:'directoryHelper', type:LOG_TYPE.INFO, content:'', deviceId: null };
  let myMessage = {...initMessage, ...message}
  return metaMessage (myMessage);
}  

class directoryHelper {
  constructor(deviceId, dirname, controller) {
    this.name = dirname;
    this.deviceId = deviceId;
    this.feederH = [];
    this.cacheList = [];
    this.actionId = undefined;
    this.browseHistory = [];
    this.currentFeederIndex = 0;
    this.controller = controller;
    this.previousOffset = 0; //check if we were scrolling;
    this.keyboardBuffer = "";
    this.ResultItems = [];
    this.LastSearchQuery = [];
    this.LastSearchQueryResult = [];
    this.LastSearchQueryTimestamp=0;

    var self = this;
    this.addFeederHelper = function (feedConfig) {
      self.feederH.push(feedConfig);
    };
    this.browse = {
      getter: (deviceId, params) => this.fetchList(deviceId, params),
      action: (deviceId, params) => this.handleAction(deviceId, params),
    };

    this.evalNext = function (deviceId, evalnext, result, browseIdentifierValue) {
      if (evalnext) { //case we want to go to another feeder
        evalnext.forEach(evalN => {
          //if (evalN.test == '') {evalN.test = true}; //in case of no test, go to the do function TODO: correction, not working.
          let finalNextTest = self.controller.vault.readVariables(evalN.test, deviceId);// prepare the test to assign variable and be evaluated.
          finalNextTest = self.controller.assignTo(RESULT, finalNextTest, result);
          if (browseIdentifierValue) {
            finalNextTest = self.controller.assignTo(BROWSEID, finalNextTest, browseIdentifierValue);
          }
          if (finalNextTest) {
            if (evalN.then && evalN.then != '')
            { self.currentFeederIndex = self.feederH.findIndex((feed) => {return (feed.name == evalN.then)});
            }
          }
          else { 
            if (evalN.or && evalN.or != '')
            {
              self.currentFeederIndex = self.feederH.findIndex((feed) => {return (feed.name == evalN.or)});

            }
          }
        })
      }
    }

    this.fetchList = function (deviceId, params) { //browse management and delegation to feeders. to be refactored later>
      return new Promise(function (resolve, reject) {
      metaLog({type:LOG_TYPE.INFO, content:'Fetch Parameters : ' + JSON.stringify(params), deviceId:deviceId});
      // Ton-o keyboardsearch <----- extra code to pick up keyboardsearch and strip off SearchID= from browseidentifier
      let SearchQueryValue ="";
      let SearchQueryId;
      var needSpecialcare = "";
      self.keybardBuffer = self.controller.vault.readVariables("$KEYBOARDSEARCH", deviceId)
      if (params.browseIdentifier != undefined && params.browseIdentifier != '') { //case were a directory was selected in the list
        //Take the good feeder:
        //Take the good commandset:
        
        // But first!!! check to see if we are handling a keyboard-request (save the searchvalue from browse identifier)
          needSpecialcare = params.browseIdentifier.split("$SearchID=");
        if (needSpecialcare.length > 1) { // yes
          SearchQueryId = needSpecialcare[1]
          params.browseIdentifier = needSpecialcare[0]; // restore original param
          let theResultEntry = self.ResultItems[SearchQueryId]
          SearchQueryValue = theResultEntry
          if (theResultEntry.RESULTENTRIES==1) {
            self.keyboardBuffer = theResultEntry.NAMEFOUND
            theResultEntry.SEARCHPARM = theResultEntry.NAMEFOUND // Only one found, set setsearchparm to full name
          }
          else 
            self.keyboardBuffer = theResultEntry.SEARCHPARM
        }
         // End Ton-O
        let PastQueryId = params.browseIdentifier.split("$PastQueryId=")[1];
        if (self.actionId != undefined) {
          PastQueryId = self.actionId;
          self.actionId = undefined;          
        } 
        // Ton-o keyboardsearch <-----  Normally Pastqueryvalue is filled from cachelist, except for keyboardsearch
        let PastQueryValue;  // Pastqueryvalue will be filled with either:
        if (needSpecialcare.length>1) {   // The result of the keyboard search so far
          metaLog({type:LOG_TYPE.VERBOSE, content:'Using result from Search keyboard: ', deviceId:deviceId});
          metaLog({type:LOG_TYPE.VERBOSE, content:SearchQueryValue, deviceId:deviceId});
          PastQueryValue = SearchQueryValue  //So fill it with the value from SearchQueryValue
        }
        else 
          PastQueryValue = self.cacheList[PastQueryId].myPastQuery; // Or it's normal value, obtained from browseidentifier
        // Ton-o keyboardsearch done  
        params.browseIdentifier = params.browseIdentifier.split("$PastQueryId=")[0];
        let commandSetIndex = params.browseIdentifier.split("$CommandSet=")[1];
        params.browseIdentifier = params.browseIdentifier.split("$CommandSet=")[0];

        if (self.cacheList[PastQueryId].action == undefined || self.cacheList[PastQueryId].action == "") {
          //new oct 2021
          let tmpCommandSet = JSON.stringify(self.feederH[self.currentFeederIndex].commandset[commandSetIndex]);
          tmpCommandSet = tmpCommandSet.replace(/\$ListIndex/g, PastQueryId);
          tmpCommandSet = JSON.parse(tmpCommandSet);
          self.controller.evalWrite(tmpCommandSet.evalwrite, PastQueryValue, deviceId);
          self.controller.evalDo(tmpCommandSet.evaldo, PastQueryValue, deviceId);

        }// Ton-O  Below seems to be a bug in directoryhandler: calling evalnext while handling an itemaction
        //         it may result in random jumps based on not propery initialised commandsetIndex
        if (commandSetIndex<=self.feederH[self.currentFeederIndex].commandset.length) {
           self.evalNext(deviceId, self.feederH[self.currentFeederIndex].commandset[commandSetIndex].evalnext, PastQueryValue, params.browseIdentifier);//assign the good value to know the feeder
          }else { 
            metaLog({type:LOG_TYPE.ERROR, content:'BUG commandSetIndex out of range: ' + JSON.stringify(params), deviceId:deviceId});
          }
        if (needSpecialcare.length > 1) { // Store result of Search into variable: save it and expose it
          self.controller.vault.writeVariable("KEYBOARDSEARCH", self.keyboardBuffer, deviceId);
        }
      }
      else {
        //console.log("navigating else branch");
        if (params.history != undefined && params.history.length>0 && params.offset==0 && self.previousOffset == 0) {//case where we browse backward
          self.currentFeederIndex = self.browseHistory[params.history.length];
          if (self.currentFeederIndex==undefined)
            self.currentFeederIndex = 0;
          metaLog({type:LOG_TYPE.VERBOSE, content:'current feeder' + self.currentFeederIndex, deviceId:deviceId});
        }
        else if ( params.offset != undefined && params.offset>0)  {
          //console.log("offset > 0")
          self.previousOffset = params.offset;
        }
        else if ( params.offset != undefined && params.offset==0 && self.previousOffset > 0) //we were scrolling and get back to begining of list either by up scroll or back button
          {//console.log("Refresh list by user");
            self.previousOffset = 0;}
        else {
          //console.log("last resort")
          self.currentFeederIndex = 0 
        }
     } // beginning
      if (params.history != undefined) {
        if (self.browseHistory.length<params.history.length) {
          self.browseHistory.push(self.currentFeederIndex) //memorize the path of browsing for feeder 
        }
        else {self.browseHistory[params.history.length] = self.currentFeederIndex}
      }

      self.actionId = undefined;          
      self.fetchCurrentList(deviceId, self.feederH[self.currentFeederIndex], params)
          .then((list) => {resolve(list);})
          .catch((err) => { reject(err); });

      });
    };

    this.fetchCurrentList = function (deviceId, allconfigs, params) {
      // This function processes all the entries retrieved and creates directory-enmtries from them 
      metaLog({type:LOG_TYPE.VERBOSE, content:"params: " + JSON.stringify(params) + " - browseIdentifier: " + params.browseIdentifier + " - actionIdentifier: " + params.actionIdentifier + " - current feeder: " + self.currentFeederIndex, deviceId:deviceId});
      self.cacheList = [];
      return new Promise(function (resolve, reject) {
//        self.currentCommandResult = [];//initialise as new commands will be done now.
        // Ton-o keyboardsearch <----- Most of the code for keyboardsearch is added here. 
        // For keyboardsearch an extra initial processing phase is added: creating a SMART list out of all entries in self.cacheList
        // This list is cached in a new array: ResultItems that lives alongside self.cacheList, but is used when dealing with keyboardsearch
        // The normal (old) processing is then executed as second stage, now collecting entries from ResultList, flagging browse&actionidentifier as "SearchID=" so we know elsewhere the content is from ResultList   
        try {
           
          self.fillTheList(deviceId, allconfigs, params, 0, 0).then(() => {//self.cacheList, allconfigs, params, indentCommand
            metaLog({type:LOG_TYPE.VERBOSE, content:"params: " + JSON.stringify(params) + " - browseIdentifier: " + params.browseIdentifier + " - actionIdentifier: " + params.actionIdentifier + " - current feeder: " + self.currentFeederIndex, deviceId:deviceId});
            //Feed the neeo list
            self.ResultItems = []
            // End search
            var i;
            var FirstBuffer ;
            var RESULTENTRIES ;
            var NextEntry;
            var reLoop = false;
            var inBrowseList = [] // Array is a temp cache to eliminate duplicate entries with keyboardsearch

            if (self.cacheList.length > 0&&self.cacheList[0].itemtype == 'keyboardsearch')  { //Extra stage is only required if we have a keyboardsearch 
              //console.log("NewKeyboardSearch");
              try {
              self.ResultItems = []
              let KeyboardLen = self.keyboardBuffer.length;
              var reg;
              var found;
              var ExtraChars
              // Here we are adding the "Back-entry"....
              self.ResultItems.push({"SEARCHPARM":"**BACK**","RESULTENTRIES":-1,"NAMEFOUND":"**BACK**","ACTION":"BACK"})

              if (KeyboardLen) {
                reg =  RegExp('\\b'+self.keyboardBuffer,'gi')
                ExtraChars = 1;
              }
              else { 
//                reg = RegExp('\\b[A-Z0-9]','g')
                reg = RegExp('^.','g')
                ExtraChars = 0;
              }
              for (i = 0; i < self.cacheList.length-1; i++) {
                let curEntry = ((typeof(self.cacheList[i].myPastQuery) == 'string')?self.cacheList[i].myPastQuery:JSON.stringify(self.cacheList[i].myPastQuery))
                do 
                  {found = reg.exec(curEntry);
                    if (found) {
                      let ResultSoFar = curEntry.substring(found.index,found.index+found[0].length+ExtraChars).toUpperCase()
                      let AlreadyThere = self.ResultItems.findIndex((entry)  => {
                          return ResultSoFar == entry.SEARCHPARM.toUpperCase()})
                      if (AlreadyThere==-1) 
                        self.ResultItems.push({"SEARCHPARM":ResultSoFar,"RESULTENTRIES":1,"NAMEFOUND":curEntry,"ACTION":self.cacheList[i].action})
                      else
                        self.ResultItems[AlreadyThere].RESULTENTRIES=self.ResultItems[AlreadyThere].RESULTENTRIES+1;
                      
                    }
                  }
                while (found);
              }
            self.ResultItems.sort(function(a, b){
              if(a.SEARCHPARM < b.SEARCHPARM) { return -1; }
              if(a.SEARCHPARM > b.SEARCHPARM) { return 1; }
              return 0;
          });

            }
            catch(err){metaLog({type:LOG_TYPE.VERBOSE, content:"Error in KeyBoardSearch: "+err})}
            }

            // KEYBOARDSEARCH: Now that we've established proper keyboard-entries (and know the number of them), 
            // we can create a directory 
            // 
            let neeoList;
            let UsedNrItems = (self.cacheList.length > 0 &&self.cacheList[0].itemtype == 'keyboardsearch')?self.ResultItems.length:self.cacheList.length;

            neeoList = neeoapi.buildBrowseList({
              title: allconfigs.name,
              totalMatchingItems: UsedNrItems,
              limit: 64,
              offset: (params.offset || 0),
            });
            // populate the directory as usual from cachelist, except for keyboard, we then use ResultItems
            for (i = (params.offset || 0); (i < ((params.offset || 0) + 64) && (i < UsedNrItems)); i++) {
              // Ton-o keyboardsearch done for now 
              if (self.cacheList[i].itemtype == 'tile') {
                let tiles = [];
                tiles.push({
                    thumbnailUri: self.cacheList[i].image,
                    actionIdentifier: self.cacheList[i].action, //For support of index
                    uiAction: self.cacheList[i].UI ? self.cacheList[i].UI : ''
                })
                if ((i+1 < self.cacheList.length) && (self.cacheList[i+1].itemtype == 'tile')) {
                  //test if the next item is also a tile to put on the right, if it is not the end of the list
                  i++
                  tiles.push({
                    thumbnailUri: self.cacheList[i].image,
                    actionIdentifier: self.cacheList[i].action,
                    uiAction: self.cacheList[i].UI ? self.cacheList[i].UI : ''
                  });
                }
                neeoList.addListTiles(tiles);
              }
              else if (self.cacheList[i].itemtype == 'button') {
                let buttonLine = [];
                buttonLine.push({title:self.cacheList[i].name, uiAction:self.cacheList[i].UI,iconName:self.cacheList[i].image,inverse:self.cacheList[i].inverse,actionIdentifier:self.cacheList[i].action});
                if (self.cacheList[i+1] && self.cacheList[i+1].itemtype == "button" && self.cacheList[i+2] && self.cacheList[i+2].itemtype == "button") {
                  buttonLine.push({title:self.cacheList[i+1].name, uiAction:self.cacheList[i].UI,iconName:self.cacheList[i+1].image,inverse:self.cacheList[i+1].inverse,actionIdentifier:self.cacheList[i+1].action});
                  buttonLine.push({title:self.cacheList[i+2].name, uiAction:self.cacheList[i].UI,iconName:self.cacheList[i+2].image,inverse:self.cacheList[i+2].inverse,actionIdentifier:self.cacheList[i+2].action});
                  i=i+2;
                }
                if (self.cacheList[i+1] && self.cacheList[i+1].itemtype == "button") {
                  buttonLine.push({title:self.cacheList[i+1].name, uiAction:self.cacheList[i].UI,iconName:self.cacheList[i+1].image,inverse:(self.cacheList[i+1].UI?self.cacheList[i+1].UI:false),actionIdentifier:self.cacheList[i+1].action});
                  i=i+1;
                }
                neeoList.addListButtons(buttonLine);
             }
             // Ton-o Support for a header <----- 
              else if (self.cacheList[i].itemtype == 'header') {
                neeoList.addListHeader(
                  self.cacheList[i].name);
                }
                // Ton-o header done 
              else if (self.cacheList[i].itemtype == 'info') {
                neeoList.addListInfoItem({
                    title: self.cacheList[i].name,
                    text: self.cacheList[i].label,
                  });
                } 
                // Ton-o keyboardsearch <----- 
              else if (self.cacheList[i].itemtype == 'keyboardsearch')  {
                let theTitle = self.ResultItems[i].SEARCHPARM
                let theNrItems = self.ResultItems[i].RESULTENTRIES
                if (theNrItems==1) {theNrItems = "(Unique name)";theTitle = self.ResultItems[i].NAMEFOUND}
                else theNrItems = "("+(theNrItems) + "hits)";
                // Check if this item is already in the list (duplicate suppression)
                let alreadyInList = inBrowseList.findIndex((feed) => {return (feed == theTitle)})
                if (alreadyInList == -1 ) {  
                  neeoList.addListItem({
                    title: theTitle,
                    label: theNrItems,
                    thumbnailUri: self.cacheList[i].image,
                    actionIdentifier: (self.ResultItems[i].ACTION!="")?self.ResultItems[i].ACTION+"$SearchID="+i:"", //For support of index
                    browseIdentifier:self.cacheList[i].browse+"$SearchID="+i, // and signal this entry is keyboardsearch
                    uiAction:  'reload'//uiAction: ""
                  });
                  inBrowseList.push(theTitle)  // Signal that this item is now in the list (for duplicuate suppression)
                } 
              }
              // Ton-o keyboardsearch done for now
              else { // Ton-O Fix uiAction: NEEO-API only inspects listitems for uiAction if itemaction is filled 
                neeoList.addListItem({
                title: self.cacheList[i].name,
                label: self.cacheList[i].label,
                thumbnailUri: self.cacheList[i].image,
                actionIdentifier: (self.cacheList[i].action!=undefined&&self.cacheList[i].action!="")?self.cacheList[i].action:self.cacheList[i].UI,
//                actionIdentifier: (self.cacheList[i].UI!=undefined&&self.cacheList[i].UI!="")?(self.cacheList[i].action!=undefined&&self.cacheList[i].action!="")?self.cacheList[i].action:self.cacheList[i].UI:"", //For support of index
                browseIdentifier: self.cacheList[i].browse,
                uiAction: self.cacheList[i].UI ? self.cacheList[i].UI : ((self.cacheList[i].action != '' || self.cacheList[i].action != undefined) ? '' : 'reload'),
              }); // so added 
             }
            }
            resolve(neeoList);
          })
        }
        catch (err) {
          metaLog({type:LOG_TYPE.ERROR, content:'Problem refreshing the list', deviceId:deviceId});
        }
      })
    }

    this.fillTheList = function (deviceId, allconfigs, params, indentCommand) {
        let rAction;
        let rUI;
        let rInverse;
        let rBrowse;
        let rName;
        let rItemType;
        let rImage;
        let rLabel;
        return new Promise(function (resolve, reject) {
          if (allconfigs != undefined &&indentCommand < allconfigs.commandset.length) {
            //new july 2021
            //self.cacheList, allconfigs, params, indentCommand
            let commandSet = allconfigs.commandset[indentCommand];
            let processedCommand = self.controller.vault.readVariables(commandSet.command, deviceId);
            processedCommand = self.controller.assignTo(BROWSEID, processedCommand, params.browseIdentifier);
            metaLog({type:LOG_TYPE.DEBUG, content:'Final processed Command:', deviceId:deviceId});
            metaLog({type:LOG_TYPE.DEBUG, content:processedCommand, deviceId:deviceId});
            // Ton-O Keyboardsearch <--- added cache for keyboardsearch, no need for repetitive reads during keyboard-processing
            // need to add expiration for cache
            if (commandSet.itemtype == 'keyboardsearch') {
              let tempBuffer = self.controller.vault.readVariables("$KEYBOARDSEARCH", deviceId)
              if (self.keyboardBuffer == "**BACK**") {  // This is a special case where we remove 1 char from the keyboard search
                if (tempBuffer.length >0) {
                  self.keyboardBuffer = tempBuffer.substring(0,tempBuffer.length-1)     
                  self.controller.vault.writeVariable("KEYBOARDSEARCH", self.keyboardBuffer, deviceId); 
                }
                else
                  self.keyboardBuffer = tempBuffer
              }
              else
                  self.keyboardBuffer = tempBuffer
            }
            let ExecprocessedCommandType = commandSet.type;  // prepare normal execution
            let ExecprocessedCommand = processedCommand;  // prepare normal execution
            let QueryCached = false
            if (commandSet.itemtype == 'keyboardsearch'&& commandSet.type!="static") {  
              if (self.LastSearchQuery == processedCommand) { // did we do the same query already before?
                ExecprocessedCommandType = 'static'  // trick the command processor, provide empty command 
                ExecprocessedCommand = '{}'
                QueryCached = true                  // And set signal that we used this trick.
                metaLog({type:LOG_TYPE.VERBOSE, content:'Changing repeated query into static {}', deviceId:deviceId});
              }
            }
             metaLog({type:LOG_TYPE.VERBOSE, content:'Executing command '+ExecprocessedCommand, deviceId:deviceId})
            self.controller.commandProcessor(ExecprocessedCommand, ExecprocessedCommandType, deviceId)
            // Ton-O Keyboardsearch done
            .then((result) => {    
              metaLog({type:LOG_TYPE.DEBUG, content:'result', deviceId:deviceId})
              metaLog({type:LOG_TYPE.DEBUG, content:result, deviceId:deviceId})
              if (QueryCached) {
                  result = self.LastSearchQueryResult
                  try {
                  metaLog({type:LOG_TYPE.VERBOSE, content:'Using cached result; length='+result.length, deviceId:deviceId});
                  }
                  catch (err) {metaLog({type:LOG_TYPE.ERROR, content:'Error '+err, deviceId:deviceId});}
                }
                else if (commandSet.itemtype == 'keyboardsearch'&&commandSet.type !='static') {    //for all but static, cache result
                  self.LastSearchQuery = processedCommand;
                  self.LastSearchQueryResult = result;
                  let x = process.hrtime();
                  self.LastSearchQueryTimestamp = x[0];
                  metaLog({type:LOG_TYPE.VERBOSE, content:'Caching result; length='+result.length, deviceId:deviceId});
                }
                            // Ton-O Keyboardsearch done

                rName = self.controller.vault.readVariables(commandSet.itemname, deviceId); //ensure that the item name chain has the variable interpreted (except $Result)
                rImage = self.controller.vault.readVariables(commandSet.itemimage, deviceId); 
                rItemType = self.controller.vault.readVariables(commandSet.itemtype, deviceId); 
                rLabel = self.controller.vault.readVariables(commandSet.itemlabel, deviceId); 
                rAction = self.controller.vault.readVariables(commandSet.itemaction, deviceId); 
                rUI = self.controller.vault.readVariables(commandSet.itemUI, deviceId); 
                rInverse = self.controller.vault.readVariables(commandSet.iteminverse, deviceId); 
                rBrowse = self.controller.vault.readVariables(commandSet.itembrowse, deviceId); 
                self.controller.queryProcessor(result, commandSet.queryresult, commandSet.type, deviceId).then ((tempResultList) => {
                  let resultList = [];
                  metaLog({type:LOG_TYPE.DEBUG, content:'queryprocessor done', deviceId:deviceId})
                  metaLog({type:LOG_TYPE.DEBUG, content:tempResultList, deviceId:deviceId})
                  if (commandSet.itemtype == 'csv') {    //for all but static, cache result
                    metaLog({type:LOG_TYPE.VERBOSE, content:'csv, now processing result', deviceId:deviceId})
                    metaLog({type:LOG_TYPE.DEBUG, content:tempResultList, deviceId:deviceId})
                      let bb;
                      if (!Array.isArray(tempResultList)) 
                         bb = tempResultList.split(",")
                      else
                         bb = tempResultList[0].split(",")
                      for (let thepos = 0;thepos < bb.length;thepos++) {
                        resultList.push(bb[thepos])
                      }
                    }
                  else 
                  if (!Array.isArray(tempResultList)) {//must be an array so make it an array if not
                    metaLog({type:LOG_TYPE.VERBOSE, content:'Not an array,converting to array', deviceId:deviceId}) 
                    try {metaLog({type:LOG_TYPE.DEBUG, content:'Trying JSON.parse first', deviceId:deviceId}) 
                      let bb = JSON.parse(tempResultList)
                      resultList=bb;
                    } 
                    catch (err) {metaLog({type:LOG_TYPE.ERROR,content:"JSON.parse did not work "+err});
                                if (tempResultList) 
                                    resultList.push(tempResultList);
                    }
                  }
                  else {resultList = tempResultList;
                    metaLog({type:LOG_TYPE.DEBUG, content:'Processing an array', deviceId:deviceId})
                  }
                  metaLog({type:LOG_TYPE.VERBOSE, content:'Processing result (is an array)', deviceId:deviceId})
                  metaLog({type:LOG_TYPE.DEBUG, content:resultList, deviceId:deviceId})
                  metaLog({type:LOG_TYPE.DEBUG, content:resultList.length, deviceId:deviceId})
                  //resultList.forEach(oneItemResult => { //As in this case, $Result is a table, transform $Result to get every part of the table as one $Result
                  for (var i = 0; i < resultList.length; i++){
                    let oneItemResult=resultList[i];
                    let action = undefined;
                    if (rAction) {
                      let valAction = self.controller.assignTo(RESULT, rAction, oneItemResult);
                      if (valAction != undefined) {
                         action = valAction+"$CommandSet="+indentCommand+"$PastQueryId=" + (self.cacheList.length);
                      }
                    }
                    //new Oct 2021
                    // Ton-O added  inverse as keyword in device-driver, so we can use both UIAction and button inverse
                    var cacheListItem = {
                      'myPastQuery' : ((typeof(oneItemResult) == 'string')?oneItemResult:JSON.stringify(oneItemResult)),
                      'name' : self.controller.assignTo(RESULT, rName, oneItemResult),
                      'image' : self.controller.assignTo(RESULT, rImage, oneItemResult),
                      'itemtype' : rItemType,
                      'label' : self.controller.assignTo(RESULT, rLabel, oneItemResult),
                      'action' : action,
                      'UI' : rUI ? self.controller.assignTo(RESULT, rUI, oneItemResult):"",
                      'inverse' : rInverse ? self.controller.assignTo(RESULT, rInverse, oneItemResult):"",
                      'browse' : "$CommandSet="+indentCommand+"$PastQueryId=" + (self.cacheList.length)
                    };

                    cacheListItem = JSON.stringify(cacheListItem);
                    metaLog({type:LOG_TYPE.DEBUG, content:'Adding entry', deviceId:deviceId})

                    cacheListItem = cacheListItem.replace(/\$ListIndex/g, self.cacheList.length);
                    metaLog({type:LOG_TYPE.DEBUG, content:cacheListItem, deviceId:deviceId})
                    cacheListItem = JSON.parse(cacheListItem);
                    self.cacheList.push(cacheListItem);

                  }//);
                  resolve(self.fillTheList(deviceId, allconfigs, params, indentCommand + 1));
                })

                
              })
              .catch(function (err) {
                metaLog({type:LOG_TYPE.ERROR, content:'Fetching Error', deviceId:deviceId});
                metaLog({type:LOG_TYPE.ERROR, content:err, deviceId:deviceId});
              });
          }
          else {                  
            resolve(self.cacheList);
          }
        })
    }
    
  

    this.handleAction = function (deviceId, params) {
      return new Promise(function (resolve, reject) {
        self.handleCurrentAction(deviceId, params)
          .then((action) => { resolve(action); })
          .catch((err) => { reject(err); });
      });
    };

    this.handleCurrentAction = function (deviceId, params) {
      metaLog({type:LOG_TYPE.INFO, content:'Handle directory action: ', deviceId:deviceId});
      metaLog({type:LOG_TYPE.INFO, content:params, deviceId:deviceId});

      return new Promise(function (resolve, reject) {
        //here, the action identifier is the result.  
        // Ton-O Keyboardsearch <--- Check to see if we have the result of a keybiardsearch
        var needSpecialcare = params.actionIdentifier.split("$SearchID="); //<------- 
        var SearchQueryValue;var SearchQueryId;

      if (params.actionIdentifier!= undefined && params.actionIdentifier != undefined) {
        if (needSpecialcare.length > 1) { // yes
          SearchQueryId = needSpecialcare[1]
          params.actionIdentifier = needSpecialcare[0]; // restore original param
          let theResultEntry = self.ResultItems[SearchQueryId]
          SearchQueryValue = theResultEntry
          if (theResultEntry.RESULTENTRIES==1) {
           self.keyboardBuffer = theResultEntry.NAMEFOUND
           theResultEntry.SEARCHPARM = theResultEntry.NAMEFOUND // Only one found, set setsearchparm to full name
          }
          else 
           self.keyboardBuffer = theResultEntry.SEARCHPARM
        }
      }// Ton-O Keyboardsearch done
        let PastQueryId = params.actionIdentifier.split("$PastQueryId=")[1];
        self.actionId = PastQueryId;
        // Ton-O Keyboardsearch <--- 
        let PastQueryValue;  // Pastqueryvalue will be filled with either:
        if (needSpecialcare.length>1) {   // The result of the keyboard search so far
          metaLog({type:LOG_TYPE.VERBOSE, content:'Using result from Search keyboard: ', deviceId:deviceId});
          metaLog({type:LOG_TYPE.VERBOSE, content:SearchQueryValue, deviceId:deviceId});
          PastQueryValue = SearchQueryValue  //So fill it with the value from SearchQueryValue
        }
        else 
          PastQueryValue = self.cacheList[PastQueryId].myPastQuery; // Or it's normal value, obtained from browseidentifier
        // Ton-O Keyboardsearch done
        //MQTT Logging
        self.controller.commandProcessor("{\"topic\":\"" + settings.mqtt_topic + self.controller.name + "/" + deviceId + "/directory/" + self.name + "\",\"message\":\"" + PastQueryId + "\", \"options\":\"{\\\"retain\\\":true}\"}", MQTT, deviceId)
        params.actionIdentifier = params.actionIdentifier.split("$PastQueryId=")[0];
        let commandSetIndex = params.actionIdentifier.split("$CommandSet=")[1];
        //self.commandSetIndex = commandSetIndex;
        params.actionIdentifier = params.actionIdentifier.split("$CommandSet=")[0];
        if (self.feederH[self.currentFeederIndex].commandset[commandSetIndex]) {
          let tmpCommandSet = JSON.stringify(self.feederH[self.currentFeederIndex].commandset[commandSetIndex]);
          tmpCommandSet = tmpCommandSet.replace(/\$ListIndex/g, PastQueryId);
          tmpCommandSet = JSON.parse(tmpCommandSet);
/*          // Ton-O Keyboardsearch <--- Seems to be a bug...... evalnext when handling an itemaction
          if (params.actionIdentifier==undefined||params.actionIdentifier=='') // bug!! don't do evalnext when itemaction is filled in
            self.evalNext(deviceId, self.feederH[self.currentFeederIndex].commandset[commandSetIndex].evalnext, PastQueryValue, params.browseIdentifier);//assign the good value to know the feeder
          else {
            metaLog({type:LOG_TYPE.ERROR, content:"BUG: evalnext with itemaction suppressed:" + params.actionIdentifier, deviceId:deviceId});
            metaLog({type:LOG_TYPE.ERROR, content:self.feederH[self.currentFeederIndex].commandset[commandSetIndex].evalnext, deviceId:deviceId});
          }
          // Ton-O Keyboardsearch <--- Use SearchQueryValue in-stead of PastQueryValue (ResultList vs CacheList)
          */
          if (needSpecialcare.length > 1) {
            self.controller.evalWrite(tmpCommandSet.evalwrite, SearchQueryValue.SEARCHPARM, deviceId);
          }
          else
            self.controller.evalWrite(tmpCommandSet.evalwrite, PastQueryValue, deviceId);

        }
        //finding the feeder which is actually an action feeder
        let ActionIndex = self.feederH.findIndex((feed) => {return (feed.name == params.actionIdentifier)});

        //Processing all commandset recursively
        if (ActionIndex>=0){
          let tmpActionCommandSet = JSON.stringify(self.feederH[ActionIndex].commandset);
          tmpActionCommandSet = tmpActionCommandSet.replace(/\$ListIndex/g, PastQueryId);
          tmpActionCommandSet = JSON.parse(tmpActionCommandSet);
          resolve(self.executeAllActions(deviceId, PastQueryValue, tmpActionCommandSet, 0));
        }
      });
    };

    this.executeAllActions = function (deviceId, PastQueryValue, allCommandSet, indexCommand) {
      return new Promise(function (resolve, reject) {
        if (indexCommand < allCommandSet.length){
          let commandSet = allCommandSet[indexCommand]; 
          let processedCommand = commandSet.command;
          processedCommand = self.controller.vault.readVariables(processedCommand, deviceId);
          processedCommand = self.controller.assignTo(RESULT, processedCommand, PastQueryValue);
          metaLog({type:LOG_TYPE.VERBOSE, content:processedCommand, deviceId:deviceId});
          self.controller.commandProcessor(processedCommand, commandSet.type, deviceId)
            .then((resultC) => {
          
              self.controller.queryProcessor(resultC, commandSet.queryresult, commandSet.type, deviceId)
              .then ((result) => {

                self.controller.evalWrite(commandSet.evalwrite, result, deviceId);
                self.controller.evalDo(commandSet.evaldo, result, deviceId); 

                resolve(self.executeAllActions(deviceId, result, allCommandSet, indexCommand+1))
              })
              .catch ((err) => {
                metaLog({type:LOG_TYPE.ERROR, content:"Error while parsing the command result.", deviceId:deviceId});
                metaLog({type:LOG_TYPE.ERROR, content:err, deviceId:deviceId});
                resolve(err);
              })
          })
        }
        else
        {
          resolve(); 
        } 
      })           
    };
  }
}
exports.directoryHelper = directoryHelper;
