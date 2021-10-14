### Modifications / addons for NEEO/META
## What's this?

This repository contains my modifications/addons for JAC459's meta (https://github.com/jac459/meta).
I've placed this information on Github to save it and share it for others. Feel free to use it and don't hesitate to ask any questions, but use it at your own risk.

## Additions:
# PythonManager.py
This module is a standalone module that was included as integral part of meta, but was abondoned by the owner of META.
As it delivers functions that used to be included, but don't work anymore (or completely different), I decided to release this module so it can be use dby others as well.

This module acts as an external interface that can be called through http and delivers:
A) An interface to ADB, in order to control Android devices from your NEEO remote.
B) An interface to Broadlink that allows sending and learning Infrared codes. It can be fed with more than one protocol: native NEEO (Global Cache), Broadlink. This allows you to send Infrared via a small Broadlink device, connected wirelessly, making it possible to control devices that are ot of reach of your Brain; for example within a cabinet. 

## Modifications:
# Danger zone.....
This is the danger zone as it contains modified modules that may introduce instability. 
In all honesty, this risk is very low as no functions are changed, only code is added. Nevertheless, please remember this IS a risk. 
# MetaController.js and ProcessingManager.js
Both modules contain modifications on the meta-versions delivered by JAC459 for one single functinality: fixing the sometimes incorrectly working discovery procedure used in native meta. 
I've developed the KODI-driver for Meta and have received multile reports of people not being able to discover their KODI-instances. According to my analysis, the used procerdure by meta is the main reason for this. This issue is reported to the owner of meta and might be fixed in the future or it may stay this way.  So I added another discovery-meth9d to meta, that is much more succesful. 
This required extra code to meta that is included in these two modules.
I will do my best to keep changres minimally and up-to-date when new version of meta will be released, but cannot guaranty 100% compatibility  over all new releases. 

## Prerequisites
# PythonManager
Pythonmanager relies on a couple of packages to perform its work:
- Flask; for hosting the webserver so you can connect to PythonManager
- ADB_shell; the actual work horse that does all the ADB work
- Broadlink-python; the interface that does most of the work contacting BRoadlink devices
- PM2; Strictly not required, you can start PythonManager in multiple ways. But PM2 is probably in use for meta already.
# MetaController.js and ProcessingManager.js
These have Tinkerhub-mdns as prerequisiste.

## Install
# PythonManager
Simply place Pythonmanager.py in the same location as meta.
Then  install the prereqs, running from the meta directory:
- pip install Flask 
- pip install adb_shell
- mkdir .Python-stuff&&mkdir .Python-stuff/python-broadlink&&cd .Python-stuff/python-broadlink&&git clone https://github.com/mjg59/python-broadlink&&python setup.py

Once done, and if you're planning to use ADB, you can generate a keypair that can be used by ADB (it's not a regular ssh keypair but a customized pair, specific for ADB):
- start python
- run this in the python intrpreter
from adb_shell.auth.keygen import keygen
keygen('/home/pi/meta/.ssh/adb_key')

Press enter and the key is generated. Pythonmanager.py assumes the key to be in /home/pi/.ssh, so if you have installed meta in another place, you need to alter paths while generating key and in PythonManager.py. 

Now it's time to setuo a startuo for PythonManager.py. I use PM2, and use the following command to setup the startup for it:
FLASK_APP=/home/pi/meta/PythonManager.py pm2 start   --name PythonManager python -- /usr/local/bin/flask run  --host=0.0.0.0 

Again, if you use other directories (or python3) make the necessary changes.
if you are sastisfied, you can make startup of PythonManager.py permanent by issuing pm2 save.  

# MetaController.js and ProcessingManager.js
Just copy these two modules over the existing ones, then fulfill the prerequisite by:
npm install tinkerhub-mdns

Restart meta and you should be good to go.

## How to use
ADB and Broadlink can be used to call them over http. Assuming meta is running as 192.168.0.100, yo can use http://192.168.0.100:5000?xxx.
The xxx part is described in the repositories from my custom drivers:
- https://github.com/Ton-O/NEEO-Meta-ADB
- 




