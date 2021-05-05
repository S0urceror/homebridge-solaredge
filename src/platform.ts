import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SolarEdgeStateAccessory, SolarEdgeEnergyAccessory } from './platformAccessory';
import fakegato from 'fakegato-history';
import Modbus, { ModbusTCPClient } from 'jsmodbus'
import { Socket, SocketConnectOpts } from 'net'
import {Client as MQTTClient, connect as mqtt_connect} from 'mqtt'
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ModbusHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly FakeGatoHistoryService: fakegato.FakeGatoHistoryService;

  public readonly modbus_client: ModbusTCPClient;
  public readonly modbus_socket: Socket;
  public readonly modbus_socket_options: SocketConnectOpts;
  public modbus_values: any;
  public readonly sunspec_inverter_start = 40071; //40069;
  public readonly sunspec_inverter_end = 40071+38; //40108;
  public modbus_interval: any;

  public readonly mqttclient: MQTTClient | null;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // initialise ModbusTCP
    ///////////////////////////////////////////////////////////////
    this.modbus_socket = new Socket();
    this.modbus_socket_options = {host: config.ip, port: config.port}
    this.modbus_client = new ModbusTCPClient(this.modbus_socket);
    // read the modbus inverter settings every 10 seconds
    this.modbus_socket.on('connect', (platform = this) => {
      // run for the first time
      platform.modbus_update (platform);
      // run every interval
      platform.modbus_interval = setInterval(() => {
        platform.modbus_update (platform);
      }, this.config.pollFrequency);
    });
    this.modbus_socket.on('close', (had_error, platform=this) => {
      if (had_error)
        platform.log.debug ("Error caused close");
      else {
        // reconnecting
        platform.log.info("Modbus connection lost");
        clearInterval (platform.modbus_interval);
        setTimeout(() => {
          platform.modbus_socket.connect(platform.modbus_socket_options);
          platform.log.info("Modbus reconnecting to", platform.config.ip);
        }, 5000);
      }
    })
    this.modbus_socket.connect(this.modbus_socket_options);

    // Add Elgato Eve history service
    ///////////////////////////////////////////////////////////////
    this.FakeGatoHistoryService = fakegato(this.api);
    
    // Initialise MQTT
    if (config.mqttServer)
      this.mqttclient = mqtt_connect(config.mqttServer);
    else
      this.mqttclient = null;

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });

    this.log.debug('Finished initializing platform:', this.config.name);
  }

  modbus_update (platform:ModbusHomebridgePlatform) {
    platform.modbus_client.readHoldingRegisters(platform.sunspec_inverter_start, this.sunspec_inverter_end-this.sunspec_inverter_start)
      .then(({ request, response }) => {
        platform.modbus_values = response.body.valuesAsArray;
      })
      .catch(platform.handleErrors)
  }

  handleErrors(err: any) {
    console.log (err);
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    // throw away accessories immediately
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessories);
    this.accessories.splice (0,this.accessories.length);

    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    
    // loop over the discovered devices and register each one if it has not already been registered
    var count=0;
    for (const device of this.config.devices) {
      count++;
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.name+"["+count+"]-"+this.config.ip);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (device.type=="state")
          new SolarEdgeStateAccessory(this, existingAccessory);
        if (device.type=="AC" || device.type=="DC")
          new SolarEdgeEnergyAccessory(this, existingAccessory,device.type);
        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        if (device.type=="state")
          new SolarEdgeStateAccessory(this, accessory);
        if (device.type=="AC" || device.type=="DC")
          new SolarEdgeEnergyAccessory(this, accessory,device.type);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
