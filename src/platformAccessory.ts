import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ModbusHomebridgePlatform } from './platform';
import { CurrentPowerConsumption, TotalPowerConsumption, ResetTotalPowerConsumption, Volt, Ampere } from './customCharacteristics';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SolarEdgeStateAccessory {
  private historyService;
  private temperatureService;
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */

  constructor(
    private readonly platform: ModbusHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, platform.config.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, platform.config.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, platform.config.serial);

    // get the TemperatureSensor service if it exists, otherwise create a new TemperatureSensor service
    // you can create multiple services for each accessory
    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
                              this.accessory.addService(this.platform.Service.TemperatureSensor);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/CurrentTemperature

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    // Add FakeGato history service
    this.historyService = new this.platform.FakeGatoHistoryService ('weather', this.accessory, {log:this.platform.log});

    setInterval(() => {
      const moment = Math.round(new Date().valueOf() / 1000);
      const temp = this.platform.modbus_values[40103-this.platform.sunspec_inverter_start]/100;
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temp);
      this.historyService.addEntry ({time:moment, temp: temp});

      // update mqtt
      if (this.platform.mqttclient) {
        this.platform.mqttclient.publish ('SolarEdge/Temperature', temp.toString());
      }
    }, 10000);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.
  */

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    const temp = this.platform.modbus_values[40103-this.platform.sunspec_inverter_start]/100;
    this.platform.log.debug('Get Characteristic CurrentTemperature ->', temp);
    return temp;
  }
}

export class SolarEdgeEnergyAccessory {
  private historyService;
  private outletService;
  private kWh = 0.00;

  constructor(
    private readonly platform: ModbusHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly acdc: string,
    private resetDate: Date = new Date(),
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, platform.config.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, platform.config.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, platform.config.serial);

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */
    this.outletService = this.accessory.getService(this.platform.Service.Outlet) || this.accessory.addService(this.platform.Service.Outlet);
    // register handlers for the On/Off Characteristic
    this.outletService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below
    this.outletService.getCharacteristic(TotalPowerConsumption)
      .onGet(this.getEnergy.bind(this));       // GET - bind to the 'getEnergy` method below
    this.outletService.getCharacteristic(CurrentPowerConsumption)
      .onGet(this.getWatt.bind(this));       // GET - bind to the 'getWatt` method below
    this.outletService.getCharacteristic(ResetTotalPowerConsumption)
      .onGet(this.getResetEnergy.bind(this))       // GET - bind to the 'getResetEnergy` method below
      .onSet(this.setResetEnergy.bind(this));
    this.outletService.getCharacteristic(Volt)
      .onGet(this.getVoltage.bind(this));       // GET - bind to the 'getVoltage` method below
    this.outletService.getCharacteristic(Ampere)
      .onGet(this.getAmpere.bind(this));       // GET - bind to the 'getAmpere` method below

    // Add FakeGato history service
    this.historyService = new this.platform.FakeGatoHistoryService ('energy', this.accessory, {log:this.platform.log, storage:'fs'});

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */

    setInterval(() => {
      // timestamp
      const moment = Math.round(new Date().valueOf() / 1000);

      // check if inverter is in normal operating state or throttling (clipping)
      const onvalue = this.platform.modbus_values[40107-this.platform.sunspec_inverter_start];
      const isOn:boolean = onvalue==4 || onvalue==5;
      this.outletService.updateCharacteristic(this.platform.Characteristic.On, isOn);

      // reset kWh meter every day
      const mytime = new Date();
      if (mytime.getHours()==0 && mytime.getMinutes()==0 && mytime.getSeconds()<=this.platform.config.pollFrequency/1000) {
        // update mqtt with daily totals
        if (this.platform.mqttclient) {
          this.platform.mqttclient.publish ('SolarEdge/'+this.acdc+'PowerDaily', this.kWh.toString());
        }

        this.resetDate = mytime;
        this.kWh = 0;
      }
      if (mytime.getMinutes()==0 && mytime.getSeconds()<=this.platform.config.pollFrequency/1000) {
        // update mqtt with hourly increments
        if (this.platform.mqttclient) {
          this.platform.mqttclient.publish ('SolarEdge/'+this.acdc+'PowerHourly', this.kWh.toString());
        }

      }

      if (this.acdc=='AC') {
        // collect all specific AC values
        // power
        const wsf:number = this.platform.modbus_values[40084-this.platform.sunspec_inverter_start];
        const watt = this.platform.modbus_values[40083-this.platform.sunspec_inverter_start]*Math.pow(10, wsf-65536);
        this.outletService.updateCharacteristic(CurrentPowerConsumption, watt);
        this.historyService.addEntry ({time:moment, power: watt});
        // calculate kWh produced this polling time
        this.kWh += watt/(60*60*1000/this.platform.config.pollFrequency)/1000;
        this.outletService.updateCharacteristic(TotalPowerConsumption, this.kWh);
        // voltage
        const vsf:number = this.platform.modbus_values[40082-this.platform.sunspec_inverter_start];
        const volt = this.platform.modbus_values[40076-this.platform.sunspec_inverter_start]*Math.pow(10, vsf-65536);
        this.outletService.updateCharacteristic(Volt, volt);
        // ampere
        const asf:number = this.platform.modbus_values[40075-this.platform.sunspec_inverter_start];
        const ampere = this.platform.modbus_values[40071-this.platform.sunspec_inverter_start]*Math.pow(10, asf-65536);
        this.outletService.updateCharacteristic(Ampere, ampere);
        // update mqtt
        if (this.platform.mqttclient) {
          this.platform.mqttclient.publish ('SolarEdge/ACPower', watt.toString());
        }
      } else {
        // collect all specific DC values
        // power
        const wsf:number = this.platform.modbus_values[40101-this.platform.sunspec_inverter_start];
        const watt = this.platform.modbus_values[40100-this.platform.sunspec_inverter_start]*Math.pow(10, wsf-65536);
        this.outletService.updateCharacteristic(CurrentPowerConsumption, watt);
        this.historyService.addEntry ({time:moment, power: watt});
        // calculate kWh produced this polling time
        this.kWh += watt/(60*60*1000/this.platform.config.pollFrequency)/1000;
        this.outletService.updateCharacteristic(TotalPowerConsumption, this.kWh);
        // voltage
        const vsf:number = this.platform.modbus_values[40099-this.platform.sunspec_inverter_start];
        const volt = this.platform.modbus_values[40098-this.platform.sunspec_inverter_start]*Math.pow(10, vsf-65536);
        this.outletService.updateCharacteristic(Volt, volt);
        // ampere
        const asf:number = this.platform.modbus_values[40097-this.platform.sunspec_inverter_start];
        const ampere = this.platform.modbus_values[40096-this.platform.sunspec_inverter_start]*Math.pow(10, asf-65536);
        this.outletService.updateCharacteristic(Ampere, ampere);
        // update mqtt
        if (this.platform.mqttclient) {
          this.platform.mqttclient.publish ('SolarEdge/DCPower', watt.toString());
        }
      }
    }, this.platform.config.pollFrequency);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    const onvalue = this.platform.modbus_values[40107-this.platform.sunspec_inverter_start];
    const isOn:boolean = onvalue==4 || onvalue==5;
    this.platform.log.debug('Get Characteristic On ->', isOn);
    return isOn;
  }

  async getWatt(): Promise<CharacteristicValue> {
    const wsf:number = this.acdc=='AC' ?
      this.platform.modbus_values[40084-this.platform.sunspec_inverter_start]:
      this.platform.modbus_values[40101-this.platform.sunspec_inverter_start];
    const watt = this.acdc=='AC' ?
      this.platform.modbus_values[40083-this.platform.sunspec_inverter_start]*Math.pow(10, wsf-65536):
      this.platform.modbus_values[40100-this.platform.sunspec_inverter_start]*Math.pow(10, wsf-65536);
    this.platform.log.debug('Get Characteristic Watt ->', watt);
    return watt;
  }

  async getEnergy(): Promise<CharacteristicValue> {
    const energy = this.kWh;
    this.platform.log.debug('Get Characteristic Energy ->', energy);
    return energy;
  }

  async getVoltage(): Promise<CharacteristicValue> {
    const vsf:number = this.acdc=='AC' ?
      this.platform.modbus_values[40082-this.platform.sunspec_inverter_start]:
      this.platform.modbus_values[40099-this.platform.sunspec_inverter_start];
    const volt = this.acdc=='AC' ?
      this.platform.modbus_values[40076-this.platform.sunspec_inverter_start]*Math.pow(10, vsf-65536):
      this.platform.modbus_values[40098-this.platform.sunspec_inverter_start]*Math.pow(10, vsf-65536);
    this.platform.log.debug('Get Characteristic Voltage ->', volt);
    return volt;
  }

  async getAmpere(): Promise<CharacteristicValue> {
    const asf:number = this.acdc=='AC' ?
      this.platform.modbus_values[40075-this.platform.sunspec_inverter_start] :
      this.platform.modbus_values[40097-this.platform.sunspec_inverter_start];
    const ampere = this.acdc=='AC' ?
      this.platform.modbus_values[40071-this.platform.sunspec_inverter_start]*Math.pow(10, asf-65536):
      this.platform.modbus_values[40096-this.platform.sunspec_inverter_start]*Math.pow(10, asf-65536);
    this.platform.log.debug('Get Characteristic Ampere ->', ampere);
    return ampere;
  }

  async getResetEnergy(): Promise<CharacteristicValue> {
    const secs_since_epoch:number = Math.round(this.resetDate.getTime()/1000);
    const secs_since_eve:number = Math.round(new Date ('2001-01-01T00:00:00Z').getTime()/1000);
    const resetenergy = secs_since_epoch - secs_since_eve;
    this.platform.log.debug('Get Characteristic Reset Energy ->', resetenergy);
    return resetenergy;
  }

  async setResetEnergy(value: CharacteristicValue): Promise<void> {
    this.kWh = 0;
    this.resetDate = new Date();
    this.platform.log.debug('Reset Characteristic Reset Energy');
  }
}
