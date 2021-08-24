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
This required exyra code to meta that is included in these two modules.
I will do my best to keep changres minimally and up-to-date when new version of meta will be released, but cannot guaranty 100% compatibility  over all new releases. 

## Install
to  be filled in.


