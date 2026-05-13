# META-PLUS... the evolution of META towards more functionality and interoperability with Brain.
As in the global README fioe can be read, this is the evolution of JAC's masterpiece Meta; it can be seen as a fork of his work, but going it's own direction.  
NEEO-Meta-Plus is used by me primarily for my own needs. Caring is sharing, so I've also created this github repository for it.
## META-Brain
I've also invested a lot of time in it's big sister, META-Brain. 
META-Brain is specialized firmware to run a virtualised Brain, using the same NEEO-remote (TR2) and associated project-files.
More over META-Brain in it's own repository:  [MetaBrain repository](https://github.com/Ton-O/MetaBrain).
## How to use Meta-Plus
I'm using Meta-plus and Brain purely as virtual Docker containers.
Starting Meta, we used the physical NEEO brain and ran Meta on it. 
Being a device that originated long ago, its hardware however, isn't up to that task, so we switched to using a Raspberry Pi. 
When Docker became popular, I developed custom images to run both comoponents as Docker Images.
I now run three parallel Meta-environments in Docker, that replaced the three physical brains and Raspberry PI's (The three old Physical brains are still there, as a backup, but rarely active anymore).
# How to setup Docker
As I'm using this repository for my own use, it reflects my usage of Brain and Meta; as docker images.  
to start with, the docker-compose.yml file is key (in my configuration) for running a docker image. The file in the Documentation directory shows exactly what is needed to run this. If your new to docker then please note that I'm not here to teach you Docker and that I'm not a teacher. I expect some basic knowledge of Docker from you before jumping into this adventure. 
Docker containers run mainly as "isolated systems on yourn physical host". A such, they are highly unaware of whats happening in your host-enviroment.
If you want the container to use some of your host-resurces (other than RAM and CPU), you must configure these resources in your main configuration file of the container: docker-compose.yml . In that file, you place the relationships that your container has with your host; in essence: you draw a specific picture of parts of your Host environment for your container and choose how the container sees that world.
Put nearly nothjing in the file and the container will not see much of your Host; add entries like "volumes" in there and you allow the container to see a file or directory of your host under the name and location that YOU specify.


Enough teaching on Docker, below a breakdown of interesting parts of that file:
1. **image: tonot1/neeo-meta-plus**; this will tell docker to use the "latest stable" image of meta-plus
2. **container_name: MetaBeta**; Just for your own recognisability, the name of the container in docker
3. **privileged: true**; optional but required when you want to use Avahi for discovering devices.
4. **volumes**; the bridge between your own Host environment and what the docker container will see. You HAVE to have some entries here:
  - **- <local path on your docker host/active>:/opt/meta/active**; This will hold al of your active Meta-drivers. I just fill in a previosuly defined path on my Host computer (the left part before the colon), the right part HAS to be **/opt/meta/active** as Meta-Plus looks there for the drivers.   
  - **- <local path on your docker host/cloud>:/opt/meta/NoCloud**; Meta-Plus also functions as the host for NEEO-objects now that NEEO-cloud has ended.
  - **- /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket**; needed if you want to run Avahi-discovery
  - **- /etc/timezone:/etc/timezone:ro**; use time from your host. Please note that Docker images run with their own timezone, so you might see 1 or 2 (or more hours discrepancy with the time on your host; you can change the timezone on your container, I just live with the fixed 2 hours difference.
5. **hostname: MetaBeta** I like to have the hostname of the system representative of its function. Furthermore, the Brain firmware uses it quite often defining keys for a system or device; preferably, use the same hostname as your current Meta installation uses.
6. **networks**; this one is very important as it defines the address and visibility of this Meta-Plus instance. You can either use the same ip-address (network_mode: "host") or use a "meta-vlan" (where meta happens to be the name that Docker also uses;-)). If you start, you could suffice with network_mode: host; your Meta-plus environment will then be available at <host-ip-address:4015>
7. for the more sophisticated way of networking, I've added some extra parameters in docker-compose.yml.
8. **environment**; here you need to set some parameters that allow Meta-Plus to connect to your (physical or virtual) Brain:
  - **- BrainIP='192.168.73.110'**; simple, just put the IP-address of your Brain here
  i **- Severity=QUIET**; this instructs meta to be as quiet as possible in its messaging. Thats fine when everythingis up and running dfine, but to start with, I suggest to use this **- Severity=VERBOSE** in-stead.

9. Then the file **settings.js**; this file controls some of the internal behavior of Meta-Plus. Leave it as is works fine. If you want integration with other systems (f.e. Home Assistant or Node-red), you need to fill in a topic at   'mqtt' : 'localhost',
  'mqtt_topic' : '',; I personally use Home Assistant but do not integrate with it and although Node-red is powerful, I find it a terrible system to use, so abondoned it.   

Okay, once this file is created and filled with (hopefully) the correct values, you can start the Docker container by using this command:
**docker compose up -d**
This starts the container with Meta-Plus running as a backgroound container (by means of the -d keyword).
You should now have a container running Meta-Plus; if all went well, you can startup a console (a Linix shell) in it or look at its message log.
I use Portainer to do all of that, but your may have your own ways.
When you open the console, you can look at messages from each component by means of the pm2 log xx (where xx is the ID PM2 assigned to htat component, see pm2 l for all id's). As this is not a lesson on how to control PM2 or even on Meta-Plus (it's just a tutortial opn how to set it ip), I'll stop here. 
If you think meta is running fine and not aborting periodically, you can check your Brain which SDK-adapters are running (via its WEB-interface, Brain Settings, Brain SDK integration).
Now you can add drivers to it. To do so, I suggest to copy the MetaCore.json driver to the /opt/meta/active di`rectoryn and to restart meta (by restarting the container or within the container, restart Meta-Plus via PM2 with pm2 restart 0; 0 as the meta-component mostly runs as 0). You can then use your NEEO remote to control Meta (add/remove drivers, restart, set logging etc).
If you add a driver (like MetaCore), you HAVE to restart meta so that Meta-Plus picks up the new driver. Note that "Meta-Plus picks up the driver" only means that Meta-Plus now KNOWS about the driver. You then can add a **device** using that driver so that you can actually use your NEEO remote to control it.

## It doesn't work, what now...
I stimulate you to read the documents that I created, once more and study them carefully.
Always work precisely and follow a structured approach to see whats working and what not.
- Is meta actually running okay?
- Is there a problem with 1 driver/device or all of the ones serviced by Meta?
- Does Brain sees the Meta-Plus (as an SDK-integration)? You can remove unused SDK's within Brains Settings and restart Meta to see if it popups again.
- Look at the logs produced for errors.
- Increase then Loglevel (either by using metacore if that works or by setting (a global or component specific) loglevel in logComponents.json)

- You can always ask for help, but note that I have a live of my own and that I'm doing this voluntary... 
