
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge SolarEdge plugin

The Homebridge SolarEdge plugin allows us to connect to our SolarEdge inverters. Or other SunSpec compatible inverters (untested).

It also supports Eve history for temperature, AC power and DC power.

## Setup

Make sure you have enabled ModbusTCP in your solaredge inverter. Then you have to get it's IP number. By default the inverter gets an IP number from your Wifi network. In my setup I have instructed my DHCP server to always give the same number and hostname. This way it gets a name in my LAN like solaredge.lan.


## Add the configuration to homebridge

See below an example configuration:
```
...
{
            "platform" : "SolarEdge",
            "name" : "SolarEdge",
            "manufacturer" : "SolarEdge",
            "model" : "2000",
            "serial" : "1234",
            "ip": "192.168.1.39",
            "port": "1502",
            "pollFrequency": 5000,
            "mqttServer": "mqtt://openwrt.lan",
            "devices" : 
            [
              {
                "name": "SolarEdge Temperature",
                "type": "state"
              },
              {
                "name": "SolarEdge AC power",
                "type": "AC"
              },
              {
                "name": "SolarEdge DC power",
                "type": "DC"
              }
            ]
        }
...
```

## Optionally MQTT

It is possible to specify a MQTT server to push the latest values to. This way you can for example display the actual values to a dashboard like Grafana. I leave that to you to figure out.

Subscribe to one of the following channels to get the current value:
```
SolarEdge/Temperature
SolarEdge/DCPower
SolarEdge/ACPower
```