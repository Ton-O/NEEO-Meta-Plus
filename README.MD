# META-PLUS... the evolution of META towards more functionality and interoperability with Brain.
## Version 3.8.....
## I've been maintaining a fully working version Docker image, to make reproduction of META much simpler. This image runs perfectly on a X86-based Docker host.[Docker image](https://hub.docker.com/r/tonot1/neeo-meta-plus)
I have been making many, many changes to this alternative meta - a driver to utilize NEEO remotes with many custom device drivers.
These changes have now ben consolidated in new releases, starting with V2.0.
## What was changed (and why)?
Well, NEEO-public servers have been shutdown and with that, a number of "accidents" have started to occur.
I took a deep dive in the NEEO-firmware and made a number of changes that allow the NEEO-Brain and -remotes to keep working as they were.
Second, I made a number of additional protocols available to meta-plus (a more versatile MQTT, Websocket enhancements, Telnet and "some others".

One of the "others" is a very important one: dynamic loglevels.

With this version, you are now able to keep you meta-installation completely (well, 99.99%) silent (by the LOGLEVEL=QUIET parameter)), but in case of debugging required, you can set loglevels on each component dynamically through NEEO's remote WITHOUT making changes to meta or restarting it. To this end, one has a global loglevel (the one you set when starting meta) and allowing a loglevel per major component of meta-Plus; this includes loglevels for the Brain itself!! All of these loglevels can be set individually to the level that suits you best for debugging.
For this, changes have been made to the metaCore.json driver (of which the source is located in one of my [other repositories])(https://github.com/Ton-O/meta-driver-library).

Also, "some other changes" have been made to allow meta-Plus to run in docker (which was possible for a long time already, but now it's even easier).

And lastly, I've setup a Docker based version of the Brain..... This version has roughly 80% of the normal Brain functionality but the biggest advantage is that it is lightning fast compared to the dedicated hardware. Some hurdles still need to be taken (hence the 80% coverage), like ~~Infrared transmission,~~ easy connection of the Docker-Brain with the normal TR2; biggest issue is the functionality of the "network-chip in Brain", the JN5168-chip. That chip runs most of the wifi and related special functions but also controls via GPIO, the infraRed leds. But, I'm working on  it.
Infrared transmission is added now too, by using the well know Broadlink devices..... Comparing with the physical NEEO Braoin, the only part missing now is "pairing remote to Brain"(the JN5168-device; but I'm working on that one). 
<del>As this Docker Brain version is still experimental, I'm not releasing that, but it looks very promising.</del> 
After many months of running in my own environment perfectly (running continuously 3 brain environments in parallel: Beta, Test and Prod),  I have decided to make this Docker image publicly available at docxker hub [Docker image Brain](https://hub.docker.com/r/tonot1/neeobrain), and also the Github repository: [Github Brain](https://github.com/Ton-O/MetaBrain);    

### Please note: I've built this alternative version of Jac's masterpiece "meta" for my own purposes and I'm sharing it "as is" to others.... No commerical reasoning, therefore no strings attached as well. And you still need the NEEO hardware (namely the remote) so I'm not trying to outsmart NEEO (or its current owner CM). 

In order to get "free from the vanished NEEO-cloud", I made a number of changes to the Central Module of NEEO-brain, to reroute a number of critical cloud-accessess to local calls.
For that, I added functionality on meta-Plus to host a number of file types:
- pictures. 
- Firmware
- channels 
- devices (plus IR-info)

These objects are served as HTTP-objects  by the GoogleTV.js module (over port 6468).
In the same area, I added a protocol to execute NEEO-API calls. Examples are forcing refresh (clear cache) of pictures for the Renmote.  


==================== SNIP ====================
## What's version V1.1 and Why?
This new version of meta-plus builds upon the previous version (See 'Whats this??' below) but adds:
- adds a number of protocols that weren't in meta-plus before.
- improves a number of protocols tghat were in it already
- Supports "live after NEEO stopped their cloud servers"
## How can I get this new version?
I've created this version for my own needs, so the way I work with NEEO and meta is tested and facilitated by tools.
That means that meta runs "as designed" as a docker-image. Other installation methods will work as well, bit then you're on your own to get it set-up and configured.

So, to answer this question: just download the docker image from my repository on the docker hub, it complete replaces the image if you've got it running now already.  
You will have to make a modification to the cp6.js program from NEEO that runds on your brain. To be able to do so, your NEEO brain has to be hacked as described before. Then you can replace the file '/opt/cp6/cp6.js' by the new version provided here (<== not yet provided in thios repository)

## Whats this??
This repository contains an alternate version of meta, originally released by jac459 (https://github.com/jac459/meta).

## Why an alternate version? 
Good question! The original version of jac is excellent! In fact (credits where credits due...), I should add that it's a masterpiece... I bow for what he has achieved!!
So why an alternate one?
The reason is simple: just like me, jac develops meta mostly for his own needs, but shares the code to others so they can profit from it.
If he sees fit, he adds pieces to meta for others. I've created many additions to meta and offered them to be included into the original release of meta.

However, that process became too slow or requests weren't honored at all (which is the perogative from an author, of-course).

As these changes are essential for the drivers that I produce (especially for KODI), I started maintaining a separate verison of meta which included new releases from JAC and my own changes.
That became too much time-consuming, so I decided to take the current version of JAC's meta, duplicate that into my own github repository and stopped looking at the original meta as that basis fits all my needs.

In short: this meta-Plus is a copy of jAC's meta with a lot of extra functions that I see as necessary, but it is a one-time copy of the original version... the basis of meta-plus will not be kept in sync with the original meta.

## Why should I use an outdated version of meta?
Thats completely up to you! I'm not forcing you to do so;-). 
If you want to use drivers that I develop (KODI, ADB, Telnet, Broadlink, Tasmota) then you need Meta-Plus. if you're happy with the original meta, please use that one.
If you decide to use Meta-Plus, then you can get into issues in the future with drivers that are developed for the original meta. Not necessaryly, but it could.
But thats easily avoided: just keep your original meta running where it is and add Meta-Plus to a separate device so it can live together with its brother. Both can talk to the same NEEO (brain/remote/app) and an extra raspberry pi doesn't cost much nowadays (or use a virtual/docker machine).

## Why don't you just keep Meta-Plus in sync with Meta?
Though thats a good idea, there are some (good) reasons for not doing that:
- First it will take an awfull amount of time.
- Second, some changes are simply not compatible. Discovery for example is based on a totally different solution, yet is at the heart of meta.
- Third, the current version of meta is basically quite stable and hasn't been extended for months (though still containing bugs, a number that I fixed in Meta-Plus), so whats the need for it...
- Fourth: I did that for a long period, but there was no interest in the changes I offered to be integrated; so I've turned away from meta-development and started Meta-Plus.

## Can I use Meta-Plus and what support do you offer?
As said above, I've created Meta-Plus basically for myself so drivers like Kodi, ADB, Telnet and Tasmota can be used fully, not crippled.
Since I put all my work onto github, you are free to use it. It's free, I'm not going to ask you for donations (in fact, I've decline them in the past), the only thing I'm asking you is to tell me you are using it (ozothe clown et life dit com). 
If you experience any issues, you are welcome to report them through github-issues. I'm happy to look at them and try to fix them if I see fit, just do not expect gurantees.
Requests or questions on how to use Meta-Plus with newer versions of meta will not be accepted/answered. 

## Additions:
# PythonManager.py
This module is a standalone module that was included as integral part of metadriver, but was abondoned when JAC transformed metadiver into meta.
As it delivers functions that used to be included, but don't work anymore (or completely different), I decided to release this module so it can be used by others as well.

This module acts as an external interface that can be called through http and delivers: 

A) An interface to ADB, in order to control Android devices from your NEEO remote.  
B) An interface to Broadlink that allows sending and learning Infrared codes. It can be fed with more than one protocol: native NEEO (Global Cache), Broadlink. This allows you to send all kinds of Infrared-signals via a small Broadlink device, connected wirelessly, making it possible to control devices that are out of reach of your Brain; for example within a cabinet.

## Modifications:
# MetaController.js, ProcessingManager.js and directoryHelper.js
Changes in these modules will:
- add an alternative discovery method as the original one causes problems to many people
- add support for connections to multiple MQTT-brokers  
- add support for MQTT-gets without the need for a listener
- fix the missing cleanup routines for websocket and mqtt
- add suppport for listheaders in drectories
- add a smart search algorithm to browse through longer directory listings (used within KODI, but can be used in any driver).
- add support for telnet connections
- add support for ADB-connections over the network
- add support for sending and learning Infrared codes using both the brain and Broadlink-devices, using various formats; 
- .....

## Prerequisites
# PythonManager
Pythonmanager relies on a couple of packages to perform its work:
- Flask; for hosting the webserver so you can connect to PythonManager
- ADB_shell; the actual work horse that does all the ADB work
- Broadlink-python; the interface that does most of the work contacting BRoadlink devices
- PM2; Strictly not required, you can start PythonManager in multiple ways. But PM2 is probably in use for meta already.
# MetaController.js and ProcessingManager.js
These have Tinkerhub-mdns and Telnet-client as prerequisiste. Install them with npm install Tinkerhub-mdns and npm install Telnet-client

## Install (please note that I'm showing whats required, but that I'm creating an install-script that will automate all these steps)
# PythonManager
Simply place Pythonmanager.py in the same location as meta.
Then  install the prereqs, running from the meta directory:
- pip install Flask 
- pip install adb_shell
- mkdir .Python-stuff&&mkdir .Python-stuff/python-broadlink&&cd .Python-stuff/python-broadlink&&git clone https://github.com/mjg59/python-broadlink&&python setup.py

Once done, and if you're planning to use ADB, you can generate a keypair that can be used by ADB (it's not a regular ssh keypair but a customized pair, specific for ADB):
- start python
- run this in the python interpreter
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


## Update history
V3.5 added the METAREINIT feature.
With this feature, the new NEEOBrain firmware will detect a restart of an SDK (Like META Plus) and allows us to "re-initialize" devices at will.
This is activated per device, simply by means of the presence of a __MEAREINIT button in the driver. If that exists, each time the SDK is restarted, it will simulate the press of the __METAREINIT button for each device that is powered on.
This functionality is great to reduce the consequences of a restart of meta: Brain still has devices powered on, but meta isn't aware of that status. This would lead to missing connections, listeners not activated etc. The METAREINIT feature solves this.

V3.6 adds support for Android-based devices (through ADB) using the Chromecast device. Note this driver is not only for Chromecast/GoogleTV but adds generic support for Android devices.

V3.7 adds support for Broadlink new style. This makes drivers using Broadlink devices more in-line with other drivers. It also removes the Python based components, replacing them by Javascript too. 

V3.8 is moving from the outdated node.js V18 to the latest LTS verion of node.
